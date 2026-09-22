#define _GNU_SOURCE
#include <moonbit.h>
#include <openssl/evp.h>
#include <openssl/pem.h>
#include <openssl/rand.h>
#include <openssl/hmac.h>
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
static moonbit_bytes_t bytes(const void *s, size_t n) {
  moonbit_bytes_t p = moonbit_make_bytes((int32_t)n, 0); if (n) memcpy(p, s, n); return p;
}
static moonbit_bytes_t text(const char *s) { return bytes(s, strlen(s)); }

void su_bootstrap(void) { setvbuf(stdout,NULL,_IOLBF,0); }

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
