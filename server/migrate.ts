import { readFile } from 'node:fs/promises';
import { getPool, closePool } from './host.ts';
const sql = (await readFile(new URL('./schema.sql', import.meta.url), 'utf8')).replace(/^--.*$/gm, '');
try { for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await getPool().query(statement); }
finally { await closePool(); }
