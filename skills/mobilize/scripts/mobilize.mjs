import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digest = (value) => hash(JSON.stringify(value));
export const MAX_SOURCE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const MAX_DOCUMENTS = 1000;

function object(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || required.some((key) => !Object.hasOwn(value, key))
    || Object.keys(value).some((key) => ![...required, ...optional].includes(key))) throw new Error('Malformed or unknown fields.');
}
function string(value, limit = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid text field.');
  return value;
}
function sourcePath(value) {
  string(value, 1024);
  const parts = value.split('/');
  if (parts.length > 32 || parts.some((part) => !part || part.startsWith('.') || /[. ]$/.test(part) || Buffer.byteLength(part) > 255)
    || /[\\:]/.test(value) || !/\.(md|markdown|txt)$/i.test(value)) throw new Error('Unsafe source path or unsupported document type.');
  return value;
}
function normalizeSpec(spec) {
  object(spec, ['version', 'sourceId', 'projectName', 'documents']);
  if (Buffer.byteLength(JSON.stringify(spec)) > 4 * 1024 * 1024) throw new Error('Selection exceeds 4 MiB.');
  if (spec.version !== 1 || typeof spec.sourceId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(spec.sourceId)) throw new Error('Unsupported version or invalid source identity.');
  string(spec.projectName);
  if (!Array.isArray(spec.documents) || !spec.documents.length || spec.documents.length > MAX_DOCUMENTS) throw new Error('Select 1–1000 documents.');
  const seen = new Set();
  const documents = spec.documents.map((doc) => {
    object(doc, ['sourcePath', 'title', 'kind'], ['provenance']);
    sourcePath(doc.sourcePath); string(doc.title);
    if (!['manuscript', 'canon', 'outline', 'notes'].includes(doc.kind)) throw new Error('Unsupported document kind.');
    const key = doc.sourcePath.normalize('NFC').toLowerCase();
    if (seen.has(key)) throw new Error('Duplicate or ambiguous source identity.');
    seen.add(key);
    const p = doc.provenance ?? { maturity: null, reviewState: null, authority: null, notes: [] };
    object(p, ['maturity', 'reviewState', 'authority', 'notes']);
    for (const field of ['maturity', 'reviewState', 'authority']) if (p[field] !== null) string(p[field]);
    if (!Array.isArray(p.notes) || p.notes.length > 20) throw new Error('Invalid provenance notes.');
    return { sourcePath: doc.sourcePath, title: doc.title, kind: doc.kind,
      provenance: { maturity: p.maturity, reviewState: p.reviewState, authority: p.authority, notes: p.notes.map((note) => string(note, 2000)) } };
  });
  return { version: 1, sourceId: spec.sourceId, projectName: spec.projectName, documents };
}

const signature = (stat) => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
async function readSource(sourceRoot, relative) {
  sourcePath(relative);
  const root = await fs.realpath(sourceRoot);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('Source root must be a directory.');
  let target = root;
  const parts = relative.split('/');
  for (const [index, part] of parts.entries()) {
    target = path.join(target, part);
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new Error('Source entries must be regular files, without symlinks.');
  }
  const handle = await fs.open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > MAX_SOURCE_FILE_BYTES) throw new Error('Source file exceeds 8 MiB or is not regular.');
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error('Source changed while reading.');
      offset += bytesRead;
    }
    if (await fs.realpath(target) !== target || signature(before) !== signature(await handle.stat())
      || signature(before) !== signature(await fs.lstat(target))) throw new Error('Source changed while reading.');
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (bytes.includes(0)) throw new Error('Source is not a UTF-8 text document.');
    return bytes;
  } finally { await handle.close(); }
}

/** Preview contains identities and hashes, never manuscript bytes or absolute source paths. */
export async function preparePlan(sourceRoot, spec) {
  spec = normalizeSpec(spec);
  const documents = [];
  let total = 0;
  for (const [index, doc] of spec.documents.entries()) {
    const bytes = await readSource(sourceRoot, doc.sourcePath);
    total += bytes.length;
    if (total > MAX_SOURCE_BYTES) throw new Error('Selected source exceeds 40 MiB.');
    const id = `source-${hash(`${spec.sourceId}\0${doc.sourcePath}`).slice(0, 32)}`;
    documents.push({ ...doc, id, destinationPath: `${doc.kind}/${id}${path.extname(doc.sourcePath).toLowerCase()}`,
      order: index + 1, size: bytes.length, sha256: hash(bytes) });
  }
  const plan = { format: 'muse-mobilize-plan', version: 1, mode: 'new-project',
    sourceId: spec.sourceId, projectName: spec.projectName, documents };
  if (Buffer.byteLength(JSON.stringify(plan, null, 2)) > 4 * 1024 * 1024 - 100) throw new Error('Generated plan exceeds 4 MiB; use a smaller selection.');
  return { ...plan, approvalHash: digest(plan) };
}

