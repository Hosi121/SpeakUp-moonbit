import { readFile } from 'node:fs/promises';
import { getPool, closePool } from './host.ts';
import type { RowDataPacket } from 'mysql2/promise';
const sql = (await readFile(new URL('./schema.sql', import.meta.url), 'utf8')).replace(/^--.*$/gm, '');
try {
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await getPool().query(statement);
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute('INSERT IGNORE INTO schema_migrations(version) VALUES (0)');
    await connection.execute('SELECT version FROM schema_migrations WHERE version=0 FOR UPDATE');
    const [done] = await connection.execute<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=2');
    if (!done.length) {
      const [unknownTimes] = await connection.execute<RowDataPacket[]>("SELECT id FROM rooms WHERE status='FINISHED' LIMIT 1");
      if (unknownTimes.length) throw new Error('Legacy finished rooms have no timestamps; review their history before migration. No rows were changed.');
      await connection.execute('INSERT INTO conversations(id,event_id,round_no) SELECT id,event_id,round FROM rooms');
      await connection.execute('INSERT INTO conversation_members(conversation_id,event_id,round_no,user_id,seat) SELECT id,event_id,round,LEAST(user_a,user_b),0 FROM rooms UNION ALL SELECT id,event_id,round,GREATEST(user_a,user_b),1 FROM rooms');
      await connection.execute('INSERT IGNORE INTO event_match_runs(event_id) SELECT DISTINCT event_id FROM rooms');
      await connection.execute('INSERT INTO event_match_publications(event_id) SELECT DISTINCT event_id FROM rooms');
      await connection.execute('INSERT INTO schema_migrations(version) VALUES (2)');
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
finally { await closePool(); }
