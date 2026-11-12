import { spawn, spawnSync } from 'node:child_process';
import { access, mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(repo, '.muse-local', 'share');
const config = path.join(root, 'config');
const projects = path.join(root, 'projects');
const settingsFile = path.join(config, 'settings.json');
const args = process.argv.slice(2);
const setup = args.includes('--setup');
const offline = args.includes('--offline');
const localOnly = args.includes('--local-only');
const emails = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--email') emails.push(args[++i]);
  else if (!['--setup', '--offline', '--local-only'].includes(args[i])) throw new Error(`Unknown argument: ${args[i]}`);
}
await mkdir(config, { recursive: true, mode: 0o700 });
await mkdir(projects, { recursive: true, mode: 0o700 });
await chmod(root, 0o700); await chmod(config, 0o700);
try { await access(settingsFile); } catch {
  await writeFile(settingsFile, JSON.stringify({ workspaceRoot: projects, defaultProvider: 'mock' }, null, 2), { mode: 0o600 });
}
await chmod(settingsFile, 0o600);
const configured = JSON.parse(await readFile(settingsFile, 'utf8'));
const provider = configured.defaultProvider ?? 'mock';
if (!setup && !offline && (provider === 'mock' || !configured[`${provider}ApiKey`])) {
  throw new Error('Configure a separate trial key with npm run share:setup first, or explicitly use --offline for a demo.');
}
await access(path.join(repo, 'web/dist/index.html'));

const emailFile = path.join(root, 'allowed-emails.json');
if (!emails.length) {
  try { emails.push(...JSON.parse(await readFile(emailFile, 'utf8'))); } catch { /* Required below when publishing. */ }
}
if (emails.some(email => typeof email !== 'string' || !/^[^\s@*,]+@[^\s@*,]+\.[^\s@*,]+$/.test(email))) throw new Error('Use individual email addresses, without wildcards.');
let connector;
if (!setup && !localOnly) {
  if (!emails.length) throw new Error('Pass --email for each invited person. Public trial tunnels are disabled.');
  connector = path.join(root, 'bin', 'cloudflared');
  try { await access(connector, constants.X_OK); } catch { connector = 'cloudflared'; }
  const help = spawnSync(connector, ['tunnel', '--help'], { encoding: 'utf8' });
  if (help.status !== 0 || !help.stdout.includes('--allowed-mail')) throw new Error('Install a current cloudflared with --allowed-mail support. See docs/sharing-trial.md.');
  await writeFile(emailFile, JSON.stringify(emails, null, 2), { mode: 0o600 });
}

const instance = randomUUID();
const port = setup ? 5379 : 5377;
const base = `http://127.0.0.1:${port}`;
const statusFile = path.join(root, setup ? 'setup-status.json' : 'status.json');
const env = { ...process.env };
// Do not inherit personal provider credentials or tunnel configuration.
for (const name of Object.keys(env)) if (/^(OPENAI_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|XAI_API_KEY|ANTHROPIC_API_KEY|TUNNEL_|MUSE_)/.test(name)) delete env[name];
Object.assign(env, { MUSE_TRIAL: '1', MUSE_TRIAL_SETUP: setup ? '1' : '0', MUSE_TRIAL_ROOT: projects,
  MUSE_TRIAL_OFFLINE: offline ? '1' : '0',
  MUSE_CONFIG_DIR: config, MUSE_PORT: String(port), MUSE_HOST: '127.0.0.1', MUSE_WEB_DIR: path.join(repo, 'web/dist'), MUSE_INSTANCE_ID: instance });
const runtime = spawn(process.execPath, ['--import', 'tsx', 'server/src/index.ts'], { cwd: repo, env, stdio: ['ignore', 'inherit', 'inherit'] });
let tunnel, stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of [tunnel, runtime]) if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  try {
    const status = JSON.parse(await readFile(statusFile, 'utf8'));
    if (status.pid === process.pid) {
      await writeFile(statusFile, JSON.stringify({ running: false, stoppedAt: new Date().toISOString() }), { mode: 0o600 });
    }
  } catch { /* A failed launch may not own a status record. */ }
  process.exit(code);
}
process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
runtime.on('error', error => { console.error(error.message); void stop(1); });
runtime.on('exit', code => { if (!stopping) void stop(code || 1); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const health = await (await fetch(`${base}/api/health`)).json(); ready = health.instance === instance; } catch { /* Runtime booting. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Trial server did not start. Check whether its port is already in use.');
  const list = await (await fetch(`${base}/api/projects`)).json();
  if (!list.projects.length) {
    const response = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Welcome to Muse' }) });
    if (!response.ok) throw new Error('Could not create trial sample project.');
  }
  console.log(`[trial] ${setup ? 'Local key setup: open Model settings (cloud icon) at' : 'Isolated trial:'} ${base}`);
  console.log(`[trial] Projects persist in ${projects}. Ctrl+C stops this session.`);
  if (setup) console.log('[trial] Save a separate API key in Model settings with Save & check. No tunnel is running. Then run npm run share:start.');
  await writeFile(statusFile, JSON.stringify({ running: true, pid: process.pid, local: base, setup, startedAt: new Date().toISOString() }), { mode: 0o600 });
  if (!setup && !localOnly) {
    // An explicit empty config avoids loading a personal named-tunnel configuration.
    const emptyConfig = path.join(root, 'tunnel.yml');
    await writeFile(emptyConfig, '{}\n', { mode: 0o600 });
    tunnel = spawn(connector, ['tunnel', '--config', emptyConfig, '--no-autoupdate', '--url', base, ...emails.flatMap(email => ['--allowed-mail', email])], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let recent = '';
    const output = chunk => {
      if (stopping) return;
      const text = String(chunk); process.stdout.write(text); recent = (recent + text).slice(-16000);
      const url = recent.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];
      if (url) void writeFile(statusFile, JSON.stringify({ running: true, pid: process.pid, local: base, url, protected: true }), { mode: 0o600 });
    };
    tunnel.stdout.on('data', output); tunnel.stderr.on('data', output);
    tunnel.on('error', error => { console.error(error.message); void stop(1); });
    tunnel.on('exit', code => { if (!stopping) void stop(code || 1); });
  }
} catch (error) { console.error(error.message); await stop(1); }
