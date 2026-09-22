import { createServer, type IncomingMessage } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID, createHmac } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { handle } from '../dist/api.js';
import { createHub, destroyHub, join, leave, receive, publish, type Delivery } from '../dist/signaling.js';
import { parseSignal, parseConversation } from '../dist/shared.js';
import { verifyToken, closePool } from './host.ts';

const origins = new Set((process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173').split(','));
const hub = createHub();
const clients = new Map<number, WebSocket>();
const MAX_BUFFER = 256 * 1024;
const MAX_CLIENTS = 10_000;
let serial = 0;
type ApiResult = { status: number; body: string };
function callApi(method: string, path: string, user: number, input = '', query = ''): Promise<ApiResult> {
  return new Promise(resolve => handle(method, path, user, input, query, (status, body) => resolve({ status, body })));
}
// Serialize admission and durable lifecycle commands for one conversation.
// ICE/SDP relay does not wait on this queue or touch the database.
const conversationWork = new Map<number, Promise<void>>();
function withConversation<T>(id: number, work: () => Promise<T>): Promise<T> {
  const next = (conversationWork.get(id) ?? Promise.resolve()).then(work);
  const barrier = next.then(() => {}, () => {});
  conversationWork.set(id, barrier);
  void barrier.then(() => { if (conversationWork.get(id) === barrier) conversationWork.delete(id); });
  return next;
}
function publishConversation(body: string): void {
  const conversation = parseConversation(body);
  deliver(publish(hub, conversation.id, `{"type":"conversation","value":${body}}`, conversation.ended_at > 0 || conversation.cancelled_at > 0));
}
async function body(req: IncomingMessage, limit = 64 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) throw new Error('too large');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
function deliver(messages: Delivery[]): void {
  for (const m of messages) {
    const ws = clients.get(m.connection);
    if (!ws || ws.readyState !== WebSocket.OPEN) continue;
    if (ws.bufferedAmount + Buffer.byteLength(m.payload) > MAX_BUFFER) { ws.terminate(); continue; }
    ws.send(m.payload, error => { if (error) ws.terminate(); });
    if (m.close_code) ws.close(m.close_code, m.close_code === 1000 ? 'Conversation completed' : 'Invalid signaling state');
  }
}
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !origins.has(origin)) { res.writeHead(403).end(); return; }
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    // Begin is emitted only by the signaling controller after both peers report
    // media connected. The HTTP adapter cannot invoke this internal command.
    if (/^\/conversations\/[^/]+\/start$/.test(path)) {
      res.writeHead(405, { 'Content-Type': 'application/json' }).end('{"error":"Begin requires media negotiation"}'); return;
    }
    if (req.method === 'GET' && /^\/upload\/[a-f0-9-]+\.(png|jpg|webp)$/.test(url.pathname)) {
      const file = await readFile(`uploads/${url.pathname.split('/').pop()}`);
      const extension = url.pathname.split('.').pop();
      res.setHeader('Content-Type', `image/${extension === 'jpg' ? 'jpeg' : extension}`);
      res.end(file); return;
    }
    const publicPath = ['/health', '/signin', '/signup'].includes(url.pathname);
    let userId = 0;
    if (!publicPath) {
      try { userId = await verifyToken(req.headers.authorization ?? ''); }
      catch { res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"Authentication required"}'); return; }
    }
    if (req.method === 'GET' && url.pathname === '/rtc-config') {
      const iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
      if (process.env.TURN_URLS && process.env.TURN_SECRET) {
        const username = `${Math.floor(Date.now() / 1000) + 3600}:${userId}`;
        iceServers.push({ urls: process.env.TURN_URLS.split(','), username,
          credential: createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64') });
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ iceServers }));
      return;
    }
    let input = '';
    if (req.method === 'PUT' && url.pathname === '/user/avatar') {
      const contentType = req.headers['content-type'] ?? '';
      if (!contentType.startsWith('multipart/form-data;')) throw new Error('invalid upload');
      const raw = await body(req, 2 * 1024 * 1024);
      const form = await new Response(new Uint8Array(raw), { headers: { 'Content-Type': contentType } }).formData();
      const avatar = form.get('avatar');
      if (!(avatar instanceof File) || avatar.size === 0) throw new Error('invalid upload');
      const data = Buffer.from(await avatar.arrayBuffer());
      const extension = data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
        : data[0] === 255 && data[1] === 216 && data[2] === 255 ? 'jpg'
        : data.subarray(0,4).toString() === 'RIFF' && data.subarray(8,12).toString() === 'WEBP' ? 'webp' : undefined;
      if (!extension) throw new Error('invalid upload');
      await mkdir('uploads', { recursive: true });
      const name = `${randomUUID()}.${extension}`;
      await writeFile(`uploads/${name}`, data, { flag: 'wx' });
      input = JSON.stringify({ avatar_url: `/upload/${name}` });
    } else if (req.method === 'POST' || req.method === 'PUT') input = (await body(req)).toString('utf8');
    const finish = req.method === 'POST' ? /^\/conversations\/([1-9][0-9]*)\/(?:finish|cancel)$/.exec(path) : null;
    const execute = async () => {
      const result = await callApi(req.method ?? 'GET', path, userId, input, url.searchParams.get('q') ?? '');
      if (finish && result.status === 200) publishConversation(result.body);
      return result;
    };
    const result = finish ? await withConversation(Number(finish[1]), execute) : await execute();
    res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' }).end(result.body);
  } catch (error) {
    const status = error instanceof Error && error.message === 'too large' ? 413 : 400;
    res.writeHead(status, { 'Content-Type': 'application/json' }).end('{"error":"Invalid request"}');
  }
});
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
const websocket = new WebSocketServer({ noServer: true, maxPayload: 65536, perMessageDeflate: false });
server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  if (req.url !== '/ws' || !origin || !origins.has(origin) || clients.size >= MAX_CLIENTS) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
  }
  websocket.handleUpgrade(req, socket, head, ws => websocket.emit('connection', ws));
});
websocket.on('connection', (ws: WebSocket) => {
  const id = ++serial;
  if (id > 2147483647) { ws.close(1013); return; }
  clients.set(id, ws);
  let state: 'new' | 'authenticating' | 'ready' | 'closed' = 'new';
  let userId = 0;
  let conversationId = 0;
  let alive = true;
  let count = 0;
  let windowStart = Date.now();
  const timeout = setTimeout(() => ws.close(1008, 'Authentication timeout'), 5000);
  ws.on('pong', () => { alive = true; });
  const heartbeat = setInterval(() => { if (!alive) ws.terminate(); else { alive = false; ws.ping(); } }, 30_000);
  ws.on('message', (data, binary) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const time = Date.now();
    if (time - windowStart > 1000) { count = 0; windowStart = time; }
    if (binary || ++count > 100) { ws.close(1008, 'Message limit'); return; }
    const text = data.toString();
    if (state === 'new') {
      const auth = parseSignal(text);
      if (auth.kind !== 'Authorization') { ws.close(1008, 'Authentication required'); return; }
      state = 'authenticating';
      void (async () => {
        try {
          userId = await verifyToken(auth.token);
          conversationId = auth.room;
          await withConversation(conversationId, async () => {
            const result = await callApi('GET', `/conversations/${conversationId}`, userId);
            if (ws.readyState !== WebSocket.OPEN) return;
            if (result.status !== 200) { ws.close(1008, 'Conversation access denied'); return; }
            const conversation = parseConversation(result.body);
            if (conversation.ended_at > 0 || conversation.cancelled_at > 0) { ws.close(1008, 'Conversation access denied'); return; }
            clearTimeout(timeout);
            state = 'ready';
            deliver(join(hub, id, userId, conversationId));
            if (ws.readyState === WebSocket.OPEN) ws.send(`{"type":"conversation","value":${result.body}}`);
          });
        } catch { ws.close(1008, 'Authentication failed'); }
      })();
    } else if (state === 'ready') {
      const received = receive(hub, id, text);
      deliver(received.deliveries);
      if (received.media_ready) {
        void withConversation(conversationId, async () => {
          const result = await callApi('POST', `/conversations/${conversationId}/start`, userId);
          if (result.status === 200) publishConversation(result.body);
          else deliver(publish(hub, conversationId, '{"type":"error","error":"Could not start conversation"}', true));
        }).catch(() => ws.close(1011, 'Conversation unavailable'));
      }
    }
    else ws.close(1008, 'Wait for authentication');
  });
  ws.on('error', () => ws.terminate());
  ws.on('close', () => {
    state = 'closed'; clearTimeout(timeout); clearInterval(heartbeat); clients.delete(id);
    deliver(leave(hub, id));
  });
});
server.listen(Number(process.env.PORT ?? 8081), process.env.HOST ?? '127.0.0.1', () => {
  console.log(`SpeakUp MoonBit listening on ${JSON.stringify(server.address())}`);
});
async function stop() {
  for (const ws of clients.values()) ws.terminate();
  await new Promise<void>(resolve => server.close(() => resolve()));
  destroyHub(hub); await closePool();
}
process.once('SIGTERM', () => { void stop(); });
process.once('SIGINT', () => { void stop(); });
