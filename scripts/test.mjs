import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

async function testsIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return testsIn(file);
    return /\.test\.(js|ts)$/.test(entry.name) ? [file] : [];
  }));
  return nested.flat();
}
const files = (await Promise.all(['src', 'server/src'].map(testsIn))).flat().sort();
const runner = spawn(process.execPath, ['--import', 'tsx', '--test', ...process.argv.slice(2), ...files], { stdio: 'inherit' });
runner.once('error', error => { console.error(error.message); process.exitCode = 1; });
runner.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
