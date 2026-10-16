import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildEdition, editionCatalog } from '../src/edition-export.js';
import { ArchiveJobs } from '../src/archive-jobs.js';
const filename = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVbkAAAAASUVORK5CYII=', 'base64');
async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'muse-edition-export-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const source=path.join(root,'source');await fs.mkdir(path.join(source,'manuscript'),{recursive:true});await fs.mkdir(path.join(source,'assets/images'),{recursive:true});
  const documents=[1,2,3].map(n=>({id:`doc-${n}`,title:`Chapter ${n}`,kind:'manuscript',path:`manuscript/${n}.md`,order:n}));
  await fs.writeFile(path.join(source,'project.json'),JSON.stringify({id:'sample',name:'Private project name',documents}));
  for(const n of [1,2,3])await fs.writeFile(path.join(source,`manuscript/${n}.md`),`# Opening ${n}\n\nChapter ${n}: **bold *inside***.\n\n---\n\nEnd.`);
  await fs.writeFile(path.join(source,'assets/images',filename),png);
  await fs.mkdir(path.join(source,'notes'));await fs.writeFile(path.join(source,'notes/private.md'),'PRIVATE NOTES NEVER EXPORTED');
  const recipe={version:1,id:'edition',title:'Three chapters',author:'Author',documentIds:['doc-3','doc-1','doc-2'],images:[{id:'placement',documentId:'doc-1',filename,caption:'Chosen caption',alt:'Chosen alternative'}]};
  return {root,source,recipe};
}
async function ready(jobs:ArchiveJobs,id:string){
 for(let n=0;n<300;n++){const job=await jobs.get(id);if(['ready','failed','cancelled'].includes(job.state))return job;await new Promise(r=>setTimeout(r,20));}
 throw new Error('Edition job timed out');
}
test('selected three chapters preserve order, formatting, images and author provenance only',async t=>{
 const f=await fixture(t),built=await buildEdition(f.source,'sample',f.recipe),p=JSON.parse(built.json);
 assert.deepEqual(p.scenes.map((s:any)=>s.title),['Chapter 3','Chapter 1','Chapter 2']);
 assert.equal(p.entrySceneId,p.scenes[0].id);assert.equal(p.scenes[0].nextSceneId,p.scenes[1].id);assert.equal(p.scenes[2].ending,true);assert.equal(p.scenes[2].nextSceneId,'');
 assert.ok(p.scenes.every((s:any)=>s.choices.length===0));assert.equal(p.scenes[1].blocks[0].level,1);
 assert.equal(p.scenes[1].blocks[1].marks.length,2);assert.equal(p.scenes[1].media.items.length,1);
 assert.equal(p.assets[0].dataUrl,`data:image/png;base64,${png.toString('base64')}`);assert.equal(p.assets[0].caption,'Chosen caption');
 assert.equal(p.museOrigin.mapping[0].documentId,'doc-3');assert.ok(!built.json.includes('PRIVATE'));assert.ok(!built.json.includes('Private project name'));
 assert.equal(built.preview.encodedBytes,Buffer.byteLength(built.json));
 const second=await buildEdition(f.source,'sample',f.recipe);assert.equal(second.preview.snapshotHash,built.preview.snapshotHash);assert.deepEqual(JSON.parse(second.json).scenes,p.scenes);
 const catalog=await editionCatalog(f.source,'sample');assert.equal(catalog.documents.length,3);assert.equal(catalog.images[0].filename,filename);
});
test('unselected prose and huge private assets do not affect selected export',async t=>{
 const f=await fixture(t);f.recipe.documentIds=['doc-1'];const first=await buildEdition(f.source,'sample',f.recipe);
 await fs.writeFile(path.join(f.source,'manuscript/2.md'),'PRIVATE CHANGED');
 const file=await fs.open(path.join(f.source,'assets/unselected.bin'),'w');await file.truncate(3*1024**3);await file.close();
 const second=await buildEdition(f.source,'sample',f.recipe,{expectedHash:first.preview.snapshotHash});assert.equal(second.preview.snapshotHash,first.preview.snapshotHash);assert.equal(JSON.parse(second.json).scenes.length,1);
});
test('changed selected bytes, recipe and observed concurrent edits reject stale capture',async t=>{
 const f=await fixture(t),first=await buildEdition(f.source,'sample',f.recipe);
 await assert.rejects(buildEdition(f.source,'sample',{...f.recipe,title:'Changed'},{expectedHash:first.preview.snapshotHash}),/Refresh/);
 await fs.appendFile(path.join(f.source,'assets/images',filename),'changed');
 await assert.rejects(buildEdition(f.source,'sample',f.recipe,{expectedHash:first.preview.snapshotHash}),/Refresh/);
 await assert.rejects(buildEdition(f.source,'sample',f.recipe,{afterCapture:()=>fs.appendFile(path.join(f.source,'manuscript/1.md'),'edit')}),/Refresh/);
});
test('unsupported formatting requires acknowledgement and cannot be bypassed by stale hash',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.source,'manuscript/1.md'),'[Link](https://example.com)');
 const first=await buildEdition(f.source,'sample',f.recipe);assert.equal(first.preview.warnings[0].documentId,'doc-1');
 await assert.rejects(buildEdition(f.source,'sample',f.recipe,{exporting:true,expectedHash:first.preview.snapshotHash}),/acknowledge/);
 await buildEdition(f.source,'sample',f.recipe,{exporting:true,expectedHash:first.preview.snapshotHash,acknowledgeWarnings:true});
});
test('symlinks, traversal, missing documents and invalid UTF-8 reject',async t=>{
 const f=await fixture(t);await fs.unlink(path.join(f.source,'manuscript/1.md'));await fs.symlink(path.join(f.source,'notes/private.md'),path.join(f.source,'manuscript/1.md'));
 await assert.rejects(buildEdition(f.source,'sample',f.recipe),/symlink/);
 await fs.unlink(path.join(f.source,'manuscript/1.md'));await fs.writeFile(path.join(f.source,'manuscript/1.md'),Buffer.from([255]));
 await assert.rejects(buildEdition(f.source,'sample',f.recipe),/encoded data/);
 await assert.rejects(buildEdition(f.source,'sample',{...f.recipe,documentIds:['absent'],images:[]}),/missing/);
 const p=JSON.parse(await fs.readFile(path.join(f.source,'project.json'),'utf8'));p.documents[0].path='manuscript/../notes/private.md';await fs.writeFile(path.join(f.source,'project.json'),JSON.stringify(p));
 await assert.rejects(buildEdition(f.source,'sample',f.recipe),/Unsafe/);
});
test('image preflight and exact serialized size enforce separate 64 MiB cap',async t=>{
 const f=await fixture(t),file=await fs.open(path.join(f.source,'assets/images',filename),'w');
 await file.truncate(49*1024**2);await file.close();await assert.rejects(buildEdition(f.source,'sample',f.recipe),/Encoded selected images.*Largest selected images/);
 const exact=await fs.open(path.join(f.source,'assets/images',filename),'w');await exact.truncate(48*1024**2);await exact.close();
 await assert.rejects(buildEdition(f.source,'sample',f.recipe),/Encoded Story Studio file.*Largest selected images/);
});
test('preview/export jobs survive restart and never update recovery status',async t=>{
 const f=await fixture(t);const directory=path.join(f.root,'jobs');let jobs=new ArchiveJobs(directory);t.after(()=>jobs.close());
 const preview=await jobs.createEdition('sample',f.source,f.recipe,'preview');assert.equal((await ready(jobs,preview.id)).state,'ready');
 const data=JSON.parse(await fs.readFile(await jobs.editionPreview(preview.id),'utf8'));assert.equal(data.scenes.length,3);
 const exported=await jobs.createEdition('sample',f.source,f.recipe,'export',data.snapshotHash);assert.equal((await ready(jobs,exported.id)).state,'ready');
 assert.deepEqual(await jobs.status('sample'),{});await jobs.close();jobs=new ArchiveJobs(directory);
 const download=await jobs.download(exported.id);assert.equal(download.type,'application/json');assert.match(download.name,/storyweaver.json$/);assert.equal(JSON.parse(await fs.readFile(download.path,'utf8')).scenes.length,3);
 await jobs.cancel(preview.id);await jobs.cancel(exported.id);await assert.rejects(fs.stat(download.path),/ENOENT/);
});

test('bounded metadata read reports its actual 16 MiB budget',async t=>{
 const f=await fixture(t),file=await fs.open(path.join(f.source,'project.json'),'w');
 await file.truncate(17*1024**2);await file.close();
 await assert.rejects(buildEdition(f.source,'sample',f.recipe),/project.json: 17,825,792 bytes; remaining input budget 16,777,216 bytes/);
});
