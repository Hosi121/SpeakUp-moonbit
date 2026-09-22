#define _GNU_SOURCE
#include <moonbit.h>
#include <mariadb/mysql.h>
#include <openssl/evp.h>
#include <openssl/pem.h>
#include <openssl/rand.h>
#include <openssl/hmac.h>
#include <pthread.h>
#include <unistd.h>
#include <fcntl.h>
#include <errno.h>
#include <time.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <stdint.h>

// Foreign threads own only malloc memory and Connector/C objects. MoonBit
// objects are copied before submission; completion is observed through a pipe.
static void *alloc(size_t n) { void *p = calloc(1, n ? n : 1); if (!p) abort(); return p; }
static char *copy_bytes(const uint8_t *s) {
  size_t n = Moonbit_array_length(s); char *p = alloc(n + 1); memcpy(p, s, n); return p;
}
static moonbit_bytes_t bytes(const void *s, size_t n) {
  moonbit_bytes_t p = moonbit_make_bytes((int32_t)n, 0); if (n) memcpy(p, s, n); return p;
}
static moonbit_bytes_t text(const char *s) { return bytes(s, strlen(s)); }

void su_bootstrap(void) { setvbuf(stdout,NULL,_IOLBF,0); if(mysql_library_init(0,NULL,NULL)) abort(); }

typedef struct { int kind; char *data; unsigned long len; double number; } Param;
typedef struct { char *sql; int count; Param *params; } Statement;
typedef struct { char *data; unsigned long len; int null; } Cell;
typedef struct {
  MYSQL *mysql; char *host, *user, *password, *database; unsigned port;
  pthread_t thread; pthread_mutex_t mutex; pthread_cond_t cond;
  int pipefd[2], pending, stopping, transaction, error;
  Statement *statements; int statement_count;
  char **names; int *numeric; Cell *cells; int cols, rows; size_t capacity, result_size;
  double affected, insert_id;
} Database;

