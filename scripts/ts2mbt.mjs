// @mizchi/ts 0.6.0's JS CLI expects native-style argv (one program entry).
// Keep this compatibility fix outside generated sources; remove after upgrading.
process.argv.splice(1, 1);
await import('../node_modules/@mizchi/ts/bin/ts2mbt.js');
