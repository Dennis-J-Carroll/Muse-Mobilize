import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'vite';

// Each run owns this directory and both ports. Never reuse the writer's server,
// settings, credentials, or projects for browser fixtures.
const root = await mkdtemp(path.join(tmpdir(), 'muse-browser-'));
const configDir = path.join(root, 'config');
await mkdir(configDir);
await writeFile(path.join(configDir, 'settings.json'), JSON.stringify({
  workspaceRoot: path.join(root, 'projects'),
  defaultProvider: 'mock',
}));

const runtime = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], {
  env: { ...process.env, MUSE_CONFIG_DIR: configDir, MUSE_PORT: '5278' },
  stdio: 'inherit',
});
let web: Awaited<ReturnType<typeof createServer>> | undefined;
let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  await web?.close();
  if (runtime.exitCode === null && runtime.signalCode === null) {
    const exited = once(runtime, 'exit');
    runtime.kill('SIGTERM');
    await exited;
  }
  await rm(root, { recursive: true, force: true });
  process.exit(code);
}
process.on('SIGTERM', () => void stop(0));
process.on('SIGINT', () => void stop(0));
runtime.on('exit', () => { if (!stopping) void stop(1); });

try {
  web = await createServer({
    configFile: path.resolve('web/vite.config.ts'),
    root: path.resolve('web'),
    server: {
      host: '127.0.0.1', port: 5277, strictPort: true, open: false,
      proxy: { '/api': { target: 'http://127.0.0.1:5278', changeOrigin: true } },
    },
  });
  await web.listen();
} catch (error) {
  console.error(error);
  await stop(1);
}