/** Produces a portable new-project bundle, not an in-place import or synchronization. */
export async function createBundle(sourceRoot, plan, approvedHash) {
  if (typeof approvedHash !== 'string' || !/^[a-f0-9]{64}$/.test(approvedHash) || approvedHash !== plan?.approvalHash) {
    throw new Error('Explicit approval of the reviewed plan hash is required.');
  }
  const { approvalHash, ...body } = plan;
  if (digest(body) !== approvalHash) throw new Error('Plan changed after review; prepare and approve a new plan.');
  const fresh = await preparePlan(sourceRoot, { version: 1, sourceId: plan.sourceId, projectName: plan.projectName,
    documents: plan.documents.map(({ sourcePath, title, kind, provenance }) => ({ sourcePath, title, kind, provenance })) });
  if (fresh.approvalHash !== approvalHash) throw new Error('Source or plan changed; prepare and approve a new plan.');
  const capturedAt = new Date().toISOString();
  const sourceProjectId = `mobilized-${plan.sourceId}`;
  const receipt = { format: 'muse-mobilize-receipt', version: 1, mode: 'new-project',
    sourceId: plan.sourceId, planHash: plan.approvalHash, capturedAt,
    claimExtraction: 'none', documents: plan.documents };
  const files = [];
  const add = (file, bytes) => files.push({ path: file, size: bytes.length, sha256: hash(bytes), data: bytes.toString('base64') });
  for (const doc of fresh.documents) {
    const bytes = await readSource(sourceRoot, doc.sourcePath);
    if (hash(bytes) !== doc.sha256) throw new Error('Source changed during packaging; prepare a new plan.');
    add(doc.destinationPath, bytes);
  }
  add('notes/mobilize-receipt.md', Buffer.from('# Mobilize source receipt\n\nSource documents are preserved verbatim. Canon claims were not extracted.\n\n```json\n' + JSON.stringify(receipt, null, 2) + '\n```\n'));
  const manifest = { id: sourceProjectId, name: plan.projectName, createdAt: capturedAt, updatedAt: capturedAt,
    documents: [...plan.documents.map((doc) => ({ id: doc.id, title: doc.title, kind: doc.kind, path: doc.destinationPath, order: doc.order })),
      { id: 'mobilize-receipt', title: 'Mobilize source receipt', kind: 'notes', path: 'notes/mobilize-receipt.md', order: plan.documents.length + 1 }] };
  add('project.json', Buffer.from(JSON.stringify(manifest, null, 2)));
  const backup = { format: 'muse-project-backup', version: 1, sourceProjectId, capturedAt, files };
  if (files.reduce((total, file) => total + file.size, 0) > 50 * 1024 * 1024 || Buffer.byteLength(JSON.stringify(backup)) > 80 * 1024 * 1024) throw new Error('Bundle exceeds Muse backup limits.');
  return { backup, receipt };
}

async function readControl(file) {
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > 4 * 1024 * 1024) throw new Error('Selection or plan must be a regular JSON file under 4 MiB.');
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error('Control file changed while reading.');
      offset += bytesRead;
    }
    if (signature(before) !== signature(await handle.stat())) throw new Error('Control file changed while reading.');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { await handle.close(); }
}

async function writeArtifact(sourceRoot, destination, value) {
  const root = await fs.realpath(sourceRoot);
  const parent = await fs.realpath(path.dirname(path.resolve(destination)));
  const relative = path.relative(root, parent);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Output must be outside the source repository.');
  const output = path.join(parent, path.basename(destination));
  const temporary = await fs.mkdtemp(path.join(parent, '.mobilize-'));
  const staged = path.join(temporary, 'artifact.json');
  try {
    await fs.writeFile(staged, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    // Same-directory hard link publishes a complete file exclusively; EEXIST never overwrites.
    await fs.link(staged, output);
  } finally {
    await fs.unlink(staged).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    await fs.rmdir(temporary);
  }
  return output;
}

export async function runCli(args) {
  const [command, ...rest] = args;
  const names = command === 'preview' ? ['source', 'spec', 'out'] : command === 'bundle' ? ['source', 'plan', 'approve', 'out'] : [];
  if (!names.length || rest.length !== names.length * 2) throw new Error('Usage: preview --source DIR --spec FILE --out FILE | bundle --source DIR --plan FILE --approve HASH --out FILE');
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i].replace(/^--/, '');
    if (rest[i] !== `--${name}` || !names.includes(name) || Object.hasOwn(options, name) || !rest[i + 1]) throw new Error('Unknown, missing, or duplicate option.');
    options[name] = rest[i + 1];
  }
  if (command === 'preview') {
    const plan = await preparePlan(options.source, await readControl(options.spec));
    const output = await writeArtifact(options.source, options.out, plan);
    return { output, documents: plan.documents.length, approvalHash: plan.approvalHash, next: 'Review this exact plan and source selection before approving a bundle.' };
  }
  const { backup, receipt } = await createBundle(options.source, await readControl(options.plan), options.approve);
  const output = await writeArtifact(options.source, options.out, backup);
  return { output, documents: receipt.documents.length, planHash: receipt.planHash,
    next: 'Bundle only; not imported. Muse Backups restores this as a NEW project. Repeated restores create separate copies.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2)).then((result) => process.stdout.write(JSON.stringify(result, null, 2) + '\n'))
    .catch((error) => { process.stderr.write(`mobilize: ${error.message}\n`); process.exitCode = 1; });
}
