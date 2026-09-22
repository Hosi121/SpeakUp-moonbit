import { nativeEnv, nativeExecutable } from './native-env.mjs';
try { process.loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
// Replace this development launcher: the running server process is the native
// binary, with no Node.js event loop or JavaScript server code behind it.
process.execve(nativeExecutable, [nativeExecutable], nativeEnv());
