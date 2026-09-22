import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';

const exec = promisify(execFile);
// Fixture is server/schema.sql from port commit 9a2aa3d6707416a33699fdef2de33677b330843b.
// Each case owns a randomly named database; the application database is never reset.
async function withDatabase(work) {
  const url = new URL(process.env.TEST_MYSQL_ADMIN_URL ?? 'mysql://root:speakup-root-local-only@127.0.0.1:3308/');
  const admin = await mysql.createConnection(url.toString());
  const name = `speakup_migration_${randomUUID().replaceAll('-', '')}`;
  let db, created = false;
  try {
    await admin.query(`CREATE DATABASE \`${name}\``); created = true;
    url.pathname = `/${name}`;
    db = await mysql.createConnection(url.toString());
    const schema = (await readFile(new URL('./fixtures/port-v1-schema.sql', import.meta.url), 'utf8')).replace(/^--.*$/gm, '');
    for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) await db.query(statement);
    await db.query("INSERT INTO users(id,username,email) VALUES(1,'Alice','a@example.test'),(2,'Bob','b@example.test'),(3,'Carol','c@example.test')");
    await db.query("INSERT INTO ai_themes VALUES(1,'Migration','','','')");
    await db.query('INSERT INTO events VALUES(1,UTC_TIMESTAMP(),UTC_TIMESTAMP(),1)');
    const migrate = () => exec(process.execPath, ['server/migrate.ts'], { env: { ...process.env, DATABASE_URL: url.toString(), AUTH_MODE: 'development' }, timeout: 10000 });
    await work(db, migrate);
  } finally {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE \`${name}\``);
    await admin.end();
  }
}

test('port v1 rooms migrate with stable IDs and canonical members, and reruns preserve completed history', () => withDatabase(async (db, migrate) => {
  await db.query('INSERT INTO rooms(id,event_id,round,user_a,user_b) VALUES(41,1,1,2,1)');
  await migrate();
  const [members] = await db.query('SELECT conversation_id,user_id,seat FROM conversation_members ORDER BY seat');
  assert.deepEqual(members.map(row => ({ ...row })), [{ conversation_id: 41, user_id: 1, seat: 0 }, { conversation_id: 41, user_id: 2, seat: 1 }]);
  assert.equal((await db.query('SELECT event_id FROM event_match_publications'))[0][0].event_id, 1);
  await db.query('UPDATE conversations SET started_at=1000,ended_at=2000,revision=2 WHERE id=41');
  await migrate();
  const [calls] = await db.query('SELECT id,started_at,ended_at,revision FROM conversations');
  assert.deepEqual({ ...calls[0] }, { id: 41, started_at: 1000, ended_at: 2000, revision: 2 });
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM rooms'))[0][0].n, 1);
}));

test('ambiguous legacy finished timestamps stop migration without fabricating learning history', () => withDatabase(async (db, migrate) => {
  await db.query("INSERT INTO rooms(id,event_id,round,user_a,user_b,status) VALUES(41,1,1,1,2,'FINISHED')");
  await assert.rejects(migrate(), error => error.stderr.includes('Legacy finished rooms have no timestamps'));
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM conversations'))[0][0].n, 0);
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM schema_migrations WHERE version=2'))[0][0].n, 0);
  assert.equal((await db.query('SELECT status FROM rooms'))[0][0].status, 'FINISHED');
}));

test('cross-seat double bookings accepted by the old schema roll back the entire new migration', () => withDatabase(async (db, migrate) => {
  await db.query('INSERT INTO rooms(id,event_id,round,user_a,user_b) VALUES(41,1,1,1,2),(42,1,1,2,3)');
  await assert.rejects(migrate(), error => error.stderr.includes('Duplicate entry'));
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM conversations'))[0][0].n, 0);
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM conversation_members'))[0][0].n, 0);
  assert.equal((await db.query('SELECT COUNT(*) AS n FROM rooms'))[0][0].n, 2);
}));
