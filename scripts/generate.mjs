import { generateBindings } from '../packages/servicekit/tools/ts-bindings.mjs';
generateBindings({ input: 'bindings/host.d.ts', module: '#speakup/host', output: 'core/platform', ts2mbt: 'scripts/ts2mbt.mjs' });
generateBindings({ input: 'examples/servicekit/host.d.ts', module: '#servicekit-example/host', output: 'examples/servicekit/src/platform', ts2mbt: 'scripts/ts2mbt.mjs' });
