import { getPool, closePool } from './host.ts';
if (process.env.AUTH_MODE !== 'development') throw new Error('Seed requires AUTH_MODE=development');
try {
  await getPool().execute("INSERT IGNORE INTO users(id,username,email,role) VALUES (1,'Alice','alice@example.test','ADMIN'),(2,'Bob','bob@example.test','USER')");
  await getPool().execute("INSERT IGNORE INTO ai_themes(id,theme_text,topic1,topic2,topic3) VALUES(1,'好きな食べ物','朝食','昼食','夕食')");
  await getPool().execute("INSERT IGNORE INTO events(id,event_start,event_end,theme_id) VALUES(1,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE),1)");
  await getPool().execute('INSERT IGNORE INTO event_records(event_id,user_id) VALUES(1,1),(1,2)');
  await getPool().execute('INSERT IGNORE INTO rooms(id,event_id,round,user_a,user_b) VALUES(1,1,1,1,2)');
} finally { await closePool(); }
