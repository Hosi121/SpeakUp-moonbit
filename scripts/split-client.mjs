import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// Moon emits one linked ESM file. Partition its top-level declarations without
// rewriting a function, so Vite can defer controllers and share the runtime.
// Unexpected compiler output fails the build instead of guessing at side effects.
export function partitionClient(code, groups) {
  const filename = '/linked-client.js';
  const host = ts.createCompilerHost({ allowJs: true });
  host.getSourceFile = (name) =>
    name === filename
      ? ts.createSourceFile(
          name,
          code,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.JS,
        )
      : undefined;
  host.fileExists = (name) => name === filename;
  host.readFile = (name) => (name === filename ? code : undefined);
  const program = ts.createProgram(
    [filename],
    { allowJs: true, noResolve: true, noLib: true },
    host,
  );
  const source = program.getSourceFile(filename),
    checker = program.getTypeChecker();
  const declarations = new Map(),
    byName = new Map(),
    exported = new Map(),
    imports = [];
  // async 0.22.1 initializes its single scheduler with core Deque / Set
  // constructors. These allocate in-memory containers; they do not start work.
  // Keep the allowlist narrow and preserve one declaration across partitions.
  const containerConstructor = /^_M0MPC1(?:5deque5Deque5Deque|3set3Set3Set)G/;
  const checkInitializer = (node) => {
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return;
    if (
      ts.isCallExpression(node) &&
      (!ts.isIdentifier(node.expression) ||
        (!['$i64_reinterpret_f64', '_M0FPB12random__seed'].includes(
          node.expression.text,
        ) && !containerConstructor.test(node.expression.text)))
    )
      throw new Error('Unsupported linked initializer call');
    if (
      ts.isAwaitExpression(node) ||
      ts.isYieldExpression(node) ||
      ts.isPostfixUnaryExpression(node) ||
      (ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
    )
      throw new Error('Unsupported linked initializer effect');
    ts.forEachChild(node, checkInitializer);
  };
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node)) {
      imports.push(node.getText(source));
      continue;
    }
    if (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const specifier of node.exportClause.elements)
        exported.set(
          specifier.name.text,
          (specifier.propertyName ?? specifier.name).text,
        );
      continue;
    }
    const name =
      ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)
        ? node.name
        : ts.isVariableStatement(node) &&
            node.declarationList.declarations.length === 1
          ? node.declarationList.declarations[0].name
          : undefined;
    if (name && ts.isIdentifier(name)) {
      if (ts.isVariableStatement(node)) {
        if (!(node.declarationList.flags & ts.NodeFlags.Const))
          throw new Error('Mutable linked global requires a dedicated module');
        const initializer = node.declarationList.declarations[0].initializer;
        if (!initializer) throw new Error('Missing linked initializer');
        checkInitializer(initializer);
      }
      const symbol = checker.getSymbolAtLocation(name);
      if (!symbol || byName.has(name.text))
        throw new Error('Ambiguous linked declaration');
      const declaration = {
        name: name.text,
        nodes: [node],
        dependencies: new Set(),
        owners: new Set(),
      };
      declarations.set(symbol, declaration);
      byName.set(name.text, declaration);
    } else if (!ts.isExpressionStatement(node))
      throw new Error(
        `Unsupported linked statement: ${ts.SyntaxKind[node.kind]}`,
      );
  }
  for (const node of source.statements)
    if (ts.isExpressionStatement(node)) {
      const expr = node.expression;
      if (
        !ts.isBinaryExpression(expr) ||
        expr.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
        !ts.isPropertyAccessExpression(expr.left) ||
        expr.left.name.text !== '$tag' ||
        !ts.isPropertyAccessExpression(expr.left.expression) ||
        expr.left.expression.name.text !== 'prototype' ||
        !ts.isIdentifier(expr.left.expression.expression) ||
        !ts.isNumericLiteral(expr.right)
      )
        throw new Error('Unsupported linked side effect');
      const owner = byName.get(expr.left.expression.expression.text);
      if (!owner) throw new Error('Missing prototype constructor');
      owner.nodes.push(node);
    }
  for (const declaration of declarations.values()) {
    const visit = (node) => {
      if (ts.isIdentifier(node)) {
        const dependency = declarations.get(checker.getSymbolAtLocation(node));
        if (dependency && dependency !== declaration)
          declaration.dependencies.add(dependency);
      }
      ts.forEachChild(node, visit);
    };
    declaration.nodes.forEach(visit);
  }
  const reach = (declaration, group) => {
    if (declaration.owners.has(group)) return;
    declaration.owners.add(group);
    for (const dependency of declaration.dependencies) reach(dependency, group);
  };
  for (const [name, local] of exported) {
    const group = groups[name],
      declaration = byName.get(local);
    if (!group || !declaration)
      throw new Error(`Unassigned client export: ${name}`);
    reach(declaration, group);
  }
  const owner = (declaration) =>
    declaration.owners.size === 1 ? [...declaration.owners][0] : 'runtime';
  const partitions = new Map();
  for (const declaration of declarations.values())
    if (declaration.owners.size) {
      const group = owner(declaration);
      if (!partitions.has(group)) partitions.set(group, []);
      partitions.get(group).push(declaration);
    }
  const output = new Map();
  for (const [group, values] of partitions) {
    const external = new Map();
    for (const value of values)
      for (const dependency of value.dependencies)
        if (owner(dependency) !== group) {
          const name = owner(dependency);
          if (!external.has(name)) external.set(name, new Set());
          external.get(name).add(dependency.name);
        }
    const lines = [
      '// Generated from the linked MoonBit module; do not edit.',
      ...imports,
    ];
    for (const [name, symbols] of external)
      lines.push(
        `import { ${[...symbols].sort().join(', ')} } from './${name}.js';`,
      );
    lines.push(
      ...values
        .flatMap((value) => value.nodes)
        .sort((a, b) => a.pos - b.pos)
        .map((node) => node.getText(source)),
    );
    lines.push(
      `export { ${values
        .map((value) => value.name)
        .sort()
        .join(', ')} };`,
    );
    output.set(group, lines.join('\n') + '\n');
  }
  const facade =
    [...exported]
      .map(
        ([name, local]) =>
          `export { ${local} as ${name} } from './client/${owner(byName.get(local))}.js';`,
      )
      .join('\n') + '\n';
  return { output, facade };
}

