import { mkdirSync } from 'node:fs';
import { emitDeclaration } from '../packages/servicekit/tools/js-contract.mjs';
mkdirSync('contract/generated', { recursive: true });
for (const pkg of ['shared', 'signaling', 'api', 'matching']) {
  emitDeclaration({
    interfaceFile: `core/${pkg}/pkg.generated.mbti`,
    packageFile: `core/${pkg}/moon.pkg`,
    rawOutput: `contract/generated/${pkg}.raw.d.ts`,
    output: `dist/${pkg}.d.ts`,
    mbt2ts: 'scripts/mbt2ts.mjs',
  });
}

mkdirSync('examples/servicekit/generated', { recursive: true });
emitDeclaration({
  interfaceFile: 'examples/servicekit/src/contract/pkg.generated.mbti',
  packageFile: 'examples/servicekit/src/contract/moon.pkg',
  rawOutput: 'examples/servicekit/generated/contract.raw.d.ts',
  output: 'dist/servicekit-example.d.ts',
  mbt2ts: 'scripts/mbt2ts.mjs',
});
