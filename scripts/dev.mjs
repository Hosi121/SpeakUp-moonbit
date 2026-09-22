import { spawn } from 'node:child_process';
const children = [spawn(process.execPath, ['scripts/start-native.mjs'], { stdio: 'inherit' }), spawn('npm', ['--prefix', 'frontend', 'run', 'dev'], { stdio: 'inherit' })];
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => children.forEach(child => child.kill(signal)));
for (const child of children) child.on('exit', code => { children.forEach(c => c.kill()); process.exitCode = code ?? 1; });
