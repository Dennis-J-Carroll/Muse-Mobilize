import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { archiveRequest, uploadArchive, waitArchive, type ArchiveJob } from '../archiveJobs';
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
  const [candidate, setCandidate] = useState<{ text?: string; job?: ArchiveJob; source: string; files: number; capturedAt: string; savedBytes?: number } | null>(null);
  const [progress, setProgress] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const activeJob = useRef<string | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const root = useRef<HTMLElement>(null);
  const alive = useRef(true);
  const selection = useRef(0);
  const session = useRef(getProjectSession());
  const current = () => alive.current && getProjectSession() === session.current;
  useEffect(() => { alive.current = true; root.current?.focus(); return () => {
    alive.current = false; uploadAbort.current?.abort();
    if (activeJob.current) void fetch(`/api/archive-jobs/${activeJob.current}`, { method: 'DELETE' }).catch(() => {});
  }; }, []);
  const report = (job: ArchiveJob) => { if (current()) setProgress(`${job.state}${job.total ? ` · ${Math.round(100 * job.bytes / job.total)}%` : ''}`); };
  const cancel = async () => {
    ++selection.current; uploadAbort.current?.abort();
    const id = activeJob.current;
    try {
      if (id) await archiveRequest(`/api/archive-jobs/${id}`, undefined, 'DELETE');
      if (current()) { setPending(false); setCandidate(null); setProgress(''); setMessage('Archive operation stopped. Check project list if restore had already completed.'); }
    } catch (err) { if (current()) setError((err as Error).message); }
    finally { activeJob.current = null; }
  };

  const download = async () => {
    if (!project || pending) return;
    const request = ++selection.current;
    const latest = () => current() && request === selection.current;
    setPending(true); setError(''); setMessage(''); setProgress('Saving writing…');
    try {
      const s = useStore.getState();
      await Promise.all(Object.keys(s.docs).map((id) => s.flushDoc(id)));
      if (!latest()) return;
      if (Object.values(useStore.getState().docs).some((doc) => doc.dirty || doc.recovery || doc.applyingPatch)) {
        throw new Error('Some writing is not saved. Resolve recovered drafts or save errors, then retry the backup.');
      }
      if (activeJob.current) await archiveRequest(`/api/archive-jobs/${activeJob.current}`, undefined, 'DELETE');
      setCandidate(null);
      const created = await archiveRequest(`/api/projects/${project.id}/backup-jobs`);
      activeJob.current = created.id;
      if (!latest()) { await archiveRequest(`/api/archive-jobs/${created.id}`, undefined, 'DELETE'); return; }
      const ready = await waitArchive(created, latest, report);
      if (!latest()) return;
      activeJob.current = null;
      setDownloadUrl(ready.downloadUrl!);
      const link = document.createElement('a');
      link.href = ready.downloadUrl!; link.download = `${project.id}.muse-backup.zip`;
      document.body.append(link); link.click(); link.remove();
      setMessage('Archive verified. Download requested. Check your downloads and keep a copy outside this device.');
    } catch (err) { if (latest()) setError((err as Error).message); }
    finally { if (latest()) { setPending(false); setProgress(''); } }
  };
  const choose = async (file?: File) => {
    const request = ++selection.current;
    const latest = () => current() && request === selection.current;
    setCandidate(null); setError(''); setMessage('');
    if (!file) return;
    setPending(true);
    try {
      if (activeJob.current) await archiveRequest(`/api/archive-jobs/${activeJob.current}`, undefined, 'DELETE');
      activeJob.current = null;
      if (file.name.toLowerCase().endsWith('.zip')) {
        if (file.size > 2 * 1024 ** 3 + 64 * 1024 ** 2) throw new Error('ZIP exceeds 2 GiB + 64 MiB container limit.');
        const job = await archiveRequest('/api/backup-imports', { filename: file.name, size: file.size });
        activeJob.current = job.id;
        uploadAbort.current = new AbortController();
        if (!latest()) { await archiveRequest(`/api/archive-jobs/${job.id}`, undefined, 'DELETE'); return; }
        const uploaded = await uploadArchive(job.id, file, uploadAbort.current.signal, percent => { if (latest()) setProgress(`Uploading · ${percent}%`); });
        const ready = await waitArchive(uploaded, latest, report);
        if (latest()) setCandidate({ job: ready, source: ready.preview!.sourceProjectId, files: ready.preview!.files, capturedAt: ready.preview!.capturedAt, savedBytes: ready.preview!.savedBytes });
      } else {
        if (file.size > MAX_BACKUP_BYTES) throw new Error('Legacy JSON backup exceeds the 80 MiB limit.');
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (parsed?.format !== 'muse-project-backup' || parsed.version !== 1 || typeof parsed.sourceProjectId !== 'string'
          || !Array.isArray(parsed.files) || typeof parsed.capturedAt !== 'string') throw new Error('Expected a version 1 Muse JSON backup or .muse-backup.zip.');
        if (latest()) setCandidate({ text, source: parsed.sourceProjectId, files: parsed.files.length, capturedAt: parsed.capturedAt });
      }
    } catch (err) { if (latest()) setError(`Could not read this backup. ${(err as Error).message}`); }
    finally { if (latest()) { setPending(false); setProgress(''); } }
  };
  const restore = async () => {
    if (!candidate || pending) return;
    const request = ++selection.current;
    const latest = () => current() && request === selection.current;
    setPending(true); setError('');
    try {
      let restored;
      if (candidate.job) {
        const started = await archiveRequest(`/api/archive-jobs/${candidate.job.id}/restore`, { snapshotHash: candidate.job.preview!.snapshotHash });
        const finished = await waitArchive(started, latest, report);
        restored = finished.project!;
        activeJob.current = null;
      } else restored = (await api.restoreBackup(candidate.text!)).project;
      if (!latest()) return;
      const { projects } = await api.listProjects();
      if (!latest()) return;
      useStore.setState({ projects });
      await useStore.getState().openProject(restored.id);
      onClose();
      useStore.getState().setNotice('Restore completed as a separate project. Original project preserved.');
    } catch (err) { if (latest()) setError((err as Error).message); }
    finally { if (latest()) { setPending(false); setProgress(''); } }
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
        {downloadUrl && <p><a href={downloadUrl} download>Download verified archive again</a> · available for 30 minutes <button type="button" disabled={pending} onClick={() => { void archiveRequest(downloadUrl.replace(/\/download$/, ''), undefined, 'DELETE').then(() => setDownloadUrl('')).catch(error => setError(error.message)); }}>Discard prepared download</button></p>}
        <section><h3>Download {project?.name ?? 'a saved project'}</h3>
          <p>Manuscripts, lore, images, tags, goals, saved layouts, and revision history.</p>
          <p className="connections-muted">Save unfinished tool forms first. Browser recovery drafts and Saved Desks are not included. Neither are provider keys or account settings. Avoid editing during capture.</p>
          <button type="button" disabled={pending || !project} onClick={() => void download()}>Download saved project</button>
        </section>
        <section><h3>Restore a copy</h3><p>Original project will not be overwritten.</p>
          <label>Choose project backup<input type="file" accept="application/zip,.zip,application/json,.json" disabled={pending} onChange={(event) => void choose(event.target.files?.[0])} /></label>
          {candidate && <div className="backup-preview"><p>Source: {candidate.source}</p><p>{candidate.files} saved files · {candidate.capturedAt}</p><small>{candidate.job ? `Archive verified · ${(candidate.savedBytes! / 1024 ** 2).toFixed(2)} MiB saved files` : 'Legacy contents, paths, and checksums will be validated before creating a new project.'}</small></div>}
          <button type="button" disabled={pending || !candidate} onClick={() => void restore()}>Restore as new project</button>
        </section>
        {pending && <div><p role="status">{progress || 'Preparing saved files…'}</p><button type="button" disabled={!activeJob.current} onClick={() => void cancel()}>Cancel archive operation</button></div>}
      </div>
      <footer>ZIP: up to 2 GiB saved files · 10,000 files. Legacy JSON: 50 MiB saved / 80 MiB encoded. Restore never overwrites original.</footer>
    </section>
  </div>, document.body);
}
