import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { CanonEntityType, CanonStatus } from '../types';

const STATUSES: CanonStatus[] = ['idea', 'proposed', 'established', 'canonical', 'retconned', 'deprecated'];
const ENTITY_TYPES: CanonEntityType[] = ['character', 'location', 'organization', 'object', 'event', 'rule', 'lore'];

export function CanonPane() {
  const canon = useStore((s) => s.canon);
  const selection = useStore((s) => s.selection);
  const documents = useStore((s) => s.project?.documents ?? []);
  const [entityType, setEntityType] = useState<CanonEntityType>('character');
  const [entityName, setEntityName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [subject, setSubject] = useState('');
  const [predicate, setPredicate] = useState('');
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<CanonStatus>('proposed');
  const [attachSelection, setAttachSelection] = useState(true);

  useEffect(() => {
    void useStore.getState().loadCanon();
  }, []);

  if (!canon) return <div className="pane-body pane-loading">Opening canon…</div>;

  const createEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = entityName.trim();
    if (!name) return;
    const entity = await useStore.getState().createCanonEntity({ type: entityType, name });
    if (entity) {
      setEntityName('');
      setSubjectId(entity.id);
    }
  };

  const createFact = async (e: React.FormEvent) => {
    e.preventDefault();
    const entity = canon.entities.find((item) => item.id === subjectId);
    const readableSubject = entity?.name ?? subject.trim();
    if (!readableSubject || !predicate.trim() || !value.trim()) return;
    const evidence = attachSelection && selection
      ? [{ documentId: selection.documentId, quote: selection.text, start: selection.start, end: selection.end }]
      : [];
    const fact = await useStore.getState().createCanonFact({
      subject: readableSubject,
      ...(entity ? { subjectId: entity.id } : {}),
      predicate: predicate.trim(),
      value: value.trim(),
      status,
      evidence,
    });
    if (fact) {
      setPredicate('');
      setValue('');
      setStatus('proposed');
    }
  };

  return (
    <div className="canon-pane">
      <div className="canon-scroll">
        <section className="canon-section">
          <div className="canon-section-head">
            <div><h3>Entities</h3><p>Stable identities for characters, places, and story objects.</p></div>
            <span>{canon.entities.length}</span>
          </div>
          <div className="entity-list">
            {canon.entities.map((entity) => (
              <button key={entity.id} className={`entity-chip ${subjectId === entity.id ? 'is-on' : ''}`} onClick={() => setSubjectId(entity.id)}>
                <small>{entity.type}</small>{entity.name}
              </button>
            ))}
          </div>
          <form className="canon-inline-form" onSubmit={createEntity}>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value as CanonEntityType)}>
              {ENTITY_TYPES.map((type) => <option key={type}>{type}</option>)}
            </select>
            <input value={entityName} onChange={(e) => setEntityName(e.target.value)} placeholder="Entity name" />
            <button className="btn" disabled={!entityName.trim()}>Add</button>
          </form>
        </section>

        <section className="canon-section">
          <div className="canon-section-head">
            <div><h3>Facts</h3><p>Status separates ideas from established story truth.</p></div>
            <span>{canon.facts.length}</span>
          </div>
          <div className="fact-list">
            {canon.facts.length === 0 && <div className="canon-empty">No facts yet. Capture one below; new facts default to proposed.</div>}
            {canon.facts.map((fact) => (
              <article key={fact.id} className={`fact-card fact-${fact.status}`}>
                <div className="fact-line"><b>{fact.subject}</b><span>{fact.predicate}</span><strong>{String(fact.value)}</strong></div>
                <div className="fact-meta">
                  <select value={fact.status} onChange={(e) => void useStore.getState().updateCanonFact(fact.id, { status: e.target.value as CanonStatus })}>
                    {STATUSES.map((item) => <option key={item}>{item}</option>)}
                  </select>
                  {fact.evidence.map((item, i) => {
                    const title = documents.find((doc) => doc.id === item.documentId)?.title ?? item.documentId;
                    return <span key={`${item.documentId}-${i}`} className="evidence-link" title={item.quote}>evidence: {title}</span>;
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <form className="canon-compose" onSubmit={createFact}>
        <div className="canon-form-grid">
          <label>Entity
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Unlinked subject…</option>
              {canon.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
            </select>
          </label>
          {!subjectId && <label>Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Kiala" /></label>}
          <label>Relationship<input value={predicate} onChange={(e) => setPredicate(e.target.value)} placeholder="birthplace" /></label>
          <label>Value<input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Veyr" /></label>
          <label>Status<select value={status} onChange={(e) => setStatus(e.target.value as CanonStatus)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <div className="canon-compose-actions">
          <label className={`sel-toggle ${selection ? '' : 'is-off'}`}>
            <input type="checkbox" checked={attachSelection && Boolean(selection)} disabled={!selection} onChange={(e) => setAttachSelection(e.target.checked)} />
            attach selection as evidence{selection ? ` (${selection.text.split(/\s+/).filter(Boolean).length}w)` : ''}
          </label>
          <button className="btn btn-primary" disabled={!(subjectId || subject.trim()) || !predicate.trim() || !value.trim()}>Capture fact</button>
        </div>
      </form>
    </div>
  );
}
