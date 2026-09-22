import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const directory = 'contract/frontend';
const pinned = '3561429e55a22d400702bf5df694670c52f2e721';
if (process.argv.includes('--capture-source')) {
  const source = (path) =>
    execFileSync('git', ['show', `${pinned}:${path}`], { encoding: 'utf8' });
  const ast = (path) => {
    const text = source(path);
    return ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
  };
  const find = (node, predicate) => {
    if (predicate(node)) return node;
    return ts.forEachChild(node, (child) => find(child, predicate));
  };
  const notification = ast(
    'frontend/src/components/utils/NotificationModal.tsx',
  );
  const descriptions = notification.statements.find(
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (d) => ts.isIdentifier(d.name) && d.name.text === 'descriptions',
      ),
  );
  const destination = notification.statements.find(
    (node) =>
      ts.isFunctionDeclaration(node) && node.name?.text === 'destination',
  );
  const visualizer = ast('frontend/src/components/utils/AudioVisualizer.tsx');
  const band = find(
    visualizer,
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (d) => ts.isIdentifier(d.name) && d.name.text === 'band',
      ),
  );
  const levels = find(
    visualizer,
    (node) =>
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'setLevels',
  );
  const analyzer = ast('frontend/src/components/utils/AudioVolumeAnalyzer.ts');
  const average = find(
    analyzer,
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (d) => ts.isIdentifier(d.name) && d.name.text === 'average',
      ),
  );
  const volume = find(
    analyzer,
    (node) =>
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(
        (d) => ts.isIdentifier(d.name) && d.name.text === 'volume',
      ),
  );
  const speaking = find(
    analyzer,
    (node) =>
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'setIsSpeak',
  );
  const text =
    `${descriptions.getText(notification)}\n${destination.getText(notification)}\nexport { descriptions, destination };\n` +
    `export function levels(data) { ${band.getText(visualizer)} return ${levels.arguments[0].getText(visualizer)}; }\n` +
    `export function speaking(data) { ${average.getText(analyzer).replaceAll('this.dataArray', 'data')} ${volume.getText(analyzer)} return ${speaking.arguments[0].getText(analyzer)}; }\n`;
  writeFileSync(
    `${directory}/projections.source.js`,
    `// Extracted from ${pinned}; never edit to match the target.\n` +
      ts.transpileModule(text, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      }).outputText,
  );
}
const oracle = await import(`../${directory}/projections.source.js`);
const { getPayloadMessage } = await import(`../${directory}/errorUtils.ts`);
const notifications = Object.keys(oracle.descriptions).flatMap((kind) =>
  [0, 42].map((conversation_id) => ({
    id: 1,
    kind,
    actor: { id: 2, username: 'Bob', avatar_url: '' },
    conversation_id,
    message_id: 1,
    read: false,
    created_at: '',
  })),
);
const audio = [
  Array(128).fill(0),
  Array(128).fill(255),
  Array(128).fill(26),
  Array(128).fill(27),
  Array.from({ length: 1024 }, (_, i) => i % 256),
];
const errors = [
  '',
  'temporarily unavailable',
  '{"error":"error"}',
  '{"message":{},"detail":"detail"}',
  '{"message":"first","error":"second"}',
  'null',
  '42',
];
const fixtures = {
  source: pinned,
  notifications: notifications.map((input) => ({
    input,
    expected: {
      description: oracle.descriptions[input.kind],
      destination: oracle.destination(input),
    },
  })),
  audio: audio.map((input) => ({
    input,
    levels: oracle.levels(input),
    speaking: oracle.speaking(input),
  })),
  errors: errors.map((input) => {
    let value = input;
    try {
      value = JSON.parse(input);
    } catch {}
    return {
      input,
      expected: getPayloadMessage(value) ?? '通信に失敗しました（422）',
    };
  }),
};
writeFileSync(
  `${directory}/fixtures.json`,
  JSON.stringify(fixtures, null, 2) + '\n',
);
