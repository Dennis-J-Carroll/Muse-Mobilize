import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('isolated trial HTTP serves built UI, locks configuration, and permits trial writing', async t => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-trial-http-'));
  const config = path.join(root, 'config'), projects = path.join(root, 'projects'), web = path.join(root, 'web');
  await fs.mkdir(config); await fs.mkdir(web);
  await fs.writeFile(path.join(web, 'index.html'), '<!doctype html><title>Trial fixture</title>');
  await fs.writeFile(path.join(config, 'settings.json'), JSON.stringify({ workspaceRoot: path.join(root, 'wrong-folder'), defaultProvider: 'mock' }));
  const reserve = net.createServer().listen(0, '127.0.0.1'); await once(reserve, 'listening');
  const port = (reserve.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => reserve.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], { cwd: repo, stdio: 'pipe', env: {
    ...process.env, MUSE_TRIAL: '1', MUSE_TRIAL_SETUP: '0', MUSE_TRIAL_ROOT: projects, MUSE_CONFIG_DIR: config,
    MUSE_HOST: '127.0.0.1', MUSE_PORT: String(port), MUSE_WEB_DIR: web,
  } });
  let output = ''; child.stderr.on('data', data => { output += data; }); child.stdout.resume();
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:' + port;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await fetch(base + '/api/health')).ok; } catch {}
    if (ready || child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, output);
  const settings = await (await fetch(base + '/api/settings')).json();
  assert.equal(settings.settings.workspaceRoot, projects);
  assert.equal(settings.settings.trial, true); assert.equal(settings.settings.trialSetup, false);
  assert.deepEqual(settings.providers.map((item: { id: string }) => item.id), ['mock']);
  for (const [route, method] of [['/api/settings', 'PUT'], ['/api/providers/mock/test', 'POST'], ['/api/local-models/qwen/install', 'POST']]) {
    const denied = await fetch(base + route, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceRoot: '/personal' }) });
    assert.equal(denied.status, 403);
  }
  const created = await fetch(base + '/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Trial writer' }) });
  assert.equal(created.status, 200);
  const { project } = await created.json();
  const changed = await fetch(base + '/api/projects/' + project.id + '/documents/chapter-01', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: 'Trial writing persists.' }) });
  assert.equal(changed.status, 200);
  assert.equal(await fs.readFile(path.join(projects, project.id + '.muse/manuscript/chapter-01.md'), 'utf8'), 'Trial writing persists.');
  await assert.rejects(fs.access(path.join(root, 'wrong-folder')));
  const forbidden = await fetch(base + '/api/projects', { method: 'POST', headers: { origin: 'https://other.example', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(forbidden.status, 403);
  assert.equal((await fetch(base + '/api/does-not-exist')).status, 404);
  const source = await fetch(base + '/server/src/index.ts');
  assert.equal(await source.text(), '<!doctype html><title>Trial fixture</title>');
  assert.equal(source.headers.get('content-security-policy'), "frame-ancestors 'none'");
});
