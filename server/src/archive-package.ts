import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import yauzl from 'yauzl';

/** Package inputs are internal files, already selected and captured by the worker. */
export async function writeVerifiedPackage(files: { name: string; path: string }[], destination: string, signal: AbortSignal) {
  const expected = new Map<string, { size: number; sha256: string }>();
  for (const file of files) {
    const hash = createHash('sha256'); let size = 0;
    for await (const chunk of createReadStream(file.path, { signal })) { hash.update(chunk); size += chunk.length; }
    expected.set(file.name, { size, sha256: hash.digest('hex') });
  }
  const zip = new yazl.ZipFile();
  const output = createWriteStream(destination, { flags: 'wx', mode: 0o600 });
  zip.on('error', error => output.destroy(error));
  const done = pipeline(zip.outputStream, output, { signal });
  for (const file of files) zip.addFile(file.path, file.name, { compress: !file.name.endsWith('.zip'), mode: 0o100600 });
  zip.end(); await done;
  const reader = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.open(destination, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true, autoClose: false },
    (error, result) => error ? reject(error) : resolve(result!)));
  try {
    await new Promise<void>((resolve, reject) => {
      const seen = new Set<string>();
      reader.on('error', reject);
      reader.on('end', () => seen.size === expected.size ? resolve() : reject(new Error('Package missing expected files.')));
      reader.on('entry', entry => {
        void (async () => {
          signal.throwIfAborted();
          const metadata = expected.get(entry.fileName);
          if (!metadata || seen.has(entry.fileName) || metadata.size !== entry.uncompressedSize) throw new Error('Package entry mismatch.');
          seen.add(entry.fileName);
          const stream = await new Promise<NodeJS.ReadableStream>((yes, no) => reader.openReadStream(entry, (error, value) => error ? no(error) : yes(value!)));
          const hash = createHash('sha256');
          await pipeline(stream, new Writable({ write(chunk, _encoding, cb) { hash.update(chunk); cb(); } }), { signal });
          if (hash.digest('hex') !== metadata.sha256) throw new Error('Package checksum mismatch.');
          reader.readEntry();
        })().catch(reject);
      });
      reader.readEntry();
    });
  } finally { reader.close(); }
  const file = await fs.open(destination, 'r');
  try { await file.sync(); } finally { await file.close(); }
}