static void clear_result(Database *d) {
  for (int i=0; i<d->cols; i++) free(d->names[i]);
  for (int i=0; i<d->rows*d->cols; i++) free(d->cells[i].data);
  free(d->names); free(d->numeric); free(d->cells);
  d->names=NULL; d->numeric=NULL; d->cells=NULL;
  d->cols=d->rows=0; d->capacity=d->result_size=0; d->affected=d->insert_id=0;
}
static void clear_statements(Database *d) {
  for (int i=0; i<d->statement_count; i++) {
    Statement *s=&d->statements[i];
    free(s->sql); for (int j=0; j<s->count; j++) free(s->params[j].data);
    free(s->params);
  }
  free(d->statements); d->statements=NULL; d->statement_count=0;
}
static int connect_db(Database *d) {
  if (d->mysql) return 1;
  MYSQL *m=mysql_init(NULL); if (!m) return 0;
  unsigned timeout=5;
  mysql_options(m, MYSQL_OPT_CONNECT_TIMEOUT, &timeout);
  mysql_options(m, MYSQL_OPT_READ_TIMEOUT, &timeout);
  mysql_options(m, MYSQL_OPT_WRITE_TIMEOUT, &timeout);
  mysql_options(m, MYSQL_SET_CHARSET_NAME, "utf8mb4");
  // Explicit TLS verification when a CA is configured; Connector/C also handles
  // MySQL 8 caching_sha2_password. Never enable multi-statements or LOCAL INFILE.
  const char *ca=getenv("MYSQL_SSL_CA");
  if (ca && *ca) { my_bool yes=1; mysql_options(m, MYSQL_OPT_SSL_CA, ca); mysql_options(m, MYSQL_OPT_SSL_VERIFY_SERVER_CERT, &yes); mysql_options(m, MYSQL_OPT_SSL_ENFORCE, &yes); }
  unsigned local=0; mysql_options(m, MYSQL_OPT_LOCAL_INFILE, &local);
  const char *plugin=getenv("MYSQL_PLUGIN_DIR"); if (plugin) mysql_options(m, MYSQL_PLUGIN_DIR, plugin);
  if (!mysql_real_connect(m,d->host,d->user,d->password,d->database,d->port,NULL,CLIENT_FOUND_ROWS)) { d->error=mysql_errno(m); mysql_close(m); return 0; }
  if (mysql_query(m,"SET time_zone = '+00:00'")) { d->error=mysql_errno(m); mysql_close(m); return 0; }
  d->mysql=m; return 1;
}
static int execute_statement(Database *d, Statement *s) {
  MYSQL_STMT *stmt=mysql_stmt_init(d->mysql); if (!stmt) return 0;
  MYSQL_BIND *bind=alloc(sizeof(MYSQL_BIND)*s->count);
  MYSQL_RES *meta=NULL; MYSQL_BIND *out=NULL; unsigned long *lengths=NULL; my_bool *nulls=NULL;
  int ok=0;
  if (mysql_stmt_prepare(stmt,s->sql,strlen(s->sql))) goto done;
  if (mysql_stmt_param_count(stmt)!=(unsigned long)s->count) { d->error=1; goto done; }
  for (int i=0;i<s->count;i++) {
    Param *p=&s->params[i];
    if (p->kind==0) bind[i].buffer_type=MYSQL_TYPE_NULL;
    else if(p->kind==1) { bind[i].buffer_type=MYSQL_TYPE_DOUBLE; bind[i].buffer=&p->number; }
    else { bind[i].buffer_type=MYSQL_TYPE_STRING; bind[i].buffer=p->data; bind[i].buffer_length=p->len; bind[i].length=&p->len; }
  }
  if (s->count && mysql_stmt_bind_param(stmt,bind)) goto done;
  if (mysql_stmt_execute(stmt)) goto done;
  clear_result(d);
  meta=mysql_stmt_result_metadata(stmt);
  if (!meta) { d->affected=(double)mysql_stmt_affected_rows(stmt); d->insert_id=(double)mysql_stmt_insert_id(stmt); ok=1; goto done; }
  d->cols=(int)mysql_num_fields(meta);
  d->names=alloc(sizeof(char*)*d->cols); d->numeric=alloc(sizeof(int)*d->cols);
  out=alloc(sizeof(MYSQL_BIND)*d->cols); lengths=alloc(sizeof(unsigned long)*d->cols); nulls=alloc(sizeof(my_bool)*d->cols);
  MYSQL_FIELD *fields=mysql_fetch_fields(meta);
  for (int i=0;i<d->cols;i++) {
    d->names[i]=strdup(fields[i].name);
    enum enum_field_types t=fields[i].type;
    d->numeric[i]=(t==MYSQL_TYPE_TINY || t==MYSQL_TYPE_SHORT || t==MYSQL_TYPE_LONG || t==MYSQL_TYPE_LONGLONG || t==MYSQL_TYPE_INT24 || t==MYSQL_TYPE_FLOAT || t==MYSQL_TYPE_DOUBLE || t==MYSQL_TYPE_YEAR);
    // Connector/C needs a real initial buffer to compute numeric-to-text
    // lengths. A NULL/zero buffer can report length zero for DOUBLE values.
    out[i].buffer_type=MYSQL_TYPE_STRING; out[i].buffer=alloc(64); out[i].buffer_length=64; out[i].length=&lengths[i]; out[i].is_null=&nulls[i];
  }
  if (mysql_stmt_bind_result(stmt,out)) goto done;
  // Fetch incrementally; do not buffer an unbounded result inside Connector/C.
  for (;;) {
    int status=mysql_stmt_fetch(stmt);
    if (status==MYSQL_NO_DATA) { ok=1; break; }
    if (status && status!=MYSQL_DATA_TRUNCATED) goto done;
    if (d->rows>=10000) { d->error=1; goto done; }
    size_t need=(size_t)(d->rows+1)*d->cols;
    if (need>d->capacity) { size_t cap=need*2; Cell *next=realloc(d->cells,cap*sizeof(Cell)); if(!next) abort(); d->cells=next; memset(next+d->capacity,0,(cap-d->capacity)*sizeof(Cell)); d->capacity=cap; }
    int row=d->rows++;
    for(int i=0;i<d->cols;i++) {
      Cell *c=&d->cells[row*d->cols+i]; c->null=nulls[i]; c->len=lengths[i];
      if (c->null) continue;
      d->result_size+=c->len;
      if (d->result_size>16*1024*1024) { d->error=1; goto done; }
      c->data=alloc(c->len+1); MYSQL_BIND col={0};
      col.buffer_type=MYSQL_TYPE_STRING; col.buffer=c->data; col.buffer_length=c->len+1;
      if (mysql_stmt_fetch_column(stmt,&col,i,0)) goto done;
    }
  }
done:
  if (!ok && !d->error) d->error=mysql_stmt_errno(stmt) ? mysql_stmt_errno(stmt) : 1;
  if (meta) mysql_free_result(meta);
  free(bind); if(out) { for(int i=0;i<d->cols;i++) free(out[i].buffer); } free(out); free(lengths); free(nulls); mysql_stmt_close(stmt);
  return ok;
}
static void *worker(void *arg) {
  Database *d=arg; mysql_thread_init();
  pthread_mutex_lock(&d->mutex);
  for (;;) {
    while (!d->pending && !d->stopping) pthread_cond_wait(&d->cond,&d->mutex);
    if (d->stopping) break;
    pthread_mutex_unlock(&d->mutex);
    d->error=0;
    int ok=connect_db(d);
    if (ok && d->transaction && mysql_query(d->mysql,"START TRANSACTION")) { d->error=mysql_errno(d->mysql); ok=0; }
    for (int i=0;ok && i<d->statement_count;i++) ok=execute_statement(d,&d->statements[i]);
    if (d->transaction && d->mysql) {
      if (ok) { if(mysql_commit(d->mysql)) { d->error=mysql_errno(d->mysql); ok=0; mysql_rollback(d->mysql); } }
      else mysql_rollback(d->mysql);
    }
    if (!ok) {
      if (!d->error) d->error=1;
      // Never retry an uncertain write; next request may establish a fresh session.
      if (d->mysql) { mysql_close(d->mysql); d->mysql=NULL; }
    }
    pthread_mutex_lock(&d->mutex); d->pending=0; pthread_mutex_unlock(&d->mutex);
    uint8_t done=1; while (write(d->pipefd[1],&done,1)<0 && errno==EINTR) {}
    pthread_mutex_lock(&d->mutex);
  }
  pthread_mutex_unlock(&d->mutex);
  if(d->mysql) mysql_close(d->mysql);
  mysql_thread_end(); return NULL;
}
void *su_db_new(const uint8_t *host,const uint8_t *user,const uint8_t *pass,const uint8_t *name,int32_t port) {
  Database *d=alloc(sizeof(*d));
  d->host=copy_bytes(host); d->user=copy_bytes(user); d->password=copy_bytes(pass); d->database=copy_bytes(name); d->port=port;
  if (pipe2(d->pipefd,O_CLOEXEC)) abort();
  fcntl(d->pipefd[0],F_SETFL,O_NONBLOCK);
  pthread_mutex_init(&d->mutex,NULL); pthread_cond_init(&d->cond,NULL);
  if(pthread_create(&d->thread,NULL,worker,d)) abort();
  return d;
}
int32_t su_db_fd(Database *d) { return d->pipefd[0]; }
void su_db_reset(Database *d,int32_t count,int32_t transaction) {
  clear_statements(d); clear_result(d); d->transaction=transaction;
  d->statement_count=count; d->statements=alloc(sizeof(Statement)*count);
}
void su_db_statement(Database *d,int32_t index,const uint8_t *sql,int32_t count) {
  Statement *s=&d->statements[index]; s->sql=copy_bytes(sql); s->count=count; s->params=alloc(sizeof(Param)*count);
}
void su_db_param(Database *d,int32_t index,int32_t col,int32_t kind,const uint8_t *data,double number) {
  Param *p=&d->statements[index].params[col]; p->kind=kind; p->data=copy_bytes(data); p->len=Moonbit_array_length(data); p->number=number;
}
void su_db_submit(Database *d) { pthread_mutex_lock(&d->mutex); d->pending=1; pthread_cond_signal(&d->cond); pthread_mutex_unlock(&d->mutex); }
// Acquire/release pairs synchronize the completed result with the foreign worker.
int32_t su_db_error(Database *d) { pthread_mutex_lock(&d->mutex); int e=d->error; pthread_mutex_unlock(&d->mutex); return e; }
int32_t su_db_rows(Database *d) { return d->rows; }
int32_t su_db_cols(Database *d) { return d->cols; }
int32_t su_db_numeric(Database *d,int32_t col) { return d->numeric[col]; }
int32_t su_db_null(Database *d,int32_t row,int32_t col) { return d->cells[row*d->cols+col].null; }
moonbit_bytes_t su_db_name(Database *d,int32_t col) { return text(d->names[col]); }
moonbit_bytes_t su_db_cell(Database *d,int32_t row,int32_t col) { Cell *c=&d->cells[row*d->cols+col]; return bytes(c->data,c->len); }
double su_db_affected(Database *d) { return d->affected; }
double su_db_insert_id(Database *d) { return d->insert_id; }
void su_db_close(Database *d) {
  pthread_mutex_lock(&d->mutex); d->stopping=1; pthread_cond_signal(&d->cond); pthread_mutex_unlock(&d->mutex);
  pthread_join(d->thread,NULL); close(d->pipefd[1]); // read end belongs to RawFd
  clear_statements(d); clear_result(d); free(d->host); free(d->user);
  OPENSSL_cleanse(d->password,strlen(d->password)); free(d->password); free(d->database);
  pthread_mutex_destroy(&d->mutex); pthread_cond_destroy(&d->cond); free(d);
}

