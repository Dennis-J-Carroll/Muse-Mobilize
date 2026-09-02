import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import type { CanonEntity, DialogueLine, DialogueVoiceStatus, Pane, Scene } from '../types';

const VOICE_STATUS: Array<{ value: DialogueVoiceStatus; label: string }> = [
  { value: 'unchecked', label: 'Unchecked' },
  { value: 'in_voice', label: 'In voice' },
  { value: 'review', label: 'Review' },
];

const emptyLine = (speakerId = ''): DialogueLine => ({
  id: '', speakerId, text: '', subtext: '', knowledgeState: '', voiceStatus: 'unchecked', voiceNote: '', order: 0,
});

function DialogueEditor({
  line, speakers, isNew, onCancel, onSave,
}: {
  line: DialogueLine;
  speakers: CanonEntity[];
  isNew?: boolean;
  onCancel?: () => void;
  onSave: (line: DialogueLine) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(line);
  const [editing, setEditing] = useState(Boolean(isNew));
  const speaker = speakers.find((item) => item.id === draft.speakerId);
  const patch = <K extends keyof DialogueLine>(key: K, value: DialogueLine[K]) => setDraft((current) => ({ ...current, [key]: value }));

  if (!editing) return <article className={`dialogue-row voice-${line.voiceStatus}`} onClick={() => setEditing(true)}>
    <div className="dialogue-script-line"><span>{speaker?.name ?? 'Unassigned'}</span><blockquote>{line.text}</blockquote><p>{line.subtext || 'No subtext note.'}</p></div>
    <div className="dialogue-knowledge"><span>Knows now</span><p>{line.knowledgeState || 'Knowledge state not recorded.'}</p></div>
    <div className="dialogue-voice"><span>{VOICE_STATUS.find((item) => item.value === line.voiceStatus)?.label}</span><p>{line.voiceNote || 'No voice note.'}</p></div>
    <button className="dialogue-edit" aria-label="Edit dialogue line">Edit</button>
  </article>;

  return <form className="dialogue-row dialogue-row-edit" onSubmit={async (event) => { event.preventDefault(); if (!draft.text.trim()) return; if (await onSave(draft)) setEditing(false); }}>
    <div className="dialogue-script-line"><label>Speaker<select value={draft.speakerId} onChange={(event) => patch('speakerId', event.target.value)}><option value="">Unassigned</option>{speakers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Line<textarea autoFocus rows={3} value={draft.text} onChange={(event) => patch('text', event.target.value)} placeholder="What is said aloud?" /></label><label>Subtext<textarea rows={2} value={draft.subtext} onChange={(event) => patch('subtext', event.target.value)} placeholder="What do they mean or conceal?" /></label></div>
    <div className="dialogue-knowledge"><label>Knowledge at this line<textarea rows={5} value={draft.knowledgeState} onChange={(event) => patch('knowledgeState', event.target.value)} placeholder="What does this speaker know, believe, or misunderstand now?" /></label></div>
    <div className="dialogue-voice"><label>Voice check<select value={draft.voiceStatus} onChange={(event) => patch('voiceStatus', event.target.value as DialogueVoiceStatus)}>{VOICE_STATUS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Check note<textarea rows={3} value={draft.voiceNote} onChange={(event) => patch('voiceNote', event.target.value)} placeholder="Cadence, diction, evasion, repeated habits…" /></label><div><button type="button" className="linkish" onClick={() => { if (isNew) onCancel?.(); else { setDraft(line); setEditing(false); } }}>Cancel</button><button className="btn btn-primary" disabled={!draft.text.trim()}>Save line</button></div></div>
  </form>;
}

export function DialoguePane({ pane }: { pane: Pane }) {
  const board = useStore((s) => s.sceneBoard);
  const canon = useStore((s) => s.canon);
  const focusId = useStore((s) => s.sceneFocusId);
  const [sceneId, setSceneId] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => { void Promise.all([useStore.getState().loadScenes(), useStore.getState().loadCanon()]); }, []);
  const scenes = useMemo(() => board?.scenes ?? [], [board]);
  const characters = useMemo(() => (canon?.entities ?? []).filter((item) => item.type === 'character'), [canon]);
  useEffect(() => {
    if (focusId && scenes.some((scene) => scene.id === focusId)) {
      setSceneId(focusId);
      useStore.setState({ sceneFocusId: null });
    } else if (!sceneId && scenes[0]) setSceneId(scenes[0].id);
    else if (sceneId && !scenes.some((scene) => scene.id === sceneId)) setSceneId(scenes[0]?.id ?? '');
  }, [focusId, scenes, sceneId]);

  const scene = scenes.find((item) => item.id === sceneId);
  const attachedSpeakerIds = new Set(scene?.assets.filter((asset) => asset.kind === 'character').map((asset) => asset.refId) ?? []);
  const speakers = [...characters].sort((a, b) => Number(attachedSpeakerIds.has(b.id)) - Number(attachedSpeakerIds.has(a.id)) || a.name.localeCompare(b.name));
  const saveLine = async (current: Scene, line: DialogueLine, existingId?: string) => {
    const dialogue = existingId
      ? current.dialogue.map((item) => (item.id === existingId ? { ...line, id: existingId, order: item.order } : item))
      : [...current.dialogue, { ...line, id: '', order: current.dialogue.length }];
    const saved = await useStore.getState().updateScene(current.id, { dialogue });
    if (saved) setAdding(false);
    return Boolean(saved);
  };
  const moveLine = (current: Scene, index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= current.dialogue.length) return;
    const dialogue = [...current.dialogue];
    [dialogue[index], dialogue[target]] = [dialogue[target], dialogue[index]];
    void useStore.getState().updateScene(current.id, { dialogue: dialogue.map((line, order) => ({ ...line, order })) });
  };
  const openScenes = () => {
    if (scene) useStore.setState({ sceneFocusId: scene.id });
    useStore.getState().setPaneSize(pane.id, 'normal');
    useStore.getState().openPane('scenes', { title: 'Scene Board', region: 'main', focus: true });
  };

  if (!board || !canon) return <div className="pane-body pane-loading">Setting dialogue table…</div>;

  return <div className="dialogue-workspace">
    <header className="dialogue-toolbar"><div><span>Script · table read</span><h2>Dialogue</h2></div><label>Scene<select value={sceneId} onChange={(event) => { setSceneId(event.target.value); setAdding(false); }}>{scenes.map((item) => <option key={item.id} value={item.id}>{item.section} · {item.title}</option>)}</select></label><button className="btn" onClick={openScenes}>Scene board</button><button className="btn btn-primary" disabled={!scene} onClick={() => setAdding(true)}>+ Add line</button></header>
    {!scene && <div className="dialogue-empty"><span>“ ”</span><h3>No scene at table</h3><p>Create scene before blocking conversation.</p><button className="btn btn-primary" onClick={openScenes}>Open Scene Board</button></div>}
    {scene && <>
      <section className="dialogue-scene-context"><div><small>{scene.section} · {scene.status}</small><h1>{scene.title}</h1><p>{scene.purpose || scene.summary || 'Scene purpose not set.'}</p></div><dl><div><dt>Speakers</dt><dd>{scene.assets.filter((asset) => asset.kind === 'character').length}</dd></div><div><dt>Lines</dt><dd>{scene.dialogue.length}</dd></div><div><dt>Review</dt><dd>{scene.dialogue.filter((line) => line.voiceStatus === 'review').length}</dd></div></dl>{scene.documentId && <button className="linkish" onClick={() => { useStore.getState().setPaneSize(pane.id, 'normal'); useStore.getState().openPane('editor', { bindingId: scene.documentId, region: 'right' }); }}>Open draft</button>}</section>
      <div className="dialogue-table-head"><span>Script + subtext</span><span>Knowledge state</span><span>Voice check</span></div>
      <main className="dialogue-table">
        {!scene.dialogue.length && !adding && <div className="dialogue-first-line"><p>Silence so far. Add first spoken line; track what speaker means, knows, and sounds like.</p><button className="btn" onClick={() => setAdding(true)}>Add first line</button></div>}
        {scene.dialogue.map((line, index) => <div className="dialogue-line-wrap" key={line.id}><div className="dialogue-order"><button aria-label="Move line up" disabled={index === 0} onClick={() => moveLine(scene, index, -1)}>↑</button><span>{String(index + 1).padStart(2, '0')}</span><button aria-label="Move line down" disabled={index === scene.dialogue.length - 1} onClick={() => moveLine(scene, index, 1)}>↓</button><button aria-label="Delete line" onClick={() => void useStore.getState().updateScene(scene.id, { dialogue: scene.dialogue.filter((item) => item.id !== line.id) })}>×</button></div><DialogueEditor line={line} speakers={speakers} onSave={(draft) => saveLine(scene, draft, line.id)} /></div>)}
        {adding && <div className="dialogue-line-wrap is-new"><div className="dialogue-order"><span>{String(scene.dialogue.length + 1).padStart(2, '0')}</span></div><DialogueEditor line={{ ...emptyLine(speakers.find((item) => attachedSpeakerIds.has(item.id))?.id ?? speakers[0]?.id), order: scene.dialogue.length }} speakers={speakers} isNew onCancel={() => setAdding(false)} onSave={(draft) => saveLine(scene, draft)} /></div>}
      </main>
    </>}
  </div>;
}
