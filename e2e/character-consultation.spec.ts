import { test, expect, png } from './fixtures';

async function seed(request:any,projectId:string){
 const response=await request.post(`/api/projects/${projectId}/canon/entities`,{data:{type:'character',name:'Consult keeper',aliases:['Keeper']}});
 expect(response.ok()).toBeTruthy();return (await response.json()).entity;
}

test('consult beside manuscript; preserve selection, scroll, arrangement, live form and undo',async({page,request,projectId},info)=>{
 await page.setViewportSize({width:1440,height:1000});await seed(request,projectId);
 const draft=page.locator('.pane-editor textarea.draft'),question=page.getByPlaceholder('Ask Muse…');
 await question.fill('Keep this unsent question');
 const prose=Array.from({length:120},(_,i)=>`Paragraph ${i}. The writer keeps their place.`).join('\n\n');
 await draft.fill(prose);await draft.evaluate((el:HTMLTextAreaElement)=>{el.focus();el.setSelectionRange(140,170,'backward');el.scrollTop=450;(window as any).consultDraft=el});
 const before=await draft.evaluate((el:HTMLTextAreaElement)=>({top:el.scrollTop,width:el.clientWidth,height:el.clientHeight}));
 await page.getByRole('button',{name:/^Characters /}).click();
 const reference=page.getByRole('region',{name:'Character reference',exact:true});await expect(reference).toBeVisible();await expect(draft).toBeVisible();
 expect(await draft.evaluate(el=>el===(window as any).consultDraft)).toBeTruthy();
 const a=(await draft.boundingBox())!,b=(await reference.boundingBox())!;expect(a.x+a.width).toBeLessThanOrEqual(b.x);
 await reference.getByRole('button',{name:'Edit dossier',exact:true}).click();
 const form=reference.getByRole('dialog',{name:'Revise Consult keeper',exact:true});await expect(form).toBeVisible();
 await form.getByPlaceholder('Character name').fill('Kept unfinished');await form.evaluate(el=>(window as any).consultForm=el);
 await reference.getByRole('button',{name:'Return to writing',exact:true}).click();await expect(draft).toBeFocused();
 expect(await draft.evaluate((el:HTMLTextAreaElement)=>[el.selectionStart,el.selectionEnd,el.selectionDirection])).toEqual([140,170,'backward']);
 expect(await draft.evaluate(el=>el.scrollTop)).toBeCloseTo(before.top,0);await expect(question).toHaveValue('Keep this unsent question');await expect(draft).toHaveValue(prose);
 await page.getByRole('button',{name:/^Characters /}).click();await expect(page.getByRole('navigation',{name:'Collapsed editors',exact:true})).toBeHidden();await reference.getByRole('button',{name:'Edit dossier',exact:true}).click();
 await expect(form.getByPlaceholder('Character name')).toHaveValue('Kept unfinished');expect(await form.evaluate(el=>el===(window as any).consultForm)).toBeTruthy();
 await form.getByRole('button',{name:'Save changes',exact:true}).click();await expect(form).toBeHidden();await expect(reference.getByRole('heading',{name:'Kept unfinished',exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('consult-desktop.png')});
 await reference.getByRole('button',{name:'Return to writing',exact:true}).click();await expect(draft).toBeFocused();
 await draft.press('ArrowRight');await draft.press('x');await draft.press('Control+z');await expect(draft).toHaveValue(prose);
});

test('latest writing position wins; full Cast and explicit workspace navigation remain available',async({page,request,projectId})=>{
 await page.setViewportSize({width:1440,height:1000});await seed(request,projectId);
 const draft=page.locator('.pane-editor textarea.draft');await draft.click();
 await page.getByRole('button',{name:/^Characters /}).click();const reference=page.getByRole('region',{name:'Character reference',exact:true});
 await draft.press('Control+End');await draft.press('x');const position=await draft.evaluate((el:HTMLTextAreaElement)=>el.selectionStart);
 await reference.getByRole('button',{name:'Return to writing',exact:true}).click();await expect(draft).toBeFocused();expect(await draft.evaluate((el:HTMLTextAreaElement)=>el.selectionStart)).toBe(position);
 await page.getByRole('button',{name:/^Characters /}).click();await reference.getByRole('button',{name:'Open full Cast',exact:true}).click();
 await expect(page.getByRole('button',{name:'Restore Cast to workspace',exact:true})).toBeVisible();await expect(page.locator('.pane-characters')).toHaveCount(1);
 await page.getByRole('button',{name:'Planning',exact:true}).click();await page.getByRole('button',{name:/^Characters /}).click();await expect(reference).toBeHidden();
});

for(const width of [320,390])test(`editable reference sheet fits ${width}px and preserves form across resize`,async({page,request,projectId},info)=>{
 await seed(request,projectId);await page.setViewportSize({width,height:844});
 await page.getByRole('button',{name:/^Characters/}).click();const sheet=page.getByRole('dialog',{name:'Character reference',exact:true});
 await expect(sheet).toBeVisible();await sheet.getByRole('button',{name:'Edit dossier',exact:true}).click();const input=page.locator('.consultation-sheet').getByPlaceholder('Character name');
 await input.fill('Resize keeper');await input.evaluate(el=>(window as any).mobileForm=el);
 await page.setViewportSize({width:1440,height:1000});await expect(input).toHaveValue('Resize keeper');expect(await input.evaluate(el=>el===(window as any).mobileForm)).toBeTruthy();
 await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
 await sheet.getByRole('button',{name:'Return to writing',exact:true}).focus();await page.keyboard.press('Shift+Tab');expect(await sheet.evaluate(el=>el.contains(document.activeElement))).toBeTruthy();
 await page.screenshot({path:info.outputPath(`consult-${width}.png`)});
 await input.press('Escape');await expect(input).toBeHidden();await expect(sheet).toBeVisible();await sheet.press('Escape');
 await expect(sheet).toBeHidden();await expect(page.locator('.pane-editor textarea.draft')).toBeFocused();
});

test('save failure retains editable draft; cast load failure can retry',async({page,request,projectId})=>{
 await seed(request,projectId);await page.route('**/canon',route=>route.fulfill({status:500,json:{error:'Injected cast failure'}}));
 await page.getByRole('button',{name:/^Characters /}).click();await page.getByRole('button',{name:'Retry loading cast',exact:true}).waitFor();await page.unroute('**/canon');
 await page.getByRole('button',{name:'Retry loading cast',exact:true}).click();await page.getByRole('button',{name:'Edit dossier',exact:true}).click();
 await page.route('**/canon/entities/*',route=>route.fulfill({status:500,json:{error:'Injected save failure'}}));
 await page.getByPlaceholder('Character name').fill('Failed save kept');await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.getByPlaceholder('Character name')).toHaveValue('Failed save kept');await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeEnabled();
});