typedef struct { EVP_PKEY *private_key, *public_key; } Keys;
void *su_keys(const uint8_t *private_pem,const uint8_t *public_pem,int32_t development) {
  Keys *k=alloc(sizeof(*k));
  if (Moonbit_array_length(private_pem) && Moonbit_array_length(public_pem)) {
    BIO *b=BIO_new_mem_buf(private_pem,Moonbit_array_length(private_pem)); k->private_key=PEM_read_bio_PrivateKey(b,NULL,NULL,NULL); BIO_free(b);
    b=BIO_new_mem_buf(public_pem,Moonbit_array_length(public_pem)); k->public_key=PEM_read_bio_PUBKEY(b,NULL,NULL,NULL); BIO_free(b);
  } else if(development) {
    EVP_PKEY_CTX *c=EVP_PKEY_CTX_new_id(EVP_PKEY_RSA,NULL);
    if(c && EVP_PKEY_keygen_init(c)>0 && EVP_PKEY_CTX_set_rsa_keygen_bits(c,2048)>0 && EVP_PKEY_keygen(c,&k->private_key)>0) { k->public_key=k->private_key; EVP_PKEY_up_ref(k->public_key); }
    EVP_PKEY_CTX_free(c);
  }
  if (!k->private_key || !k->public_key || EVP_PKEY_base_id(k->private_key)!=EVP_PKEY_RSA || EVP_PKEY_base_id(k->public_key)!=EVP_PKEY_RSA || EVP_PKEY_bits(k->public_key)<2048 || EVP_PKEY_eq(k->private_key,k->public_key)!=1) {
    EVP_PKEY_free(k->private_key); EVP_PKEY_free(k->public_key); k->private_key=k->public_key=NULL;
  }
  return k;
}
int32_t su_keys_ready(Keys *k) { return k->private_key!=NULL; }
void su_keys_close(Keys *k) { EVP_PKEY_free(k->private_key); EVP_PKEY_free(k->public_key); free(k); }
moonbit_bytes_t su_sign(Keys *k,const uint8_t *data) {
  if(!k->private_key) return bytes(NULL,0);
  EVP_MD_CTX *c=EVP_MD_CTX_new(); size_t n=0; unsigned char *sig=NULL;
  if(c && EVP_DigestSignInit(c,NULL,EVP_sha256(),NULL,k->private_key)>0 && EVP_DigestSign(c,NULL,&n,data,Moonbit_array_length(data))>0) {
    sig=alloc(n); if(EVP_DigestSign(c,sig,&n,data,Moonbit_array_length(data))<=0) n=0;
  }
  moonbit_bytes_t result=bytes(sig,n); free(sig); EVP_MD_CTX_free(c); return result;
}
int32_t su_verify(Keys *k,const uint8_t *data,const uint8_t *signature) {
  if(!k->public_key) return 0;
  EVP_MD_CTX *c=EVP_MD_CTX_new(); int ok=c && EVP_DigestVerifyInit(c,NULL,EVP_sha256(),NULL,k->public_key)>0 && EVP_DigestVerify(c,signature,Moonbit_array_length(signature),data,Moonbit_array_length(data))==1;
  EVP_MD_CTX_free(c); return ok;
}
moonbit_bytes_t su_hmac(const uint8_t *key,const uint8_t *data) {
  unsigned char out[EVP_MAX_MD_SIZE]; unsigned n=0;
  if(!HMAC(EVP_sha1(),key,Moonbit_array_length(key),data,Moonbit_array_length(data),out,&n)) return bytes(NULL,0);
  return bytes(out,n);
}
moonbit_bytes_t su_random(void) { unsigned char b[16]; if(RAND_bytes(b,16)!=1) abort(); return bytes(b,16); }
double su_now(void) { struct timespec t; clock_gettime(CLOCK_REALTIME,&t); return (double)t.tv_sec*1000+(double)(t.tv_nsec/1000000); }
moonbit_bytes_t su_datetime(double ms) { time_t seconds=(time_t)(ms/1000); struct tm t; char out[32]; if(!gmtime_r(&seconds,&t)) return text(""); strftime(out,sizeof(out),"%Y-%m-%d %H:%M:%S",&t); return text(out); }
// The accepted grammar is validated in MoonBit. timegm's rollover is explicitly
// rejected before applying the user's timezone offset.
double su_date(int32_t y,int32_t m,int32_t day,int32_t h,int32_t min,int32_t sec) {
  struct tm t={.tm_year=y-1900,.tm_mon=m-1,.tm_mday=day,.tm_hour=h,.tm_min=min,.tm_sec=sec};
  time_t v=timegm(&t);
  if(t.tm_year!=y-1900 || t.tm_mon!=m-1 || t.tm_mday!=day || t.tm_hour!=h || t.tm_min!=min || t.tm_sec!=sec) return -1;
  return (double)v*1000;
}
