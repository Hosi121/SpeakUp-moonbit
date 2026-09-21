// Same native argv compatibility as ts2mbt.mjs.
process.argv.splice(1, 1);
await import('../node_modules/@mizchi/ts/bin/mbt2ts.js');