export function splitClient() {
  const groups = {};
  const shared = readFileSync('core/shared/moon.pkg', 'utf8');
  for (const match of /"exports"\s*:\s*\[([^\]]+)\]/
    .exec(shared)[1]
    .matchAll(/"([^"]+)"/g))
    groups[match[1].split(':').at(-1)] = 'shared';
  for (const [group, names] of Object.entries({
    thread: ['createThreadController', 'createBrowserThread'],
    ports: ['browserPorts'],
    auth: ['createAuthRequest', 'httpErrorMessage'],
    activity: ['createActivity', 'projectNotification'],
    social: ['createSocial'],
    calls: ['createCalls'],
    events: ['createEvents', 'createEventCard'],
    admin: ['createAdmin'],
    settings: ['createSettings'],
    reflection: ['createReflection'],
    learning: ['createLearning'],
    voice: ['createVoice', 'createSession', 'projectSpeaking'],
    microphone: ['createMicrophone', 'projectLevels'],
    memo: ['createMemo'],
    home: ['createHome'],
    history: ['createHistory'],
    stats: ['createStats'],
  }))
    for (const name of names) groups[name] = group;
  const { output, facade } = partitionClient(
    readFileSync('dist/client.js', 'utf8'),
    groups,
  );
  mkdirSync('dist/client', { recursive: true });
  for (const [name, text] of output)
    writeFileSync(`dist/client/${name}.js`, text);
  writeFileSync(
    'dist/client.js',
    '// Generated by scripts/split-client.mjs; do not edit.\n' + facade,
  );
}
