import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { nativeEnv } from '../../scripts/native-env.mjs';
const base = 'http://127.0.0.1:18083';
let child, logs = '';
async function eventually(f) {
  let last;
  for (let i = 0; i < 100; i++) {
    try { return await f(); } catch (error) { last = error; await new Promise(resolve => setTimeout(resolve, 20)); }
  }
  throw last;
}
before(async () => {
  child = spawn('_build/native/release/build/hosi121/servicekit_example/server/server.exe', [], { env: nativeEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', text => logs += text); child.stderr.on('data', text => logs += text);
  await eventually(async () => assert.equal((await fetch(base + '/health')).status, 200));
});
after(async () => {
  child?.kill('SIGTERM');
  if (child && child.exitCode === null) await once(child, 'exit');
  assert.doesNotMatch(logs, /FAILED|AddressSanitizer|runtime error:/);
});
async function connect(path) {
  const ws = new WebSocket(base.replace('http', 'ws') + path);
  const messages = [];
  ws.on('message', data => messages.push(data.toString()));
  const closed = once(ws, 'close');
  await once(ws, 'open');
  return { ws, messages, closed };
}
test('standalone library echoes Unicode, orders the final payload and cleans connections', async () => {
  const { ws } = await connect('/echo');
  const reply = once(ws, 'message'); ws.send('日本語'); assert.equal((await reply)[0].toString(), '日本語');
  ws.close(); await once(ws, 'close');
  const final = await connect('/finish');
  assert.equal((await final.closed)[0], 1000); assert.deepEqual(final.messages, ['goodbye']);
  await eventually(async () => assert.equal(await (await fetch(base + '/health')).text(), '0'));
});
test('message size and message count are bounded even for empty payloads', async () => {
  const large = await connect('/echo'); large.ws.send('x'.repeat(4097));
  assert.equal((await large.closed)[0], 1009);
  const overflow = await connect('/overflow');
  assert.equal((await overflow.closed)[0], 1006);
  await eventually(async () => assert.equal(await (await fetch(base + '/health')).text(), '0'));
});
