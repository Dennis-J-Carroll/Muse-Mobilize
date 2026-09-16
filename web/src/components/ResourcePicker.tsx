import { useState } from 'react';
import { RESOURCE_LABELS, type ResourceInfo, type ResourceKind, type ResourceSelection } from '../../../shared/project-tools';

export function ResourcePicker({ kind, value, records, onChange, labelPrefix = '', ordered = false }: {
  kind: ResourceKind; value: ResourceSelection | undefined; records: ResourceInfo[];
  onChange: (selection?: ResourceSelection) => void; labelPrefix?: string; ordered?: boolean;
}) {
  const [query, setQuery] = useState('');
  const label = `${labelPrefix}${RESOURCE_LABELS[kind]}`;
  const candidates = records.filter((r) => r.kind === kind);
  const selected = value?.mode === 'selected' ? value.ids : [];
  const move = (index: number, delta: number) => { const ids = [...selected]; [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]]; onChange({ mode: 'selected', ids }); };
  return <div className="resource-picker">
    <label>{label}<select aria-label={`${label} access`} value={value?.mode ?? 'none'} onChange={(e) => onChange(e.target.value === 'none' ? undefined : e.target.value === 'all' ? { mode: 'all' } : { mode: 'selected', ids: [] })}>
      <option value="none">None</option><option value="selected">Selected records</option><option value="all">All — includes future records</option>
    </select></label>
    {value?.mode === 'selected' && <>
      <label>Find records<input aria-label={`Search ${label} records`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <div className="resource-options" role="group" aria-label={`${label} records`}>
        {candidates.filter((r) => `${r.title} ${r.detail ?? ''}`.toLowerCase().includes(query.toLowerCase())).map((r) => <label className="check-row" key={r.id}><input type="checkbox" checked={selected.includes(r.id)} onChange={(e) => onChange({ mode: 'selected', ids: e.target.checked ? [...selected, r.id] : selected.filter((id) => id !== r.id) })} /><span>{r.title}<small>{r.detail}</small></span></label>)}
        {!candidates.length && <p>No records yet.</p>}
      </div>
      {selected.filter((id) => !candidates.some((r) => r.id === id)).map((id) => <p key={id} className="tool-warning">Missing record: {id} <button onClick={() => onChange({ mode: 'selected', ids: selected.filter((x) => x !== id) })}>Remove missing assignment</button></p>)}
      {ordered && selected.length > 1 && <ol className="record-order" aria-label={`${label} reading order`}>{selected.map((id, i) => <li key={id}><span>{candidates.find((r) => r.id === id)?.title ?? id}</span><button aria-label={`Move record ${i + 1} up`} disabled={!i} onClick={() => move(i, -1)}>↑</button><button aria-label={`Move record ${i + 1} down`} disabled={i === selected.length - 1} onClick={() => move(i, 1)}>↓</button></li>)}</ol>}
    </>}
  </div>;
}
