import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { PremiseSlots, PremiseStore } from '../types';
import { composeLogline, keepVariant, promote, removeVariant } from '../premise';
import { DraftRecoveryNotice, useRecoverableDraft } from '../useRecoverableDraft';

type PremiseDraft = { working: string; slots: PremiseSlots };
const draftFrom = (premise: PremiseStore): PremiseDraft => ({ working: premise.working, slots: { ...premise.slots } });
const SLOT_FIELDS: { key: keyof PremiseSlots; label: string; placeholder: string }[] = [
  { key: 'protagonist', label: 'Protagonist', placeholder: 'Traven Lorne' },
  { key: 'want', label: 'Wants', placeholder: 'to hold the oath he swore' },
  { key: 'obstacle', label: 'Obstacle', placeholder: 'Creedies Hjaar' },
  { key: 'stakes', label: 'If they fail', placeholder: 'the realm falls to a usurper' },
  { key: 'twist', label: 'Twist', placeholder: 'the oath was never his to keep' },
];

/** Premise Builder: one working premise every agent reads, logline slots, Muse what-ifs, and variants. */
export function PremisePane() {
  const premise = useStore((s) => s.premise);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (premise) return;
    void useStore.getState().loadPremise().then(() => setFailed(!useStore.getState().premise));
  }, [premise]);
  if (!premise) {
    return <div className="pane-body pane-loading">{failed
      ? <p>Premise could not load. <button type="button" className="linkish" onClick={() => { setFailed(false); void useStore.getState().loadPremise(); }}>Retry</button></p>
      : 'Opening premise…'}</div>;
  }
  return <PremiseWorkspace premise={premise} />;
}

function PremiseWorkspace({ premise }: { premise: PremiseStore }) {
  const recovery = useRecoverableDraft('premise', 'working', () => draftFrom(premise));
  const { draft, setDraft } = recovery;
  const [whatIfs, setWhatIfs] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const dirty = draft.working !== premise.working || (Object.keys(draft.slots) as (keyof PremiseSlots)[]).some((key) => draft.slots[key] !== premise.slots[key]);
  const logline = composeLogline(draft.slots);
  const basis = draft.working.trim() || logline;

  /** Persist the form (working premise + slots), optionally transforming the store first. */
  const save = async (transform: (current: PremiseStore) => PremiseStore = (current) => current) => {
    const checkpoint = recovery.checkpoint();
    const form = { working: draft.working.trim(), slots: draft.slots };
    const saved = await useStore.getState().updatePremise((current) => transform({ ...current, ...form }));
    if (saved) recovery.completeSave(checkpoint, draftFrom(saved));
    return saved;
  };
  const saveIfDirty = () => { if (dirty) void save(); };
  /** Promotion replaces the working text, so the form follows it. */
  const promoteText = async (text: string) => {
    const saved = await save((current) => promote(current, text));
    if (saved) setDraft(draftFrom(saved));
    return saved;
  };
  const ask = async () => {
    if (!basis || asking) return;
    setAsking(true);
    try { setWhatIfs((await useStore.getState().premiseWhatIfs(basis)) ?? []); } finally { setAsking(false); }
  };
  const dropWhatIf = (text: string) => setWhatIfs((cards) => cards.filter((card) => card !== text));

  return <div className="premise-workspace" onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void save(); }
  }}>
    <header className="story-toolbar premise-toolbar">
      <div><span>Story idea</span><h2>Premise</h2></div>
      <p>{dirty ? <><span className="premise-dirty" aria-hidden="true">•</span> Unsaved · Ctrl+Enter saves</> : 'Every agent reads the working premise.'}</p>
    </header>
    <div className="premise-scroll">
      {recovery.restored && <DraftRecoveryNotice recovery={recovery} />}

      <section className="premise-card premise-working" aria-labelledby="premise-working-heading">
        <h3 id="premise-working-heading">Working premise</h3>
        <textarea aria-label="Working premise" value={draft.working} maxLength={1200} rows={3}
          placeholder="One or two sentences: who wants what, what stands in the way, and what it costs. Or build it from the slots below."
          onChange={(event) => setDraft({ ...draft, working: event.target.value })} onBlur={saveIfDirty} />
      </section>

      <section className="premise-card" aria-labelledby="premise-slots-heading">
        <h3 id="premise-slots-heading">Logline slots</h3>
        <div className="premise-slots">
          {SLOT_FIELDS.map(({ key, label, placeholder }) => <label key={key}>{label}
            <input value={draft.slots[key]} maxLength={600} placeholder={placeholder}
              onChange={(event) => setDraft({ ...draft, slots: { ...draft.slots, [key]: event.target.value } })} onBlur={saveIfDirty} />
          </label>)}
        </div>
        <p className={`premise-logline ${logline ? '' : 'is-empty'}`} aria-live="polite">{logline || 'Fill a slot to see the logline take shape.'}</p>
        <div className="premise-actions">
          <button type="button" className="btn btn-primary" disabled={!logline} onClick={() => void promoteText(logline)}>Use as working premise</button>
          <button type="button" className="btn" disabled={!logline} onClick={() => void save((current) => keepVariant(current, logline, 'manual'))}>Save as variant</button>
        </div>
      </section>

      <section className="premise-card" aria-labelledby="premise-whatifs-heading">
        <h3 id="premise-whatifs-heading">What-ifs</h3>
        <button type="button" className="btn" disabled={!basis || asking} onClick={() => void ask()}>{asking ? 'Muse is thinking…' : 'Ask Muse for 3 what-ifs'}</button>
        {!basis && <p className="premise-hint">Write a working premise or fill the slots first.</p>}
        {whatIfs.length > 0 && <ul className="premise-list" aria-label="Muse what-ifs">
          {whatIfs.map((text) => <li key={text} className="premise-item is-muse">
            <p>{text}</p>
            <div className="premise-item-actions">
              <button type="button" onClick={() => { void save((current) => keepVariant(current, text, 'muse')); dropWhatIf(text); }}>Keep</button>
              <button type="button" onClick={() => { void promoteText(text); dropWhatIf(text); }}>Promote</button>
              <button type="button" onClick={() => dropWhatIf(text)}>Discard</button>
            </div>
          </li>)}
        </ul>}
      </section>

      <section className="premise-card" aria-labelledby="premise-variants-heading">
        <h3 id="premise-variants-heading">Variants <small>{premise.variants.length}</small></h3>
        {!premise.variants.length && <p className="premise-hint">Kept what-ifs and earlier premises collect here, so promoting never loses text.</p>}
        {premise.variants.length > 0 && <ul className="premise-list" aria-label="Premise variants">
          {premise.variants.map((variant) => <li key={variant.id} className={`premise-item is-${variant.source}`}>
            <span className="premise-source">{variant.source === 'muse' ? 'Muse' : 'Yours'}</span>
            <p>{variant.text}</p>
            <div className="premise-item-actions">
              <button type="button" aria-label={`Promote variant: ${variant.text.slice(0, 40)}`} onClick={() => void promoteText(variant.text)}>Promote</button>
              <button type="button" aria-label={`Delete variant: ${variant.text.slice(0, 40)}`} onClick={() => {
                if (variant.text.length > 200 && !window.confirm('Delete this variant?')) return;
                void save((current) => removeVariant(current, variant.id));
              }}>Delete</button>
            </div>
          </li>)}
        </ul>}
      </section>
    </div>
  </div>;
}
