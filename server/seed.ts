import { getPool, closePool } from './host.ts';
if (process.env.AUTH_MODE !== 'development') throw new Error('Seed requires AUTH_MODE=development');
try {
  await getPool().execute("INSERT IGNORE INTO users(id,username,email,role) VALUES (1,'Alice','alice@example.test','ADMIN'),(2,'Bob','bob@example.test','USER')");
  await getPool().execute("INSERT IGNORE INTO ai_themes(id,theme_text,topic1,topic2,topic3) VALUES(1,'好きな食べ物','朝食','昼食','夕食')");
  await getPool().execute("INSERT IGNORE INTO events(id,event_start,event_end,theme_id) VALUES(1,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE),1)");
  await getPool().execute('INSERT IGNORE INTO event_records(event_id,user_id) VALUES(1,1),(1,2)');
  await getPool().execute('INSERT IGNORE INTO conversations(id,event_id,round_no) VALUES(1,1,1)');
  await getPool().execute('INSERT IGNORE INTO conversation_members(conversation_id,event_id,round_no,user_id,seat) VALUES(1,1,1,1,0),(1,1,1,2,1)');
  await getPool().execute('INSERT IGNORE INTO event_match_runs(event_id) VALUES(1)');
  await getPool().execute('INSERT IGNORE INTO event_match_publications(event_id) VALUES(1)');
} finally { await closePool(); }
