import { readFile } from 'node:fs/promises';
import { getPool, closePool } from './host.ts';
import type { RowDataPacket } from 'mysql2/promise';
const sql = (await readFile(new URL('./schema.sql', import.meta.url), 'utf8')).replace(/^--.*$/gm, '');
try {
  for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await getPool().query(statement);
  const [expiryIndex] = await getPool().execute<RowDataPacket[]>("SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='conversations' AND index_name='conversation_expiry' LIMIT 1");
  if (!expiryIndex.length) {
    // DDL commits implicitly, so complete it before the data migration transaction.
    try { await getPool().query('ALTER TABLE conversations ADD INDEX conversation_expiry(ended_at,cancelled_at,started_at,event_id)'); }
    catch (error) {
      if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'ER_DUP_KEYNAME') throw error;
    }
  }
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
    const [socialDone] = await connection.execute<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=3');
    if (!socialDone.length) {
      // Preserve blocks. A one-way legacy FRIEND row is an invitation, not consent.
      await connection.execute(`INSERT INTO friendships(low_user_id,high_user_id,requested_by,status)
        SELECT LEAST(f.user_id,f.target_user_id),GREATEST(f.user_id,f.target_user_id),
          MIN(f.user_id), CASE WHEN SUM(f.status='BLOCKED')>0 THEN 'BLOCKED'
            WHEN SUM(f.status='FRIEND')=2 THEN 'FRIEND' ELSE 'PENDING' END
        FROM friends f WHERE f.user_id<>f.target_user_id
        GROUP BY LEAST(f.user_id,f.target_user_id),GREATEST(f.user_id,f.target_user_id)`);
      await connection.execute(`INSERT INTO notifications(user_id,actor_id,event_key,kind)
        SELECT IF(requested_by=low_user_id,high_user_id,low_user_id),requested_by,
          CONCAT('friend:',low_user_id,':',high_user_id,':1'),'friend_request'
        FROM friendships WHERE status='PENDING'`);
      await connection.execute('INSERT INTO schema_migrations(version) VALUES (3)');
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
finally { await closePool(); }
