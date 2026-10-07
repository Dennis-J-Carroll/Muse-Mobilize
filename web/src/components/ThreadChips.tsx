import { useEffect, useMemo, useState } from 'react';
import type { ConnectionTarget, StoryTag } from '../../../shared/connections';
import { sameTarget } from '../../../shared/threads';
import type { Thread } from '../../../shared/threads';
import { api } from '../api';
import { useStore } from '../store';
import { loadStoryRecords, storyRecords } from '../storyRecords';
import { useThreads } from '../threads';

/** Tags and links of one note. Every change sends the full lists in one atomic, undoable write. */
export function ThreadChips({ thread }: { thread: Thread }) {
  const projectId = useStore((state) => state.project?.id);
  const busy = useThreads((state) => state.busy);
  const [tags, setTags] = useState<StoryTag[]>([]);
  const [mode, setMode] = useState<'tag' | 'link' | null>(null);
  const [query, setQuery] = useState('');
  const [newTag, setNewTag] = useState('');
  const [problem, setProblem] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!projectId) return;
    void loadStoryRecords().then(() => setReady(true));
    void api.connections(projectId).then((result) => setTags(result.connections.tags)).catch(() => setProblem('Tags could not load.'));
  }, [projectId, thread.id]);
  const records = ready ? storyRecords() : [];
  const tagIds = thread.tagIds ?? [];
  const links = thread.links ?? [];
  const tagName = (id: string) => tags.find((tag) => tag.id === id)?.label ?? 'Missing tag';
  const labelFor = (target: ConnectionTarget) => records.find((item) => sameTarget(item.target, target))?.label ?? 'Card removed';
  const save = (next: { tagIds?: string[]; links?: ConnectionTarget[] }) => void useThreads.getState().setConnections(thread.id, next);
  const matches = useMemo(() => records.filter((item) => !sameTarget(item.target, thread.target) && !links.some((link) => sameTarget(link, item.target))
    && `${item.group} ${item.words}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).slice(0, 6), [records, links, query, thread.target]);

  return <div className="thread-chips">
    {tagIds.map((id) => <button key={id} type="button" className="thread-chip" disabled={busy} aria-label={`Remove tag ${tagName(id)}`}
      onClick={() => save({ tagIds: tagIds.filter((item) => item !== id) })}>#{tagName(id)} ×</button>)}
    {links.map((link) => <button key={`${link.kind}:${link.id}`} type="button" className="thread-chip" disabled={busy} aria-label={`Remove link ${labelFor(link)}`}
      onClick={() => save({ links: links.filter((item) => !sameTarget(item, link)) })}>↗ {labelFor(link)} ×</button>)}
    <button type="button" className="thread-chip is-add" disabled={busy} onClick={() => setMode(mode === 'tag' ? null : 'tag')}>+ Tag</button>
    <button type="button" className="thread-chip is-add" disabled={busy} onClick={() => setMode(mode === 'link' ? null : 'link')}>+ Link</button>
    {problem && <span className="thread-failed" role="alert">{problem}</span>}
    {mode === 'tag' && <div className="thread-picker">
      <select aria-label="Existing tag" value="" onChange={(event) => { if (event.target.value) { save({ tagIds: [...tagIds, event.target.value] }); setMode(null); } }}>
        <option value="">Choose a tag…</option>{tags.filter((tag) => !tagIds.includes(tag.id)).map((tag) => <option key={tag.id} value={tag.id}>{tag.label}</option>)}
      </select>
      <form onSubmit={(event) => {
        event.preventDefault();
        const label = newTag.trim();
        if (!label || !projectId) return;
        void api.createTag(projectId, label).then(({ tag }) => {
          setTags((all) => (all.some((item) => item.id === tag.id) ? all : [...all, tag]));
          save({ tagIds: [...new Set([...tagIds, tag.id])] });
          setNewTag(''); setMode(null);
        }).catch((err) => setProblem(String(err?.message ?? err)));
      }}>
        <input aria-label="New tag" maxLength={80} value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="New tag" />
        <button type="submit" disabled={!newTag.trim()}>Add</button>
      </form>
    </div>}
    {mode === 'link' && <div className="thread-picker">
      <input aria-label="Find a card to link" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, alias, motif…" />
      <ul>{matches.map((item) => <li key={`${item.target.kind}:${item.target.id}`}>
        <button type="button" aria-label={`Link ${item.group}: ${item.label}`} onClick={() => { save({ links: [...links, item.target] }); setMode(null); setQuery(''); }}>{item.group}: {item.label}</button></li>)}</ul>
    </div>}
  </div>;
}
