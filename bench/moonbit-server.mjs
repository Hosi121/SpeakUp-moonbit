// Same synthetic admission as the Go reference, using the production MoonBit hub.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createHub, join, leave, receive } from '../dist/signaling.js';
const h = createHub(), clients = new Map(); let id = 0;
const http = createServer((_, res) => res.end('ok'));
const server = new WebSocketServer({ server: http, maxPayload: 65536, perMessageDeflate: false });
const deliver = ds => { for (const d of ds) { const ws = clients.get(d.connection); if (ws?.readyState === 1) { if (ws.bufferedAmount > 262144) ws.terminate(); else { ws.send(d.payload); if (d.close_code) ws.close(d.close_code); } } } };
server.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const conn = ++id; clients.set(conn, ws);
  deliver(join(h, conn, Number(url.searchParams.get('user')), Number(url.searchParams.get('room'))));
  ws.on('message', (raw, binary) => { if (binary) ws.close(1008); else deliver(receive(h, conn, raw.toString()).deliveries); });
  ws.on('close', () => { clients.delete(conn); deliver(leave(h, conn)); });
});
http.listen(Number(process.env.PORT ?? 18102), '127.0.0.1');
