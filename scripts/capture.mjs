import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const source = process.argv[2];
mkdirSync('contract/source', { recursive: true });
const groups = {
  eventService: ['mapEventDto'], userService: ['mapUserDto', 'mapUserProfileDto', 'mapFriendSummaryDto'],
  memoService: ['fromMemoDto', 'toMemoDto'], appData: ['mapSessionDto', 'mapConversationHistoryDto'],
};
if (source) {
  const snippets = [];
  for (const [file, names] of Object.entries(groups)) {
    const s = ts.createSourceFile(file, readFileSync(`${source}/frontend/src/services/${file}.ts`, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const statement of s.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      if (statement.declarationList.declarations.some(d => names.includes(d.name.getText(s)))) snippets.push(`export ${statement.getText(s)}`);
    }
  }
  writeFileSync('contract/source/mappers.ts', '// Extracted verbatim from the pinned SpeakUp source. Runtime oracle only.\n' + snippets.join('\n\n'));
  const users = readFileSync(`${source}/backend/controllers/user_controller.go`, 'utf8');
  const normalize = users.slice(users.indexOf('func normalizeAvatarURL('));
  const signaling = readFileSync(`${source}/backend/controllers/signaling_controller.go`, 'utf8');
  const message = /type Message struct \{[\s\S]*?\n\}/.exec(signaling)?.[0];
  if (!message) throw new Error('Message struct not found');
  writeFileSync('contract/source/oracle.go', `package main\nimport ("encoding/json";"os";"strings")\n${message}\n${normalize}\nfunc main(){\n var input struct { Avatars []string; Messages []Message }; json.NewDecoder(os.Stdin).Decode(&input)\n avatars := []string{}; for _, v := range input.Avatars { avatars=append(avatars,normalizeAvatarURL(v)) }; json.NewEncoder(os.Stdout).Encode(map[string]interface{}{"avatars":avatars,"messages":input.Messages})\n}\n`);
  const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  writeFileSync('contract/source.json', JSON.stringify({ repo: 'https://github.com/Hosi121/SpeakUp', commit, node: process.version, go: execFileSync('go', ['version'], { encoding: 'utf8' }).trim(), contract: 'structural; intentional changes listed in docs/migration.md' }, null, 2) + '\n');
}
const emitted = ts.transpileModule(readFileSync('contract/source/mappers.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const m = await import(`data:text/javascript;base64,${Buffer.from(emitted).toString('base64')}`);
const u = { id: 2147483647, username: '日本語 👩🏽‍💻', email: 'someone@example.test', avatar_url: '/upload/a.png', created_at: '2024-09-01T00:00:00Z', updated_at: '2024-09-02T00:00:00Z', role: 'USER' };
const cases = [
  ['mapUserDto', 'mapUser', u], ['mapUserProfileDto', 'mapProfile', u], ['mapFriendSummaryDto', 'mapFriend', u],
  ['mapEventDto', 'mapEvent', { id: 7, event_start: u.created_at, event_end: u.updated_at, theme_id: 2, theme: { theme_text: '旅行', topic1: '京都', topic2: '', topic3: '海\n山' } }],
  ['fromMemoDto', 'fromMemo', { memo1: 'こんにちは\nhello', memo2: '🍣' }], ['fromMemoDto', 'fromMemo', {}],
  ['toMemoDto', 'toMemo', { carryInMemo: '', wordList: '\u0000\t' }],
  ['mapSessionDto', 'mapSession', { theme: '天気', date_time: u.created_at, sessions: [1, 3] }],
  ['mapConversationHistoryDto', 'mapConversation', { date: '2024-09-01', previous_date: '', sessions: 3, completion_rate: '100%', comment: 'good', examples: [{ english: 'Hello', japanese: 'こんにちは' }] }],
];
const fixtures = cases.map(([fn, target, input]) => ({ fn, target, input, expected: m[fn](input) }));
const goInput = { Avatars: ['', '/upload/a.png', 'https://example.test/a', 'http://example.test/b', '相対パス'], Messages: [ { type: 'callType', isOffer: false }, { type: 'callType', isOffer: true }, { type: 'offer', offer: { type: 'offer', sdp: 'v=0\r\n' } }, { type: 'ice-candidate', candidate: { candidate: '', sdpMid: null, sdpMLineIndex: 0 } } ] };
const go = JSON.parse(execFileSync('go', ['run', 'contract/source/oracle.go'], { input: JSON.stringify(goInput), encoding: 'utf8', env: { ...process.env, GOTOOLCHAIN: 'go1.23.5' } }));
writeFileSync('contract/fixtures.json', JSON.stringify({ typescript: fixtures, go: { input: goInput, expected: go }, sourceHash: createHash('sha256').update(readFileSync('contract/source/mappers.ts')).update(readFileSync('contract/source/oracle.go')).digest('hex') }, null, 2) + '\n');