test('empty cast, reduced motion, explicit Cancel and runtime pane exclusion',async({page,projectId})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:/^Characters /}).click();
 const reference=page.locator('.consultation-sheet');await expect(reference.getByRole('heading',{name:'No one has entered yet.'})).toBeVisible();
 expect(await reference.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await reference.getByRole('button',{name:'Add first character',exact:true}).click();await reference.getByPlaceholder('Character name').fill('Discard this draft');
 await reference.getByRole('button',{name:'Cancel',exact:true}).click();await expect(reference.getByPlaceholder('Character name')).toBeHidden();
 await reference.getByRole('button',{name:'Return to writing',exact:true}).click();
 // Saved desks serialize layout, not session-only companion hosts.
 await page.getByRole('button',{name:'Saved desks',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Your desks',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByLabel('Desk name').fill('Underlying arrangement');
 await dialog.getByRole('button',{name:'Save desk',exact:true}).click();
 const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem(`muse:desks:v1:${id}`)!),projectId);
 expect(saved[0].panes.some((pane:any)=>pane.sessionOnly || pane.type==='characters')).toBe(false);
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('muse:draft:v1:')).length)).toBe(0);
});

test('project switch ends consultation after parking character draft',async({page,request,projectId})=>{
 const name=`Consult switch ${Date.now()}`;const other=await(await request.post('/api/projects',{data:{name}})).json();
 await page.reload();
 await seed(request,projectId);await page.getByRole('button',{name:/^Characters /}).click();await page.getByRole('button',{name:'Edit dossier',exact:true}).click();
 await page.getByPlaceholder('Character name').fill('Parked across project switch');
 await page.getByRole('button',{name:'Return to writing',exact:true}).click();
 await page.getByRole('button',{name:'Project menu',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();
 await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();await expect(page.locator('.character-consultation')).toBeHidden();
 expect(other.project.id).not.toBe(projectId);
});


test('pending image upload survives parking the same form', async ({ page, request, projectId }) => {
 await seed(request, projectId);
 let release!: () => void;
 const gate = new Promise<void>(resolve => { release = resolve; });
 await page.route('**/assets/images', async route => { await gate; await route.continue(); });
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click();
 await page.getByRole('button', { name: 'Edit dossier', exact: true }).click();
 const form = page.getByRole('dialog', { name: 'Revise Consult keeper', exact: true });
 await form.locator('input[type=file]').setInputFiles(png);
 await expect(form.getByRole('button', { name: 'Adding images…', exact: true })).toBeDisabled();
 await page.getByRole('button', { name: 'Return to writing', exact: true }).click();
 await expect(page.locator('.pane-editor textarea.draft')).toBeFocused();
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click();
 await page.getByRole('button', { name: 'Edit dossier', exact: true }).click();
 await expect(form.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
 release();
 await expect(form.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
 await expect(form.locator('.image-gallery-editor img')).toHaveCount(1);
 await form.getByRole('button', { name: 'Save changes', exact: true }).click();
 await expect(form).toBeHidden();
 const { canon } = await (await request.get(`/api/projects/${projectId}/canon`)).json();
 expect(canon.entities[0].character.references.images).toHaveLength(1);
});

test('nested dialog Escape, composition, and browser fullscreen do not close consultation', async ({ page, request, projectId }) => {
 await seed(request, projectId); await page.setViewportSize({ width: 390, height: 844 });
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click();
 await page.getByRole('button', { name: 'Edit dossier', exact: true }).click();
 const form = page.getByRole('dialog', { name: 'Revise Consult keeper', exact: true });
 await form.getByRole('button', { name: 'Tags and links', exact: true }).click();
 const links = page.getByRole('dialog', { name: 'Tags and connections', exact: true });
 await expect(links).toBeVisible(); await links.press('Escape');
 await expect(links).toBeHidden(); await expect(form).toBeVisible();
 const input = form.getByPlaceholder('Character name');
 await input.dispatchEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true });
 await expect(form).toBeVisible();
 // Browser fullscreen owns Escape; synthesize its key event while fullscreen is active.
 await form.evaluate(el => el.requestFullscreen());
 await input.dispatchEvent('keydown', { key: 'Escape', bubbles: true });
 await expect(form).toBeVisible();
 await page.evaluate(() => document.exitFullscreen());
 await input.press('Escape'); await expect(form).toBeHidden();
 await page.getByRole('dialog', { name: 'Character reference', exact: true }).press('Escape');
 await expect(page.locator('.pane-editor textarea.draft')).toBeFocused();
});

test('unavailable recovery storage preserves parked form and blocks project switch', async ({ page, request, projectId }) => {
 const { project: other } = await (await request.post('/api/projects', { data: { name: `Recovery destination ${Date.now()}` } })).json();
 await page.reload(); await seed(request, projectId);
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click(); await page.getByRole('button', { name: 'Edit dossier', exact: true }).click();
 await page.evaluate(() => {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
   if (key.startsWith('muse:draft:')) throw new DOMException('Injected full storage', 'QuotaExceededError');
   return original.call(this, key, value);
  };
 });
 await page.getByPlaceholder('Character name').fill('Kept in memory');
 await expect(page.getByRole('complementary', { name: 'Draft recovery' })).toBeVisible();
 await page.getByRole('button', { name: 'Return to writing', exact: true }).click();
 await page.getByRole('button', { name: 'Project menu', exact: true }).click();
 await page.getByRole('button', { name: other.name, exact: true }).click();
 await expect(page.getByText('Browser recovery is unavailable for some edits. Save or copy your unfinished writing before switching projects.', { exact: true })).toBeVisible();
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click(); await page.getByRole('button', { name: 'Edit dossier', exact: true }).click();
 await expect(page.getByPlaceholder('Character name')).toHaveValue('Kept in memory');
});

test('active consultation invalidates on project switch during save without closing new project form', async ({ page, request, projectId }) => {
 await seed(request, projectId);
 const { project: other } = await (await request.post('/api/projects', { data: { name: `Save destination ${Date.now()}` } })).json();
 let release!: () => void;
 const gate = new Promise<void>(resolve => { release = resolve; });
 await page.route(`**/projects/${projectId}/canon/entities/*`, async route => { await gate; await route.continue(); });
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click(); await page.getByRole('button', { name: 'Edit dossier', exact: true }).click();
 await page.getByPlaceholder('Character name').fill('Old project save');
 await page.getByRole('button', { name: 'Save changes', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
 // Exercise the same store command used by navigation while its chrome is suppressed.
 await page.evaluate(async id => { const { useStore } = await import('/src/store.ts'); await useStore.getState().openProject(id); }, other.id);
 await expect(page.locator('.character-consultation')).toBeHidden();
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click(); await page.getByRole('button', { name: 'Add first character', exact: true }).click();
 await page.getByPlaceholder('Character name').fill('New project stays open');
 const completed = page.waitForResponse(response => response.url().includes(`/projects/${projectId}/canon/entities/`) && response.request().method() === 'PUT');
 release(); await completed;
 await expect(page.getByPlaceholder('Character name')).toHaveValue('New project stays open');
 const { canon } = await (await request.get(`/api/projects/${other.id}/canon`)).json(); expect(canon.entities).toHaveLength(0);
});

test('repeated consultation, underlying desk capture, and removed manuscript preserve workspace state', async ({ page, request, projectId }) => {
 await seed(request, projectId);
 const underlying = await page.evaluate(async () => { const { useStore } = await import('/src/store.ts'); return useStore.getState().panes; });
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click();
 await page.evaluate(async () => { const { beginCharacterConsultation } = await import('/src/characterConsultation.ts'); beginCharacterConsultation(); beginCharacterConsultation(); });
 await expect(page.locator('.pane-characters')).toHaveCount(1);
 // Invoke existing capture action while paired presentation is active.
 await page.getByRole('button', { name: 'Saved desks', exact: true, includeHidden: true }).evaluate(el => (el as HTMLButtonElement).click());
 const desks = page.getByRole('dialog', { name: 'Your desks', exact: true });
 await desks.getByLabel('Desk name').fill('Original workspace'); await desks.getByRole('button', { name: 'Save desk', exact: true }).click();
 const saved = await page.evaluate(id => JSON.parse(localStorage.getItem(`muse:desks:v1:${id}`)!)[0], projectId);
 expect(saved.panes).toEqual(underlying.map(({ id, ...pane }: any) => pane));
 await desks.getByRole('button', { name: 'Close saved desks', exact: true }).click();
 await page.evaluate(async () => {
  const { useStore } = await import('/src/store.ts'); const { useCharacterConsultation } = await import('/src/characterConsultation.ts');
  useStore.getState().closePane(useCharacterConsultation.getState().current!.paneId);
 });
 await expect(page.locator('.character-consultation')).toBeHidden();
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click();
 await expect(page.getByRole('button', { name: 'Restore Cast to workspace', exact: true })).toBeVisible();
});


test('floating manuscript and minimized tools retain exact arrangement after consultation', async ({ page, request, projectId }) => {
 await seed(request, projectId); await page.setViewportSize({ width: 1440, height: 1000 });
 await page.evaluate(async () => {
  const { useStore } = await import('/src/store.ts'); const s = useStore.getState();
  s.openPane('characters', { title: 'Cast' });
  for (const pane of useStore.getState().panes) {
   if (pane.type === 'characters' || pane.type === 'agent') s.setPaneSize(pane.id, 'minimized');
   if (pane.type === 'editor') s.floatPane(pane.id, { x: 370, y: 200, width: 600, height: 500 });
   if (pane.type === 'notes') s.floatPane(pane.id, { x: 1000, y: 200, width: 300, height: 350 });
  }
 });
 const before = await page.evaluate(async () => { const { useStore } = await import('/src/store.ts'); return useStore.getState().panes; });
 await page.getByRole('button', { name: 'Open tool drawer', exact: true }).click();
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click();
 await expect(page.getByRole('button', { name: 'Open tool drawer', exact: true })).toBeHidden();
 await expect(page.getByRole('button', { name: 'Edit dossier', exact: true })).toBeVisible();
 await page.getByRole('button', { name: 'Return to writing', exact: true }).click();
 await expect(page.locator('.pane-editor textarea.draft')).toBeFocused();
 await expect(page.getByRole('region', { name: 'Parked workspace tools', exact: true })).toBeVisible();
 const after = await page.evaluate(async () => { const { useStore } = await import('/src/store.ts'); return useStore.getState().panes; });
 expect(after).toEqual(before);
});

test('ambiguous manuscripts fall back to Cast; last interacted manuscript is selected', async ({ page, request, projectId }) => {
 await seed(request, projectId);
 const { meta } = await (await request.post(`/api/projects/${projectId}/documents`, { data: { title: 'Chapter Two', kind: 'manuscript' } })).json();
 await page.reload(); await page.setViewportSize({ width: 1440, height: 1000 });
 await expect(page.getByRole('button', { name: 'Drafting', exact: true })).toBeVisible();
 await page.evaluate(async id => {
  const { useStore } = await import('/src/store.ts'); const { useWritingView } = await import('/src/writingView.ts');
  useStore.getState().openPane('editor', { bindingId: id }); useWritingView.setState({ lastWritingPaneId: null });
 }, meta.id);
 await expect(page.locator('.pane-editor textarea.draft')).toHaveCount(2);
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click();
 await expect(page.locator('.character-consultation')).toBeHidden();
 await page.getByRole('button', { name: 'Restore Cast to workspace', exact: true }).click();
 const second = page.locator('.pane-editor').filter({ has: page.getByRole('button', { name: 'Move Chapter Two', exact: true }) }).locator('textarea');
 await second.fill('Chapter two remains the writing target.');
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click();
 await expect(page.locator('.consultation-writing textarea')).toHaveValue('Chapter two remains the writing target.');
 await page.getByRole('button', { name: 'Return to writing', exact: true }).click(); await expect(second).toBeFocused();
});

test('workspace switch parks form; character navigation exits Focus to reveal destination', async ({ page, request, projectId }) => {
 await seed(request, projectId);
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click(); await page.getByRole('button', { name: 'Edit dossier', exact: true }).click();
 await page.getByPlaceholder('Character name').fill('Workspace draft stays');
 await page.evaluate(async () => { const { useStore } = await import('/src/store.ts'); await useStore.getState().applyWorkspace('planning'); });
 await expect(page.locator('.character-consultation')).toBeHidden();
 await page.getByRole('button', { name: 'Recall Revise Consult keeper', exact: true }).click();
 await expect(page.getByPlaceholder('Character name')).toHaveValue('Workspace draft stays');
 await page.getByPlaceholder('Character name').press('Escape');
 await page.getByRole('button', { name: 'Drafting', exact: true }).click();
 await page.getByRole('button', { name: 'Focus writing', exact: true }).click();
 await page.getByRole('button', { name: 'Open story cards', exact: true }).click();
 await page.getByRole('button', { name: 'Character: Consult keeper', exact: true }).click();
 await page.getByPlaceholder('Character name').press('Escape');
 await page.getByRole('button', { name: 'open canon trail', exact: true }).click();
 await expect(page.locator('.character-consultation')).toBeHidden(); await expect(page.locator('.pane-canon')).toBeVisible();
 await expect(page.getByRole('button', { name: 'Focus writing', exact: true })).toBeVisible();
});


test('user scroll and selection survive return after desktop reflow', async ({ page, request, projectId }) => {
 await seed(request, projectId); await page.setViewportSize({ width: 1440, height: 1000 });
 const draft = page.locator('.pane-editor textarea.draft');
 await draft.fill(Array.from({ length: 180 }, (_, i) => `Paragraph ${i}. A long manuscript keeps its reading position.`).join('\n\n'));
 await page.getByRole('button', { name: /^Characters(?: |$)/ }).click();
 await draft.evaluate((el: HTMLTextAreaElement) => { el.focus(); el.setSelectionRange(15, 30, 'backward'); el.scrollTop = 0; });
 await draft.hover(); await page.mouse.wheel(0, 640);
 await expect.poll(() => draft.evaluate(el => el.scrollTop)).toBeGreaterThan(600);
 const fraction = await draft.evaluate(el => el.scrollTop / (el.scrollHeight - el.clientHeight));
 await page.setViewportSize({ width: 1280, height: 900 });
 await page.getByRole('button', { name: 'Return to writing', exact: true }).click();
 await expect(draft).toBeFocused();
 expect(await draft.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd, el.selectionDirection])).toEqual([15, 30, 'backward']);
 expect(await draft.evaluate(el => el.scrollTop / (el.scrollHeight - el.clientHeight))).toBeCloseTo(fraction, 2);
});
