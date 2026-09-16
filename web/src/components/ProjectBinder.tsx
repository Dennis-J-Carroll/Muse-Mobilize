import { useValueUndo } from '../useValueUndo';
import { useEffect, useRef, useState } from 'react';
import { api, type BinderPreview } from '../api';
import { useStore } from '../store';
import { RESOURCE_LABELS, parseRecipe, type BinderRecipe, type ResourceInfo, type ResourceKind } from '../../../shared/project-tools';
import { ResourcePicker } from './ResourcePicker';

export function downloadFile(body: string | Blob, name: string, type = 'application/json') {
  const url = URL.createObjectURL(typeof body === 'string' ? new Blob([body], { type }) : body);
  const link = document.createElement('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function preset(name: string, resources: ResourceInfo[], reader = false): BinderRecipe {
  return { format: 'muse-project-binder', version: 1, title: `${name} — ${reader ? 'Manuscript' : 'Project Binder'}`, introduction: '', pageSize: 'letter', includeImages: true,
    sections: reader ? [{ id: 'manuscript', title: 'Manuscript', kind: 'document', selection: { mode: 'selected', ids: resources.filter((r) => r.kind === 'document' && r.detail === 'manuscript').map((r) => r.id) } }]
      : (Object.keys(RESOURCE_LABELS) as ResourceKind[]).filter((kind) => kind !== 'agent' && kind !== 'activity').map((kind) => ({ id: kind, title: RESOURCE_LABELS[kind], kind, selection: { mode: 'all' } })),
  };
}
export function ProjectBinder({ projectId, projectName, resources, onDirty, onPending }: {
  projectId: string; projectName: string; resources: ResourceInfo[]; onDirty: (value: boolean) => void; onPending: (value: boolean) => void;
}) {
  const [recipe, setRecipe] = useState(() => preset(projectName, resources));
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<BinderPreview | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewReady, setPreviewReady] = useState(false);
  const [addKind, setAddKind] = useState<ResourceKind>('document');
  const [privateArchive, setPrivateArchive] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const alive = useRef(true);
  useEffect(() => { let current = true; alive.current = true; api.binder(projectId).then((r) => { if (current && r.recipe) setRecipe(r.recipe); }).catch((e) => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); }); return () => { current = false; alive.current = false; }; }, [projectId]);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => onPending(busy || loading), [busy, loading, onPending]);
  useEffect(() => {
    setPreviewReady(false);
    if (!preview) { setPreviewUrl(''); return; }
    // A self-contained URL keeps contents links inside the preview. srcdoc
    // would resolve fragment URLs against the application page instead.
    const url = URL.createObjectURL(new Blob([preview.html], { type: 'text/html' }));
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);
  const edits = useValueUndo(recipe, (value) => { setRecipe(value); setDirty(true); setPreview(null); setMessage(''); });
  const change = edits.change;
  const run = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setError(''); setMessage(''); try { await fn(); } catch (e: any) { if (alive.current) setError(e.message); } finally { if (alive.current) setBusy(false); } };
  const move = (index: number, delta: number) => { const sections = [...recipe.sections]; [sections[index], sections[index + delta]] = [sections[index + delta], sections[index]]; change({ ...recipe, sections }); };
  const flush = async () => {
    const store = useStore.getState();
    await Promise.all(Object.keys(store.docs).map((id) => store.flushDoc(id)));
    if (useStore.getState().project?.id !== projectId) throw new Error('Project changed. Reopen the binder.');
    if (Object.values(useStore.getState().docs).some((doc) => doc.dirty || doc.recovery || doc.applyingPatch)) throw new Error('Save writing and resolve recovered drafts before previewing.');
  };
  const verify = async () => { if (!preview) throw new Error('Preview the binder first.'); await flush(); await api.verifyBinder(projectId, preview.receipt.snapshotHash); };
  return <div className="binder-columns">
    <div className="binder-editor" onKeyDown={busy || loading ? undefined : edits.onKeyDown}>
      <div className="undo-controls" role="group" aria-label="Recipe form history"><button aria-label="Undo recipe edit" disabled={busy || !edits.canUndo} onPointerDown={(event) => event.preventDefault()} onClick={edits.undo}>↶ Undo</button><button aria-label="Redo recipe edit" disabled={busy || !edits.canRedo} onPointerDown={(event) => event.preventDefault()} onClick={edits.redo}>↷ Redo</button></div>
      {error && <p role="alert" className="tool-warning">{error}</p>}{message && <p role="status">{message}</p>}
      <p>Arrange saved story material into a readable project binder. Save unfinished card forms before previewing. Browser drafts and Saved Desks are outside this export.</p>
      <fieldset disabled={busy || loading}>
        <div className="tool-actions"><button onClick={() => change(preset(projectName, resources))}>Whole-project content</button><button onClick={() => change(preset(projectName, resources, true))}>Reader manuscript</button></div>
        <small>Whole-project content includes story records and Sources. Add agent definitions or activity explicitly below. Private backup includes more than the readable binder.</small>
        <label>Binder title<input value={recipe.title} maxLength={200} onChange={(e) => change({ ...recipe, title: e.target.value })} /></label>
        <label>Introduction<textarea rows={3} value={recipe.introduction} maxLength={20000} onChange={(e) => change({ ...recipe, introduction: e.target.value })} /></label>
        <div className="tool-field-grid"><label>Page size<select value={recipe.pageSize} onChange={(e) => change({ ...recipe, pageSize: e.target.value as BinderRecipe['pageSize'] })}><option value="letter">US Letter</option><option value="a4">A4</option></select></label><label className="check-row"><input type="checkbox" checked={recipe.includeImages} onChange={(e) => change({ ...recipe, includeImages: e.target.checked })} />Include local images</label></div>
        <h3>Sections in reading order</h3>
        {recipe.sections.map((section, index) => <details className="binder-section" key={section.id}><summary><span>{index + 1}. {section.title}</span></summary>
          <label>Section title<input aria-label={`Section ${index + 1} title`} value={section.title} onChange={(e) => change({ ...recipe, sections: recipe.sections.map((s, i) => i === index ? { ...s, title: e.target.value } : s) })} /></label>
          <div className="tool-actions"><button aria-label={`Move section ${index + 1} up`} disabled={!index} onClick={() => move(index, -1)}>↑ Move up</button><button aria-label={`Move section ${index + 1} down`} disabled={index === recipe.sections.length - 1} onClick={() => move(index, 1)}>↓ Move down</button><button onClick={() => change({ ...recipe, sections: recipe.sections.filter((_, i) => i !== index) })}>Remove section</button></div>
          <ResourcePicker kind={section.kind} value={section.selection} records={resources} ordered onChange={(selection) => change({ ...recipe, sections: recipe.sections.map((s, i) => i === index ? { ...s, selection: selection ?? { mode: 'selected', ids: [] } } : s) })} />
        </details>)}
        <div className="tool-actions"><label>Section content<select value={addKind} onChange={(e) => setAddKind(e.target.value as ResourceKind)}>{Object.entries(RESOURCE_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select></label><button disabled={recipe.sections.length >= 60} onClick={() => change({ ...recipe, sections: [...recipe.sections, { id: crypto.randomUUID(), title: RESOURCE_LABELS[addKind], kind: addKind, selection: { mode: 'selected', ids: [] } }] })}>Add section</button></div>
        <div className="tool-actions"><button onClick={() => void run(async () => { await api.saveBinder(projectId, recipe); setDirty(false); setPreview(null); setMessage('Binder recipe saved in this project.'); })}>Save binder recipe</button><button className="btn-primary" onClick={() => void run(async () => { await flush(); const result = await api.previewBinder(projectId, recipe); if (alive.current) setPreview(result.preview); })}>Preview binder</button><span>{dirty ? 'Unsaved recipe' : 'Recipe ready'}</span></div>
        <details><summary>Edit recipe as a file</summary><p>Download JSON, rearrange sections or selected record IDs, then import it here. Preview before exporting.</p><button onClick={() => downloadFile(JSON.stringify(parseRecipe(recipe), null, 2), `${projectId}-binder-recipe.json`)}>Download recipe JSON</button><label>Import binder recipe<input type="file" accept=".json,application/json" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void run(async () => { if (file.size > 1024 * 1024) throw new Error('Recipe exceeds 1 MiB.'); change(parseRecipe(JSON.parse(await file.text()))); }); }} /></label></details>
      </fieldset>
    </div>
    <div className="binder-preview">
      <h3>Presentation preview</h3>
      {preview ? <>
        <p>{preview.included} records rendered · {preview.omitted} omitted · saved snapshot {new Date(preview.receipt.capturedAt).toLocaleString()}</p>
        {preview.warnings.length > 0 && <details open><summary>Export notes ({preview.warnings.length})</summary><ul>{preview.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></details>}
        <div className="tool-actions"><button disabled={busy} onClick={() => void run(async () => { await verify(); downloadFile(preview.html, `${projectId}-binder.html`, 'text/html'); })}>Download HTML</button><button disabled={busy || !previewReady} onClick={() => void run(async () => { await verify(); if (!frame.current?.contentWindow) throw new Error('Preview is not ready. Refresh it before printing.'); frame.current.contentWindow.print(); })}>Print / Save PDF</button></div>
        {previewUrl && <iframe key={previewUrl} ref={frame} title="Binder presentation" sandbox="allow-same-origin allow-modals" src={previewUrl} onLoad={() => setPreviewReady(true)} />}
        <details><summary>Portable project package</summary><p>ZIP includes readable binder, recipe, original Sources and assets inside the saved-project backup, and export receipt. Extract project-backup.json and restore it through Backups.</p><label className="check-row"><input type="checkbox" checked={privateArchive} onChange={(e) => setPrivateArchive(e.target.checked)} />Include private saved-project data, even material omitted from this binder</label><button disabled={busy || !privateArchive} onClick={() => void run(async () => {
          await verify();
          const response = await fetch(`/api/projects/${projectId}/binder/package`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipe, snapshotHash: preview.receipt.snapshotHash }) });
          if (!response.ok) throw new Error((await response.json()).error ?? 'Could not package project.');
          downloadFile(await response.blob(), `${projectId}-muse-project.zip`);
        })}>Download project ZIP</button></details>
      </> : <p className="preview-placeholder">Preview your section order, story cards, and source appendix here.</p>}
    </div>
  </div>;
}
