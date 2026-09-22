import { mkdirSync } from 'node:fs';
import { emitDeclaration } from './boundaries/js-contract.mjs';
mkdirSync('contract/generated', { recursive: true });
for (const pkg of ['shared', 'signaling', 'api', 'matching', 'thread']) {
  emitDeclaration({
    interfaceFile: `core/${pkg}/pkg.generated.mbti`,
    packageFile: `core/${pkg}/moon.pkg`,
    rawOutput: `contract/generated/${pkg}.raw.d.ts`,
    output: `dist/${pkg}.d.ts`,
    mbt2ts: 'scripts/mbt2ts.mjs',
  });
}

mkdirSync('examples/js-boundary/generated', { recursive: true });
emitDeclaration({
  interfaceFile: 'examples/js-boundary/src/contract/pkg.generated.mbti',
  packageFile: 'examples/js-boundary/src/contract/moon.pkg',
  rawOutput: 'examples/js-boundary/generated/contract.raw.d.ts',
  output: 'dist/js-boundary.d.ts',
  mbt2ts: 'scripts/mbt2ts.mjs',
});
