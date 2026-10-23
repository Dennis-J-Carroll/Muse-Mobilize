import { useEffect, useRef, useState } from 'react';
import { RECORD_FIELDS, RECORD_LABELS, PROPOSAL_TEXT_MAX, type FieldValue, type RecordKind, type RecordProposal } from '../../../shared/record-proposals';
import { api } from '../api';
import { draftJournal } from '../draftRecovery';
import { getProjectSession, useStore } from '../store';
import { useEditHistory } from '../editHistory';
import { lockRecordProposal } from '../recordProposalGuard';
import { openCharacterEditor } from '../panes/CharactersPane';
import { openSceneEditor } from '../panes/ScenesPane';
import { openPlotEditor } from '../panes/PlotPane';
import { openWorldEditor } from '../panes/WorldPane';

const displayValue = (value: FieldValue) => Array.isArray(value) ? value.map(item => `• ${item}`).join('\n') : value;

export function RecordReplyPlacement({ kind, text, onBusy }: { kind: RecordKind; text: string; onBusy: (value: boolean) => void }) {
  const [project] = useState(() => useStore.getState().project);
  const [session] = useState(getProjectSession);
  const [records, setRecords] = useState<{ id: string; title: string }[]>([]);
  const [recordId, setRecordId] = useState('');
  const [field, setField] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [excerpt, setExcerpt] = useState(text);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<RecordProposal | null>(null);
  const [applied, setApplied] = useState<RecordProposal | null>(null);
  const active = useRef(true);
  const busy = useRef(false);
  const current = () => active.current && useStore.getState().project === project && getProjectSession() === session;
  const definition = RECORD_FIELDS[kind].find(item => item.id === field);
  const invalidate = () => { setPreview(null); setError(''); };

  const load = async () => {
    if (!project) return;
    setLoading(true); setError('');
    try {
      let choices: { id: string; title: string }[];
      if (kind === 'characters' || kind === 'world') {
        const { canon } = await api.canon(project.id);
        choices = canon.entities.filter(entity => kind === 'characters' ? entity.type === 'character' : entity.type !== 'character').map(entity => ({ id: entity.id, title: entity.name }));
      } else if (kind === 'plot') choices = (await api.plot(project.id)).plot.nodes.map(node => ({ id: node.id, title: node.title }));
      else choices = (await api.scenes(project.id)).board.scenes.map(scene => ({ id: scene.id, title: scene.title }));
      if (current()) setRecords(choices);
    } catch (error: any) { if (current()) setError(`Could not load records: ${error.message}`); }
    finally { if (current()) setLoading(false); }
  };
  useEffect(() => { active.current = true; void load(); return () => { active.current = false; }; }, []);

  const assertReady = () => {
    if (!project || !current()) throw new Error('Project changed. Reopen Send to project.');
    if (useEditHistory.getState().restoring || useEditHistory.getState().pending) throw new Error('Wait for current project changes to finish, then try again.');
    const scope = { projectId: project.id, tool: kind, entityId: recordId };
    const savedDraft = draftJournal.read(scope);
    const newScope = { ...scope, entityId: 'new' };
    const newDraft = draftJournal.read(newScope);
    const panels = useStore.getState().floatingPanels;
    if (panels.some(panel => panel.id === `${kind}:${recordId}` || panel.id === `${kind}:new`) || savedDraft || newDraft?.savedEntityId === recordId
      || draftJournal.hasScopeIssue(scope) || draftJournal.hasScopeIssue(newScope)) {
      throw new Error('Save or cancel this record’s open or recovered editor before applying a Muse proposal. Parked editors still hold drafts.');
    }
  };

  const prepare = async () => {
    if (busy.current) return;
    setPreview(null); setError('');
    try {
      assertReady(); busy.current = true; setPending(true); onBusy(true);
      const result = await api.previewRecordProposal(project!.id, { kind, recordId, field, mode, excerpt });
      if (current()) setPreview(result.proposal);
    } catch (error: any) { if (current()) setError(error.message); }
    finally { busy.current = false; if (current()) { setPending(false); onBusy(false); } }
  };

  const refresh = async () => {
    if (kind === 'characters' || kind === 'world') {
      const { canon } = await api.canon(project!.id); if (current()) useStore.setState({ canon });
    } else if (kind === 'plot') {
      const { plot } = await api.plot(project!.id); if (current()) useStore.setState({ plot });
    } else { const { board } = await api.scenes(project!.id); if (current()) useStore.setState({ sceneBoard: board }); }
  };
  const apply = async () => {
    if (!preview || busy.current) return;
    let release: (() => void) | undefined;
    setError('');
    try {
      assertReady(); release = lockRecordProposal(project!.id, kind, recordId);
      busy.current = true; setPending(true); onBusy(true);
      const result = await api.applyRecordProposal(project!.id, preview);
      if (!current()) return;
      setApplied(result.proposal); setPreview(null);
      try { await refresh(); } catch { if (current()) setError('Field saved. Could not refresh its view; Open record retries loading.'); }
      if (current()) useStore.getState().setNotice(`${result.proposal.fieldLabel} updated in ${result.proposal.title}.`);
    } catch (error: any) { if (current()) { setPreview(null); setError(`${error.message} Preview again before retrying.`); } }
    finally { release?.(); busy.current = false; if (current()) { setPending(false); onBusy(false); } }
  };

  const openRecord = async () => {
    if (!applied || !current()) return;
    setError('');
    try {
    await refresh();
    if (!current()) return;
    const state = useStore.getState();
    if (kind === 'characters' || kind === 'world') {
      const entity = state.canon?.entities.find(item => item.id === applied.recordId);
      if (entity) { if (kind === 'characters') openCharacterEditor(entity); else openWorldEditor(entity.world?.canvas ?? { x: 0, y: 0 }, entity); }
    } else if (kind === 'plot') {
      const node = state.plot?.nodes.find(item => item.id === applied.recordId);
      if (node) openPlotEditor(node.position, node);
    } else { const scene = state.sceneBoard?.scenes.find(item => item.id === applied.recordId); if (scene) openSceneEditor(scene); }
    } catch (error: any) { if (current()) setError(`Could not open record: ${error.message}`); }
  };

  if (applied) return <div className="reply-placement-done" role="status"><p>Updated {applied.title} · {applied.fieldLabel}.</p>
    <p>Undo saved change restores the previous field.</p>{error && <p role="alert">{error}</p>}<button type="button" disabled={pending} onClick={() => void openRecord()}>Open record</button></div>;
  return <div className="reply-placement-form">
    {loading ? <p role="status">Loading {RECORD_LABELS[kind].toLowerCase()}…</p> : <>
      <label>Record<select aria-label="Record" value={recordId} disabled={pending} onChange={event => { setRecordId(event.target.value); invalidate(); }}>
        <option value="">Choose record</option>{records.map(record => <option key={record.id} value={record.id}>{record.title}</option>)}
      </select></label>
      {!records.length && <p>No saved records here yet. Create one in {RECORD_LABELS[kind]} first.</p>}
      <button type="button" disabled={pending} onClick={() => void load()}>Refresh records</button>
      <label>Field<select aria-label="Field" value={field} disabled={pending} onChange={event => { setField(event.target.value); invalidate(); }}>
        <option value="">Choose field</option>{RECORD_FIELDS[kind].map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      <label>Placement<select aria-label="Placement" value={mode} disabled={pending} onChange={event => { setMode(event.target.value as typeof mode); invalidate(); }}>
        <option value="append">{definition?.list ? 'Add list items' : 'Append to field'}</option><option value="replace">Replace field</option>
      </select></label>
      <label>Excerpt to use<textarea aria-label="Excerpt to use" rows={6} value={excerpt} disabled={pending} onChange={event => { setExcerpt(event.target.value); invalidate(); }} /></label>
      {definition?.list && <p>One item per line. Commas stay within items; duplicate items are kept once.</p>}
      <p>{excerpt.trim().length} / {PROPOSAL_TEXT_MAX} characters. Only the chosen field changes.</p>
      <button type="button" disabled={pending || !recordId || !field || !excerpt.trim() || excerpt.trim().length > PROPOSAL_TEXT_MAX} onClick={() => void prepare()}>{pending ? 'Working…' : 'Preview change'}</button>
    </>}
    {error && <p role="alert">{error}</p>}
    {preview && <section className="reply-placement-preview" aria-label="Proposed record change">
      <h4>{preview.title} · {preview.fieldLabel}</h4><p>{preview.mode === 'append' ? 'Append to field' : 'Replace field'}</p>
      <strong>Before</strong><pre>{displayValue(preview.before) || '(Empty)'}</pre>
      <strong>After</strong><pre>{displayValue(preview.after)}</pre>
      <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void apply()}>Apply to project</button>
    </section>}
  </div>;
}
