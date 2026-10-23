import { useEffect, useRef, useState } from 'react';
import { getProjectSession, useStore } from '../store';
import { useEditHistory } from '../editHistory';
import { keepVariant } from '../premise';
import { placeReply } from '../replyPlacement';
import { RecordReplyPlacement } from './RecordReplyPlacement';
import { isRecordKind, RECORD_LABELS } from '../../../shared/record-proposals';

type Preview = { destination: string; title: string; base: string; after: string; excerpt: string; mode: 'append' | 'selection' };

export function ReplyPlacement({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return <details className="reply-placement" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Send to project</summary>
    {open && <PlacementForm text={text} />}
  </details>;
}

function PlacementForm({ text }: { text: string }) {
  const project = useStore(state => state.project);
  const docs = useStore(state => state.docs);
  const [session] = useState(getProjectSession);
  const [selection] = useState(() => useStore.getState().selection);
  const [destination, setDestination] = useState('');
  const [excerpt, setExcerpt] = useState(text);
  const [mode, setMode] = useState<'append' | 'selection'>('append');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);
  const [recordBusy, setRecordBusy] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<Preview | null>(null);
  const applying = useRef(false);
  const current = () => useStore.getState().project === project && getProjectSession() === session;
  const premise = destination === 'premise';
  const recordKind = destination.startsWith('record:') ? destination.slice(7) : '';
  const documentId = destination.startsWith('document:') ? destination.slice(9) : '';
  const document = docs[documentId];
  const canReplace = selection?.documentId === documentId && Boolean(selection.text);

  useEffect(() => {
    setPreview(null); setError('');
    if (!documentId) return;
    let cancelled = false;
    void useStore.getState().loadDoc(documentId).catch(error => { if (!cancelled && current()) setError(String(error.message)); });
    return () => { cancelled = true; };
  }, [destination]);

  const prepare = () => {
    setError(''); setPreview(null);
    if (!current()) return;
    try {
      if (premise) {
        if (!excerpt.trim() || excerpt.trim().length > 600) throw new Error('Premise variants hold up to 600 characters. Edit the excerpt before previewing.');
        setPreview({ destination, title: 'Premise variants', base: '', after: excerpt.trim(), excerpt: excerpt.trim(), mode: 'append' });
      } else {
        const doc = useStore.getState().docs[documentId];
        if (!doc || doc.recovery || doc.applyingPatch) throw new Error('Resolve document recovery or wait for its current edit before previewing.');
        const chosenMode = canReplace ? mode : 'append';
        setPreview({ destination, title: doc.title, base: doc.content, after: placeReply(doc.content, excerpt, chosenMode, selection), excerpt: excerpt.trim(), mode: chosenMode });
      }
    } catch (error: any) { setError(error.message); }
  };

  const apply = async () => {
    if (!preview || applying.current || !current()) return;
    applying.current = true; setPending(true); setError('');
    try {
      if (useEditHistory.getState().restoring) throw new Error('Wait for saved changes to finish restoring.');
      if (preview.destination === 'premise') {
        if (!useStore.getState().premise) await useStore.getState().loadPremise();
        if (!current()) return;
        const saved = await useStore.getState().updatePremise(value => value.variants.length >= 50 ? value : keepVariant(value, preview.excerpt, 'muse'));
        if (!current()) return;
        if (!saved) throw new Error('Premise variant could not be saved. Your excerpt is still here; try again.');
        if (!saved.variants.some(variant => variant.text === preview.excerpt)) throw new Error('Fifty premise variants saved. Remove one before adding another.');
      } else {
        const id = preview.destination.slice(9);
        const doc = useStore.getState().docs[id];
        if (!doc || doc.content !== preview.base || doc.recovery || doc.applyingPatch) {
          setPreview(null);
          throw new Error('Destination changed after preview. Preview again before applying.');
        }
        useStore.getState().editDoc(id, preview.after);
        if (useStore.getState().docs[id]?.content !== preview.after) throw new Error('Document could not be updated. Preview again before applying.');
      }
      if (current()) { setApplied(preview); useStore.getState().setNotice(`Response added to ${preview.title}.`); }
    } catch (error: any) { if (current()) setError(error.message); }
    finally { applying.current = false; if (current()) setPending(false); }
  };

  const openDestination = () => {
    if (!applied || !current()) return;
    const state = useStore.getState();
    if (applied.destination === 'premise') {
      state.openPane('premise', { title: 'Premise', region: 'main', focus: true });
      return;
    }
    const id = applied.destination.slice(9);
    const existing = state.panes.find(pane => pane.binding?.type === 'document' && pane.binding.id === id);
    const kind = state.project?.documents.find(doc => doc.id === id)?.kind;
    state.openPane(existing?.type ?? (kind === 'notes' ? 'notes' : 'editor'), { bindingId: id, region: existing?.region ?? 'main' });
  };

  if (applied) return <div className="reply-placement-done" role="status"><p>Added to {applied.title}.</p>
    <button type="button" onClick={openDestination}>Open destination</button>
    {applied.destination === 'premise' && <p>Promote the variant in Premise when ready.</p>}
  </div>;

  return <div className="reply-placement-form">
    <p>Choose an excerpt and destination, then review the change.</p>
    <label>Destination<select aria-label="Destination" value={destination} disabled={pending || recordBusy} onChange={event => { setDestination(event.target.value); setMode('append'); setPreview(null); }}>
      <option value="">Choose destination</option>
      <optgroup label="Documents">{project?.documents.map(doc => <option key={doc.id} value={`document:${doc.id}`}>{doc.title} — {doc.kind}</option>)}</optgroup>
      <option value="premise">Premise — save as variant</option>
      <optgroup label="Record fields">{Object.entries(RECORD_LABELS).map(([kind, label]) => <option key={kind} value={`record:${kind}`}>{label} — choose record and field</option>)}</optgroup>
    </select></label>
    {isRecordKind(recordKind) ? <RecordReplyPlacement key={recordKind} kind={recordKind} text={text} onBusy={setRecordBusy} /> : <>
    {documentId && <label>Placement<select aria-label="Placement" value={mode} disabled={pending} onChange={event => { setMode(event.target.value as 'append' | 'selection'); setPreview(null); }}>
      <option value="append">Append to document</option>
      {canReplace && <option value="selection">Replace selected passage</option>}
    </select></label>}
    <label>Excerpt to use<textarea aria-label="Excerpt to use" rows={6} value={excerpt} disabled={pending} onChange={event => { setExcerpt(event.target.value); setPreview(null); }} /></label>
    {premise && <p>{excerpt.trim().length} / 600 characters · Saved as a variant for later promotion.</p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={!destination || !excerpt.trim() || (!premise && !document) || pending} onClick={prepare}>Preview change</button>
    {preview && <section className="reply-placement-preview" aria-label="Proposed project change">
      <h4>{preview.title}</h4><p>{premise ? 'Add a premise variant' : preview.mode === 'selection' ? 'Replace selected passage' : 'Append to document'}</p>
      {!premise && preview.mode === 'selection' && <><strong>Before</strong><pre>{selection?.text}</pre></>}
      {!premise && preview.mode === 'append' && preview.base && <><strong>After existing ending</strong><pre>{preview.base.slice(-240)}</pre></>}
      <strong>{preview.mode === 'selection' ? 'After' : 'Text to add'}</strong><pre>{preview.excerpt}</pre>
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void apply()}>{pending ? 'Applying…' : 'Apply to project'}</button>
    </section>}
    </>}
  </div>;
}
