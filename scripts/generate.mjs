import { generateBindings } from './boundaries/ts-bindings.mjs';
generateBindings({ input: 'bindings/host.d.ts', module: '#speakup/host', output: 'core/platform', ts2mbt: 'scripts/ts2mbt.mjs' });
generateBindings({ input: 'examples/js-boundary/host.d.ts', module: '#js-boundary/host', output: 'examples/js-boundary/src/platform', ts2mbt: 'scripts/ts2mbt.mjs' });
