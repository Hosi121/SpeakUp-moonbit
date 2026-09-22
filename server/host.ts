import mysql, { type Pool, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { generateKeyPair, importPKCS8, importSPKI, SignJWT, jwtVerify } from 'jose';
import type { dispatch as Dispatch, now as Now, nowMillis as NowMillis, eventTimes as EventTimes, publicUrl as PublicUrl } from '../bindings/host.js';

type SqlValue = string | number | boolean | null;
type Statement = { sql: string; params: SqlValue[] };
type ObjectValue = Record<string, unknown>;
let pool: Pool | undefined;
export function getPool(): Pool {
  return pool ??= mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 10,
    timezone: 'Z', dateStrings: true, enableKeepAlive: true, multipleStatements: false });
}
export function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
  return value as ObjectValue;
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('string required');
  return value;
}
function statement(value: unknown): Statement {
  const s = object(value);
  if (!Array.isArray(s.params)) throw new Error('parameters required');
  const params = s.params.map((v: unknown): SqlValue => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return v;
    throw new Error('invalid SQL parameter');
  });
  return { sql: text(s.sql), params };
}
export const now: typeof Now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
export const nowMillis: typeof NowMillis = () => Date.now();
export const publicUrl: typeof PublicUrl = value => value === '' || /^https?:\/\//.test(value)
  ? value : `${process.env.PUBLIC_ORIGIN ?? 'http://localhost:8081'}${value}`;
export const eventTimes: typeof EventTimes = value => {
  // Legacy Go accepted timezone-less values as UTC. Date alone is rejected.
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) return '';
  const normal = value.replace(' ', 'T');
  const date = new Date(/[Z+-]\d{0,2}(?::\d{2})?$/.test(normal.slice(10)) ? normal : normal + 'Z');
  if (!Number.isFinite(date.getTime())) return '';
  // Reject JS date rollover (Feb 30, 24:00) before timezone normalization.
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(normal);
  if (!parts) return '';
  const [, y, m, d, h, min, sec] = parts;
  const check = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (check.getUTCMonth() !== Number(m) - 1 || check.getUTCDate() !== Number(d) || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59) return '';
  const sqlDate = (v: Date) => v.toISOString().slice(0, 19).replace('T', ' ');
  return JSON.stringify({ start: sqlDate(date), end: sqlDate(new Date(date.getTime() + 30 * 60_000)) });
};

const keys = (async () => {
  const privatePem = process.env.JWT_PRIVATE_KEY?.replaceAll('\\n', '\n');
  const publicPem = process.env.JWT_PUBLIC_KEY?.replaceAll('\\n', '\n');
  if (privatePem && publicPem) return { privateKey: await importPKCS8(privatePem, 'RS256'), publicKey: await importSPKI(publicPem, 'RS256') };
  if (process.env.AUTH_MODE === 'development') return generateKeyPair('RS256');
  return undefined;
})();
export async function verifyToken(header: string): Promise<number> {
  const match = /^Bearer (\S+)$/i.exec(header);
  const k = await keys;
  if (!match || !k) throw new Error('credentials');
  const { payload } = await jwtVerify(match[1], k.publicKey, { algorithms: ['RS256'], issuer: 'speakup', audience: 'speakup', requiredClaims: ['exp'] });
  const id = typeof payload.user_id === 'string' && /^[1-9][0-9]{0,9}$/.test(payload.user_id) ? Number(payload.user_id) : NaN;
  if (!Number.isInteger(id) || id <= 0 || id > 2147483647) throw new Error('credentials');
  return id;
}
async function authenticate(action: string, email: string, password: string): Promise<unknown> {
  if (process.env.AUTH_MODE === 'development') {
    // Two fixed seeded accounts only. This mode is explicitly opt-in and local.
    if (action !== 'signin' || !['alice@example.test', 'bob@example.test'].includes(email) || password !== 'speakup-local-only') throw new Error('credentials');
    return { success: true };
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('not_configured');
  const endpoint = action === 'signup' ? 'signup' : 'token?grant_type=password';
  const result = await fetch(`${url}/auth/v1/${endpoint}`, { method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(20_000) });
  if (!result.ok) throw new Error('credentials');
  return { success: true };
}
async function execute(r: ObjectValue): Promise<unknown> {
  switch (r.operation) {
    case 'database': {
      const s = statement(r);
      const [result] = await getPool().execute<RowDataPacket[] | ResultSetHeader>(s.sql, s.params);
      return result;
    }
    case 'transaction': {
      if (!Array.isArray(r.statements)) throw new Error('statements required');
      const statements = r.statements.map(statement);
      const connection = await getPool().getConnection();
      try {
        await connection.beginTransaction();
        let result: RowDataPacket[] | ResultSetHeader | undefined;
        for (const s of statements) [result] = await connection.execute<RowDataPacket[] | ResultSetHeader>(s.sql, s.params);
        await connection.commit();
        return result;
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    }
    case 'signin': case 'signup': return authenticate(r.operation, text(r.email), text(r.password));
    case 'issue_token': {
      const k = await keys;
      if (!k) throw new Error('not_configured');
      if (typeof r.user_id !== 'number' || !Number.isInteger(r.user_id)) throw new Error('invalid id');
      return new SignJWT({ user_id: String(r.user_id) }).setProtectedHeader({ alg: 'RS256' })
        .setIssuer('speakup').setAudience('speakup').setIssuedAt().setExpirationTime('24h').sign(k.privateKey);
    }
    case 'chat': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('not_configured');
      const prompt = r.kind === '/chat/theme' ? '会話のテーマとしてふさわしいものを一つだけ返してください。' : '英語についての質問に、日本語で英語の表現を教えてください。';
      const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', messages: [{ role: 'user', content: `${prompt}\n${text(r.content)}` }], max_tokens: r.kind === '/chat/theme' ? 100 : 1000 }),
        signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error('upstream');
      const result: unknown = await response.json();
      return result;
    }
    default: throw new Error('unknown operation');
  }
}
export const dispatch: typeof Dispatch = (request, done) => {
  Promise.resolve().then(() => execute(object(JSON.parse(request)))).then(
    value => done('', JSON.stringify(value)),
    (error: unknown) => {
      const code = error instanceof Error ? error.message : 'upstream';
      const dbCode = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      done(dbCode === 'ER_DUP_ENTRY' ? 'conflict' : ['credentials', 'not_configured'].includes(code) ? code : 'upstream', '');
    });
};
export async function closePool(): Promise<void> { if (pool) await pool.end(); }
