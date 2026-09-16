import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { getProjectSession, useStore } from '../store';
import { trapLayerTab } from '../focusLayers';

const MAX_BACKUP_BYTES = 80 * 1024 * 1024;

export function ProjectBackups() {
  const [open, setOpen] = useState(false);
  const projectId = useStore((s) => s.project?.id);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [projectId]);
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  return <>
    <button ref={trigger} type="button" className="project-backups-trigger" aria-label="Project backups" onClick={() => setOpen(true)}>Backups</button>
    {open && <BackupDialog onClose={close} />}
  </>;
}

function BackupDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [candidate, setCandidate] = useState<{ text: string; source: string; files: number; capturedAt: string } | null>(null);
  const root = useRef<HTMLElement>(null);
  const alive = useRef(true);
  const selection = useRef(0);
  const session = useRef(getProjectSession());
  const current = () => alive.current && getProjectSession() === session.current;
  useEffect(() => { alive.current = true; root.current?.focus(); return () => { alive.current = false; }; }, []);

  const download = async () => {
    if (!project || pending) return;
    setPending(true); setError(''); setMessage('');
    try {
      const s = useStore.getState();
      await Promise.all(Object.keys(s.docs).map((id) => s.flushDoc(id)));
      if (!current()) return;
      if (Object.values(useStore.getState().docs).some((doc) => doc.dirty || doc.recovery || doc.applyingPatch)) {
        throw new Error('Some writing is not saved. Resolve recovered drafts or save errors, then retry the backup.');
      }
      const response = await fetch(`/api/projects/${project.id}/backup`);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? 'Backup could not be captured.');
      }
      const blob = await response.blob();
      if (!current()) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${project.id}-muse-backup.json`;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Saved-project backup downloaded. Keep a copy outside this device.');
    } catch (err) { if (current()) setError((err as Error).message); }
    finally { if (current()) setPending(false); }
  };
  const choose = async (file?: File) => {
    const request = ++selection.current;
    setCandidate(null); setError(''); setMessage('');
    if (!file) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 80 MiB limit.');
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed?.format !== 'muse-project-backup' || parsed.version !== 1 || typeof parsed.sourceProjectId !== 'string'
        || !Array.isArray(parsed.files) || typeof parsed.capturedAt !== 'string') throw new Error('Expected a version 1 Muse project backup.');
      if (current() && request === selection.current) setCandidate({ text, source: parsed.sourceProjectId, files: parsed.files.length, capturedAt: parsed.capturedAt });
    } catch (err) { if (current() && request === selection.current) setError(`Could not read this backup. ${(err as Error).message}`); }
  };
  const restore = async () => {
    if (!candidate || pending) return;
    setPending(true); setError('');
    try {
      const result = await api.restoreBackup(candidate.text);
      if (!current()) return;
      const { projects } = await api.listProjects();
      if (!current()) return;
      useStore.setState({ projects });
      await useStore.getState().openProject(result.project.id);
      onClose();
      useStore.getState().setNotice('Backup restored as a separate project. Original project preserved.');
    } catch (err) { if (current()) setError((err as Error).message); }
    finally { if (current()) setPending(false); }
  };

  return createPortal(<div className="connections-backdrop">
    <section ref={root} tabIndex={-1} className="connections-panel backup-panel" role="dialog" aria-modal="true" aria-label="Project backups" onKeyDown={(event) => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); if (!pending) onClose(); }
      trapLayerTab(event);
    }}>
      <header><div><span className="connections-eyebrow">Writing trust</span><h2>Keep your world safe</h2><p>Portable copies of saved project files.</p></div>
        <button type="button" disabled={pending} aria-label="Close backups" onClick={onClose}>×</button></header>
      <div className="backup-content">
        {error && <p className="connections-error" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <section><h3>Download {project?.name ?? 'a saved project'}</h3>
          <p>Manuscripts, lore, images, tags, goals, saved layouts, and revision history.</p>
          <p className="connections-muted">Save unfinished tool forms first. Browser recovery drafts and Saved Desks are not included. Neither are provider keys or account settings. Avoid editing during capture.</p>
          <button type="button" disabled={pending || !project} onClick={() => void download()}>Download saved project</button>
        </section>
        <section><h3>Restore a copy</h3><p>Original project will not be overwritten.</p>
          <label>Choose project backup<input type="file" accept="application/json,.json" disabled={pending} onChange={(event) => void choose(event.target.files?.[0])} /></label>
          {candidate && <div className="backup-preview"><p>Source: {candidate.source}</p><p>{candidate.files} saved files · {candidate.capturedAt}</p><small>Contents, paths, and checksums will be validated before creating a new project.</small></div>}
          <button type="button" disabled={pending || !candidate} onClick={() => void restore()}>Restore as new project</button>
        </section>
        {pending && <p role="status">Preparing saved files…</p>}
      </div>
      <footer>Up to 50 MiB of saved files · 80 MiB JSON backup · no overwrite.</footer>
    </section>
  </div>, document.body);
}
