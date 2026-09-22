import ts from 'typescript';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/** Emit only concrete JS exports. Native/raises APIs stay in the MoonBit API. */
export function emitDeclaration({
  interfaceFile,
  packageFile,
  rawOutput,
  output,
  mbt2ts,
}) {
  const result = spawnSync(
    process.execPath,
    [mbt2ts, 'decl', interfaceFile, rawOutput],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) throw new Error(`mbt2ts failed: ${interfaceFile}`);
  const config = readFileSync(packageFile, 'utf8');
  const entries =
    /"exports"\s*:\s*\[([^\]]+)\]/.exec(config)?.[1].match(/"[^"]+"/g) ?? [];
  const names = new Map(
    entries.map((e) => {
      const [a, b] = JSON.parse(e).split(':');
      return [a, b ?? a];
    }),
  );
  const signatures = readFileSync(interfaceFile, 'utf8').split('\n');
  for (const name of names.keys()) {
    const signature = signatures.find((line) =>
      line.startsWith(`pub fn ${name}(`),
    );
    if (
      !signature ||
      /\braise\b|\basync\b|\bResult\[|\bOption\[/.test(signature)
    ) {
      throw new Error(
        `JS export needs a plain, synchronous boundary: ${interfaceFile}.${name}`,
      );
    }
  }
  const source = ts.createSourceFile(
    rawOutput,
    readFileSync(rawOutput, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  // Only include types reachable from JS exports; native APIs stay private.
  const required = new Set();
  const collect = (node) => {
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName))
      required.add(node.typeName.text);
    ts.forEachChild(node, collect);
  };
  for (const node of source.statements) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      names.has(node.name.text)
    )
      collect(node);
  }
  for (let previous = -1; previous !== required.size;) {
    previous = required.size;
    for (const node of source.statements) {
      if (ts.isInterfaceDeclaration(node) && required.has(node.name.text))
        collect(node);
    }
  }
  const nodes = [];
  const imports = new Map();
  for (const node of source.statements) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      /^hosi121\/speakup\/(shared|presenter)$/.test(
        node.moduleSpecifier.text,
      ) &&
      node.importClause?.namedBindings &&
      ts.isNamespaceImport(node.importClause.namedBindings)
    ) {
      const alias = node.importClause.namedBindings.name.text;
      const dependency = node.moduleSpecifier.text.split('/').at(-1);
      imports.set(
        alias,
        new Set(
          [
            ...readFileSync(`dist/${dependency}.d.ts`, 'utf8').matchAll(
              /export interface (\w+)/g,
            ),
          ].map((m) => m[1]),
        ),
      );
      nodes.push(
        ts.factory.updateImportDeclaration(
          node,
          node.modifiers,
          node.importClause,
          ts.factory.createStringLiteral(`./${dependency}.js`),
          node.attributes,
        ),
      );
    }
  }
  for (const node of source.statements) {
    if (
      ts.isInterfaceDeclaration(node) &&
      required.has(node.name.text) &&
      node.name.text !== 'ToJson'
    ) {
      nodes.push(
        ts.factory.updateInterfaceDeclaration(
          node,
          node.modifiers,
          node.name,
          node.typeParameters,
          undefined,
          node.members,
        ),
      );
    } else if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      names.has(node.name.text)
    ) {
      nodes.push(
        ts.factory.updateFunctionDeclaration(
          node,
          node.modifiers,
          node.asteriskToken,
          ts.factory.createIdentifier(names.get(node.name.text)),
          node.typeParameters,
          node.parameters,
          node.type,
          undefined,
        ),
      );
      names.delete(node.name.text);
    }
  }
  if (names.size)
    throw new Error(`Missing compiled exports: ${[...names.keys()]}`);
  const allowed = new Set([
    'Array',
    'ReadonlyArray',
    'Uint8Array',
    ...nodes.filter(ts.isInterfaceDeclaration).map((n) => n.name.text),
  ]);
  const validate = (node) => {
    if (ts.isTypeReferenceNode(node)) {
      const name = node.typeName;
      const local = ts.isIdentifier(name) && allowed.has(name.text);
      const imported =
        ts.isQualifiedName(name) &&
        ts.isIdentifier(name.left) &&
        imports.get(name.left.text)?.has(name.right.text);
      if (!local && !imported)
        throw new Error(`Unsupported JS wire type: ${node.getText(source)}`);
    }
    ts.forEachChild(node, validate);
  };
  for (const node of nodes) validate(node);
  const printer = ts.createPrinter();
  const code =
    '// Generated from MoonBit interfaces by mbt2ts; do not edit.\n' +
    nodes
      .map((n) => printer.printNode(ts.EmitHint.Unspecified, n, source))
      .join('\n\n') +
    '\n';
  if (/\bany\b|\bunknown\b|json\./.test(code))
    throw new Error(`Untyped declaration in ${interfaceFile}`);
  writeFileSync(output, code);
}
