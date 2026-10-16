import { test, expect, png } from './fixtures';
import { readFile } from 'node:fs/promises';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';

async function jobReady(request:APIRequestContext,id:string){
  for(let n=0;n<300;n++){const response=await request.get(`/api/archive-jobs/${id}`);expect(response.ok()).toBeTruthy();const job=await response.json();if(['ready','failed','cancelled'].includes(job.state))return job;await new Promise(r=>setTimeout(r,100));}
  throw new Error('Edition job did not finish');
}
const studioData=(page:Page)=>page.evaluate(()=>JSON.parse(document.getElementById('msw-project-data')!.textContent!));
async function openStudio(context:BrowserContext){
  const html=await readFile(process.env.STUDIO_HTML!,'utf8');
  const page=await context.newPage();await page.route('https://studio.test/**',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('https://studio.test/?studio=1');await expect(page.locator('#editor-heading')).toBeVisible();return page;
}
async function importStudio(page:Page,json:string,count:number){
 await page.locator('#import-file').setInputFiles({name:'edition.storyweaver.json',mimeType:'application/json',buffer:Buffer.from(json)});
 await expect(page.locator('[aria-label="Studio project"] option')).toHaveCount(count);
}

test('select, order, acknowledge, export three chapters; preserve Studio slots and both readers',async({page,request,projectId,context},testInfo)=>{
 test.setTimeout(120_000);
 const first=(await(await request.get(`/api/projects/${projectId}/documents/chapter-01`)).json()).meta;
 const source='# Opening One\n\n**Bold *nested*** prose 😀 é.\n\n[Source label](https://example.com)\n\n<img src=x onerror=alert(1)>';
 await request.put(`/api/projects/${projectId}/documents/${first.id}`,{data:{content:source}});
 const docs=[first];
 for(const title of ['Chapter Two','Chapter Three']){const {meta}=await(await request.post(`/api/projects/${projectId}/documents`,{data:{title,kind:'manuscript'}})).json();docs.push(meta);await request.put(`/api/projects/${projectId}/documents/${meta.id}`,{data:{content:`# ${title}\n\nComplete prose for ${title}.\n\n---\n\nLast paragraph.`}});}
 const note=await(await request.post(`/api/projects/${projectId}/documents`,{data:{title:'Private notes',kind:'notes'}})).json();await request.put(`/api/projects/${projectId}/documents/${note.meta.id}`,{data:{content:'PRIVATE_NOTE_EXCLUDED'}});
 const uploaded=await(await request.post(`/api/projects/${projectId}/assets/images`,{data:{name:png.name,mimeType:png.mimeType,data:png.buffer.toString('base64')}})).json();const filename=uploaded.image.src.split('/').at(-1);
 await request.post(`/api/projects/${projectId}/assets/images`,{data:{name:'unselected.png',mimeType:png.mimeType,data:png.buffer.toString('base64')}});
 await page.getByRole('button',{name:/^Story Studio Transfer/}).click();const dialog=page.getByRole('dialog',{name:'Story Studio export'});
 await expect(dialog.getByLabel('Edition title',{exact:true})).toBeEnabled();await dialog.getByLabel('Edition title',{exact:true}).fill('Three chapter adaptation');
 await expect(dialog.getByRole('checkbox',{name:'Private notes',exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Move Chapter Three earlier',exact:true}).click();await dialog.getByRole('button',{name:'Move Chapter Three earlier',exact:true}).click();
 await dialog.locator('summary').filter({hasText:`Choose an image for ${first.title}`}).click();
 await dialog.getByRole('button',{name:`Add ${filename} to ${first.title}`,exact:true}).click();
 await dialog.getByLabel(`Caption ${first.title} image 1`,{exact:true}).fill('Selected caption');await dialog.getByLabel(`Alternative text ${first.title} image 1`,{exact:true}).fill('A chosen image');
 await dialog.getByRole('button',{name:'Preview edition',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('Preview ready',{timeout:30_000});
 await expect(dialog.locator('.edition-preview article>h2')).toHaveText(['Chapter Three',first.title,'Chapter Two']);
 await expect(dialog.locator('.edition-preview strong em')).toHaveText('nested');await expect(dialog.locator('.edition-preview script')).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'Export to Story Studio',exact:true})).toBeDisabled();await dialog.getByRole('checkbox',{name:'I reviewed these formatting changes.'}).check();
 await request.put(`/api/projects/${projectId}/documents/${first.id}`,{data:{content:source+'\n\nSaved revision.'}});
 await dialog.getByRole('button',{name:'Export to Story Studio',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Refresh the Story Studio preview',{timeout:30_000});
 await dialog.getByRole('button',{name:'Preview edition',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('Preview ready',{timeout:30_000});await dialog.getByRole('checkbox',{name:'I reviewed these formatting changes.'}).check();
 const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Export to Story Studio',exact:true}).click();const download=await pending;const json=await readFile((await download.path())!,'utf8');const portable=JSON.parse(json);
 expect(portable.scenes.map((s:any)=>s.title)).toEqual(['Chapter Three',first.title,'Chapter Two']);expect(portable.assets).toHaveLength(1);expect(portable.assets[0].caption).toBe('Selected caption');expect(json).not.toContain('PRIVATE_NOTE_EXCLUDED');expect(portable.scenes.every((s:any)=>s.choices.length===0)).toBeTruthy();expect(portable.schemaVersion).toBe('1.4.0');
 expect((await(await request.get(`/api/projects/${projectId}/documents/${first.id}`)).json()).content).toBe(source+'\n\nSaved revision.');
 await expect(dialog.getByRole('status')).toContainText('Download requested');await dialog.locator('.project-tools-body').evaluate(el=>el.scrollTop=0);await page.screenshot({path:testInfo.outputPath('edition-preview.png')});
 await dialog.getByRole('button',{name:'Back to workspace'}).click();await page.reload();await page.getByRole('button',{name:/^Story Studio Transfer/}).click();await expect(dialog.getByLabel('Edition title',{exact:true})).toHaveValue('Three chapter adaptation');await expect(dialog.getByLabel(`Caption ${first.title} image 1`,{exact:true})).toHaveValue('Selected caption');await dialog.getByRole('button',{name:'Back to workspace'}).click();
 if(!process.env.STUDIO_HTML)return;
 const studio=await openStudio(context),errors:string[]=[];studio.on('pageerror',error=>errors.push(error.message));const original=await studioData(studio),select=studio.locator('[aria-label="Studio project"]'),oldSlot=await select.inputValue();
 await importStudio(studio,json,2);const firstImport=await select.inputValue();await studio.reload();await expect(select).toHaveValue(firstImport);expect((await studioData(studio)).scenes.map((s:any)=>s.blocks)).toEqual(portable.scenes.map((s:any)=>s.blocks.map((b:any)=>({...b,narrationAssetId:'',narrationText:'',narrationType:'',narrationSpeaker:''}))));
 await importStudio(studio,json,3);expect(await select.inputValue()).not.toBe(firstImport);
 const prose=studio.locator('[data-edit-path="scene.blocks.1.text"]');await prose.fill(portable.scenes[0].blocks[1].text+' Edited in Studio.');await prose.press('Control+s');await expect(studio.locator('#save-state')).toContainText('Saved locally');await studio.reload();await expect(prose).toHaveValue(portable.scenes[0].blocks[1].text+' Edited in Studio.');
 const originalState=await studio.evaluate(async({slot,asset})=>{const lib=new (window as any).StudioProjectLibrary();return {title:(await lib.read(slot)).project.project.title,size:(await lib.blob(slot,asset))?.size}},{slot:oldSlot,asset:original.assets[0].id});expect(originalState.title).toBe(original.project.title);expect(originalState.size).toBeGreaterThan(0);
 await studio.locator('[data-action="preview"]').first().click();let shell=studio.locator('.player-shell:not(.leaving)');await expect(shell.locator('[data-block-id]').first()).toBeVisible();await shell.locator('[data-action="toggle-scroll-mode"]').click();await shell.locator('[data-action="player-next"]').click();await expect(shell.locator('.passage strong em')).toHaveText('nested');await expect(shell.locator('img[alt="A chosen image"]')).toBeVisible();await shell.locator('[data-action="close-player"]').click();
 await studio.locator('[data-action="open-export"]').first().click();const readerPending=studio.waitForEvent('download');await studio.locator('[data-action="export-player"]').click();const readerDownload=await readerPending;const readerHtml=await readFile((await readerDownload.path())!,'utf8');expect(readerHtml).not.toContain('museOrigin');
 const reader=await context.newPage();await reader.route('https://reader.test/**',route=>route.fulfill({contentType:'text/html',body:readerHtml}));await reader.setViewportSize({width:320,height:844});await reader.goto('https://reader.test/');await reader.getByRole('button',{name:'Begin story'}).click();const rs=reader.locator('.shell:not(.leaving)');await rs.locator('[data-action="scroll"]').click();await rs.locator('[data-action="next"]').click();await expect(rs.locator('.passage strong em')).toHaveText('nested');await expect(rs.locator('img[alt="A chosen image"]')).toBeVisible();await reader.waitForFunction(()=>{const img=document.querySelector('img[alt="A chosen image"]') as HTMLImageElement;return img?.complete&&img.naturalWidth>0});expect(await reader.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await reader.waitForFunction(()=>!document.querySelector('.shell.leaving')&&!document.getAnimations().some(animation=>animation.playState==='running'&&animation.effect?.getComputedTiming().iterations!==Infinity));await rs.locator('img[alt="A chosen image"]').scrollIntoViewIfNeeded();await reader.screenshot({path:testInfo.outputPath('studio-reader-320.png')});expect(errors).toEqual([]);
});

test('120,000-word novel saves, reopens, orders, exports and survives Studio reload',async({request,projectId,context})=>{
 test.skip(!process.env.STUDIO_HTML,'Set STUDIO_HTML to an editable Studio build for cross-project acceptance.');test.setTimeout(180_000);
 const docs:{id:string;content:string}[]=[];
 for(let n=0;n<40;n++){
  const {meta}=await(await request.post(`/api/projects/${projectId}/documents`,{data:{title:`Novel chapter ${n+1}`,kind:'manuscript'}})).json();
  const content=Array.from({length:3000},(_,word)=>`chapter${n}word${word}`).join(' ');const response=await request.put(`/api/projects/${projectId}/documents/${meta.id}`,{data:{content}});expect(response.ok()).toBeTruthy();docs.push({id:meta.id,content});
 }
 for(const doc of docs)expect((await(await request.get(`/api/projects/${projectId}/documents/${doc.id}`)).json()).content).toBe(doc.content);
 docs.reverse();const recipe={version:1,id:'novel-edition',title:'Novel acceptance',author:'',documentIds:docs.map(doc=>doc.id),images:[]};
 expect((await request.put(`/api/projects/${projectId}/editions/novel-edition`,{data:{recipe}})).ok()).toBeTruthy();
 const p=await(await request.post(`/api/projects/${projectId}/editions/preview-jobs`,{data:{recipe}})).json();expect((await jobReady(request,p.id)).state).toBe('ready');const preview=await(await request.get(`/api/archive-jobs/${p.id}/edition-preview`)).json();
 const e=await(await request.post(`/api/projects/${projectId}/editions/export-jobs`,{data:{recipe,snapshotHash:preview.snapshotHash}})).json();expect((await jobReady(request,e.id)).state).toBe('ready');const json=await(await request.get(`/api/archive-jobs/${e.id}/download`)).text();
 const studio=await openStudio(context);await importStudio(studio,json,2);await studio.reload();await expect(studio.locator('#editor-heading')).toBeVisible();const saved=await studioData(studio);
 expect(saved.scenes.map((s:any)=>s.blocks.map((b:any)=>b.text).join('\n'))).toEqual(docs.map(doc=>doc.content));expect(saved.scenes.reduce((n:number,s:any)=>n+s.blocks[0].text.split(' ').length,0)).toBe(120_000);
 await request.delete(`/api/archive-jobs/${p.id}`);await request.delete(`/api/archive-jobs/${e.id}`);
});

for(const width of [320,390]) test(`Story Studio selection and preview fit ${width}px`,async({page,request,projectId},testInfo)=>{
 await page.setViewportSize({width,height:844});
 await request.put(`/api/projects/${projectId}/documents/chapter-01`,{data:{content:'# Mobile chapter\n\n**Readable** selected prose.'}});
 // Opening through the app event avoids depending on the collapsed mobile sidebar.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('muse:project-tool',{detail:{tool:'story-studio'}})));
 const dialog=page.getByRole('dialog',{name:'Story Studio export'});
 await expect(dialog.getByLabel('Edition title',{exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'Preview edition',exact:true}).click();
 await expect(dialog.getByRole('status')).toContainText('Preview ready',{timeout:30_000});
 await expect(dialog.locator('.edition-preview strong')).toHaveText('Readable');
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();
 expect(await dialog.locator('.project-tools-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy();
 const label=dialog.locator('label.check-row').first();expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await dialog.locator('.edition-preview').scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath(`edition-${width}.png`)});
});
