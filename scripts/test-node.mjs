import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Partition the existing suite; new files default to the DB-free unit job.
const database = new Set(['integration.test.mjs', 'features.test.mjs', 'migration.test.mjs']);
const mode = process.argv[2];
if (mode !== 'unit' && mode !== 'database') throw new Error('Expected unit or database');
const files = readdirSync('tests').filter(file => file.endsWith('.test.mjs')).sort();
for (const file of database) if (!files.includes(file)) throw new Error(`Missing database test: ${file}`);
const selected = files.filter(file => database.has(file) === (mode === 'database'));
if (!selected.length) throw new Error(`No ${mode} tests found`);
const result = spawnSync(process.execPath, ['--test', ...selected.map(file => `tests/${file}`)], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
