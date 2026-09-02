import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type {
  CanonEntity,
  CanonStatus,
  CharacterProfile,
  CharacterSense,
  CharacterSenseSubtag,
  Pane,
  SenseIndicator,
} from '../types';

const STATUS_ORDER: CanonStatus[] = ['canonical', 'established', 'proposed', 'idea', 'retconned', 'deprecated'];

const emptySense = (): CharacterSense => ({ summary: '', subtags: [] });
const emptyProfile = (): CharacterProfile => ({
  categories: [],
  attributes: { role: '', pronouns: '', age: '', goals: [], fears: [] },
  physical: { description: '', distinguishingFeatures: [], clothing: [] },
  senses: { vision: emptySense(), audio: emptySense(), proximity: emptySense() },
  references: { images: [] },
});

interface CharacterDraft {
  name: string;
  aliases: string;
  categories: string;
  summary: string;
  role: string;
  pronouns: string;
  age: string;
  goals: string;
  fears: string;
  physical: string;
  features: string;
  clothing: string;
  imageUrl: string;
  imageCaption: string;
  visionSummary: string;
  visionTags: string;
  audioSummary: string;
  audioTags: string;
  proximitySummary: string;
  proximityTags: string;
}

const blankDraft = (): CharacterDraft => ({
  name: '', aliases: '', categories: 'active cast', summary: '', role: '', pronouns: '', age: '',
  goals: '', fears: '', physical: '', features: '', clothing: '', imageUrl: '', imageCaption: '',
  visionSummary: '', visionTags: '', audioSummary: '', audioTags: '', proximitySummary: '', proximityTags: '',
});

const list = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
const canPreview = (src: string) => /^(https?:\/\/|\/)/i.test(src);

const INDICATORS: Record<string, SenseIndicator> = {
  '+': 'strength',
  '-': 'limitation',
  '!': 'sensitivity',
  '~': 'preference',
};

function parseTags(raw: string, existing: CharacterSenseSubtag[] = []): CharacterSenseSubtag[] {
  const tags: CharacterSenseSubtag[] = [];
  raw.split(',').forEach((part, index) => {
    const clean = part.trim();
    if (!clean) return;
    const indicator = INDICATORS[clean[0]] ?? 'neutral';
    const body = INDICATORS[clean[0]] ? clean.slice(1).trim() : clean;
    const [label, ...rest] = body.split(':');
    const normalizedLabel = label.trim();
    if (!normalizedLabel) return;
    const prior = existing.find((tag) => tag.label.toLowerCase() === normalizedLabel.toLowerCase());
    tags.push({
      id: prior?.id ?? `${normalizedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index}`,
      label: normalizedLabel,
      value: rest.join(':').trim(),
      indicator,
      status: prior?.status ?? 'proposed',
      evidence: prior?.evidence ?? [],
    });
  });
  return tags;
}

function tagsToText(sense: CharacterSense): string {
  const symbol: Record<SenseIndicator, string> = { strength: '+', limitation: '-', sensitivity: '!', preference: '~', neutral: '' };
  return sense.subtags.map((tag) => `${symbol[tag.indicator]} ${tag.label}${tag.value ? `: ${tag.value}` : ''}`.trim()).join(', ');
}

function draftFrom(entity?: CanonEntity): CharacterDraft {
  if (!entity) return blankDraft();
  const profile = entity.character ?? emptyProfile();
  const image = profile.references.images[0];
  return {
    name: entity.name,
    aliases: entity.aliases.join(', '),
    categories: profile.categories.join(', '),
    summary: entity.summary ?? '',
    role: profile.attributes.role,
    pronouns: profile.attributes.pronouns,
    age: profile.attributes.age,
    goals: profile.attributes.goals.join(', '),
    fears: profile.attributes.fears.join(', '),
    physical: profile.physical.description,
    features: profile.physical.distinguishingFeatures.join(', '),
    clothing: profile.physical.clothing.join(', '),
    imageUrl: image?.src ?? '',
    imageCaption: image?.caption ?? '',
    visionSummary: profile.senses.vision.summary,
    visionTags: tagsToText(profile.senses.vision),
    audioSummary: profile.senses.audio.summary,
    audioTags: tagsToText(profile.senses.audio),
    proximitySummary: profile.senses.proximity.summary,
    proximityTags: tagsToText(profile.senses.proximity),
  };
}

function profileFrom(draft: CharacterDraft, existing?: CharacterProfile): CharacterProfile {
  const imageUrl = draft.imageUrl.trim();
  return {
    categories: list(draft.categories),
    attributes: {
      role: draft.role.trim(), pronouns: draft.pronouns.trim(), age: draft.age.trim(),
      goals: list(draft.goals), fears: list(draft.fears),
    },
    physical: {
      description: draft.physical.trim(), distinguishingFeatures: list(draft.features), clothing: list(draft.clothing),
    },
    senses: {
      vision: { summary: draft.visionSummary.trim(), subtags: parseTags(draft.visionTags, existing?.senses.vision.subtags) },
      audio: { summary: draft.audioSummary.trim(), subtags: parseTags(draft.audioTags, existing?.senses.audio.subtags) },
      proximity: { summary: draft.proximitySummary.trim(), subtags: parseTags(draft.proximityTags, existing?.senses.proximity.subtags) },
    },
    references: {
      images: imageUrl ? [{ id: 'primary-reference', src: imageUrl, caption: draft.imageCaption.trim(), tags: ['character reference'] }] : [],
    },
  };
}

function SenseBand({ name, sense, glyph }: { name: string; sense: CharacterSense; glyph: string }) {
  return (
    <section className={`sense-band sense-${name.toLowerCase()}`}>
      <div className="sense-name"><i>{glyph}</i><span>{name}</span></div>
      <p>{sense.summary || 'No sensory baseline recorded.'}</p>
      <div className="sense-subtags">
        {sense.subtags.map((tag) => (
          <span key={tag.id} className={`sense-tag indicator-${tag.indicator}`} title={`${tag.status}${tag.evidence.length ? ` · ${tag.evidence.join(', ')}` : ''}`}>
            <b>{tag.label}</b>{tag.value && <em>{tag.value}</em>}
          </span>
        ))}
        {!sense.subtags.length && <span className="sense-none">no indicators</span>}
      </div>
    </section>
  );
}

function Drawer({ entity, draft, setDraft, onClose, onSave }: {
  entity?: CanonEntity;
  draft: CharacterDraft;
  setDraft: React.Dispatch<React.SetStateAction<CharacterDraft>>;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const first = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const field = (key: keyof CharacterDraft) => ({
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((current) => ({ ...current, [key]: e.target.value })),
  });

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    try { await onSave(); } finally { setSaving(false); }
  };

  return (
    <div className="character-drawer-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <form className="character-drawer" onSubmit={save}>
        <header>
          <div><span>{entity ? 'Revise dossier' : 'Bring someone into the story'}</span><h2>{entity?.name ?? 'New character'}</h2></div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="drawer-scroll">
          <section className="drawer-section">
            <h3>Identity</h3>
            <div className="drawer-grid">
              <label className="span-2">Name<input ref={first} {...field('name')} placeholder="Character name" /></label>
              <label>Role<input {...field('role')} placeholder="protagonist, envoy…" /></label>
              <label>Pronouns<input {...field('pronouns')} placeholder="she/her" /></label>
              <label>Age<input {...field('age')} placeholder="unknown" /></label>
              <label>Aliases<input {...field('aliases')} placeholder="comma separated" /></label>
              <label className="span-2">Categories<input {...field('categories')} placeholder="active cast, council, protagonist" /></label>
              <label className="span-2">Story function<textarea {...field('summary')} rows={3} placeholder="What pressure does this character bring into the story?" /></label>
            </div>
          </section>
          <section className="drawer-section">
            <h3>Body & motive</h3>
            <div className="drawer-grid">
              <label className="span-2">Physical description<textarea {...field('physical')} rows={4} placeholder="Silhouette, movement, presence…" /></label>
              <label>Distinguishing features<input {...field('features')} placeholder="scar, silver braid" /></label>
              <label>Clothing<input {...field('clothing')} placeholder="grey cloak, council pin" /></label>
              <label>Goals<input {...field('goals')} placeholder="comma separated" /></label>
              <label>Fears<input {...field('fears')} placeholder="comma separated" /></label>
            </div>
          </section>
          <section className="drawer-section sensory-editor">
            <h3>Sensory signature</h3>
            <p className="notation">Subtags: <b>+</b> strength · <b>−</b> limitation · <b>!</b> sensitivity · <b>~</b> preference. Example: <code>- low light: poor</code></p>
            {(['vision', 'audio', 'proximity'] as const).map((sense) => {
              const summaryKey = `${sense}Summary` as keyof CharacterDraft;
              const tagsKey = `${sense}Tags` as keyof CharacterDraft;
              return <div className={`sense-editor-row sense-${sense}`} key={sense}>
                <strong>{sense}</strong>
                <input {...field(summaryKey)} placeholder={`${sense} baseline`} />
                <input {...field(tagsKey)} placeholder="subtags, comma separated" />
              </div>;
            })}
          </section>
          <section className="drawer-section">
            <h3>Reference image</h3>
            <div className="drawer-grid">
              <label className="span-2">Image URL or project asset path<input {...field('imageUrl')} placeholder="https://… or /api/projects/…/assets/…" /></label>
              <label className="span-2">Caption<input {...field('imageCaption')} placeholder="Costume, age, scene, or visual target" /></label>
            </div>
          </section>
        </div>
        <footer><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!draft.name.trim() || saving}>{saving ? 'Saving…' : entity ? 'Save changes' : 'Add to cast'}</button></footer>
      </form>
    </div>
  );
}

export function CharactersPane({ pane }: { pane: Pane }) {
  const canon = useStore((s) => s.canon);
  const agents = useStore((s) => s.agents);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState('all');
  const [drawerEntity, setDrawerEntity] = useState<CanonEntity | null | undefined>(undefined);
  const [draft, setDraft] = useState<CharacterDraft>(blankDraft);

  useEffect(() => { void useStore.getState().loadCanon(); }, []);
  const characters = useMemo(() => (canon?.entities ?? []).filter((entity) => entity.type === 'character'), [canon]);
  const categories = useMemo(() => Array.from(new Set(characters.flatMap((entity) => entity.character?.categories ?? []))).sort(), [characters]);
  const visible = filter === 'all' ? characters : characters.filter((entity) => entity.character?.categories.includes(filter));

  useEffect(() => {
    if (!selectedId && characters[0]) setSelectedId(characters[0].id);
    if (selectedId && !characters.some((entity) => entity.id === selectedId)) setSelectedId(characters[0]?.id ?? '');
  }, [characters, selectedId]);

  const selected = characters.find((entity) => entity.id === selectedId);
  const profile = selected?.character ?? emptyProfile();
  const relatedFacts = (canon?.facts ?? []).filter((fact) => fact.subjectId === selected?.id || (!fact.subjectId && fact.subject === selected?.name));
  const characterAgent = agents.find((agent) => agent.role === 'character' && (agent.id === selected?.id || agent.name.toLowerCase() === selected?.name.toLowerCase()));
  const image = profile.references.images[0];

  const openDrawer = (entity?: CanonEntity) => {
    setDraft(draftFrom(entity));
    setDrawerEntity(entity ?? null);
  };
  const closeDrawer = () => setDrawerEntity(undefined);
  const save = async () => {
    const profile = profileFrom(draft, drawerEntity?.character);
    if (drawerEntity) {
      const updated = await useStore.getState().updateCanonEntity(drawerEntity.id, {
        name: draft.name.trim(), aliases: list(draft.aliases), summary: draft.summary.trim(), character: profile,
      });
      if (updated) {
        setSelectedId(updated.id);
        closeDrawer();
      }
    } else {
      const created = await useStore.getState().createCanonEntity({
        type: 'character', name: draft.name.trim(), aliases: list(draft.aliases), summary: draft.summary.trim(), character: profile,
      });
      if (created) {
        setSelectedId(created.id);
        closeDrawer();
      }
    }
  };

  if (!canon) return <div className="pane-body pane-loading">Gathering cast…</div>;

  return (
    <div className="characters-workspace">
      <header className="cast-header">
        <div><span className="cast-eyebrow">Story presence</span><h2>Cast in motion</h2></div>
        <div className="cast-filter" aria-label="Filter cast">
          <button className={filter === 'all' ? 'is-on' : ''} onClick={() => setFilter('all')}>All {characters.length}</button>
          {categories.map((category) => <button key={category} className={filter === category ? 'is-on' : ''} onClick={() => setFilter(category)}>{category}</button>)}
        </div>
      </header>

      <nav className="cast-line" aria-label="Story characters">
        <span className="cast-thread" />
        {visible.map((entity) => {
          const ref = entity.character?.references.images[0];
          return <button key={entity.id} className={`cast-person ${selectedId === entity.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(entity.id)}>
            <span className="cast-portrait">{ref && canPreview(ref.src) ? <img src={ref.src} alt="" /> : initials(entity.name)}</span>
            <b>{entity.name}</b><small>{entity.character?.attributes.role || 'role unwritten'}</small>
          </button>;
        })}
        <button className="cast-person cast-add" onClick={() => openDrawer()}><span className="cast-portrait">+</span><b>Add character</b><small>enter story</small></button>
      </nav>

      {!selected ? (
        <div className="cast-empty"><span>+</span><h3>No one has entered yet.</h3><p>Add first character, then shape how they see, hear, and feel story around them.</p><button className="btn btn-primary" onClick={() => openDrawer()}>Add first character</button></div>
      ) : (
        <div className="character-dossier">
          <aside className="identity-margin">
            <div className="hero-portrait">{image && canPreview(image.src) ? <img src={image.src} alt={image.caption || selected.name} /> : <span>{initials(selected.name)}</span>}</div>
            {image?.caption && <p className="portrait-caption">{image.caption}</p>}
            <span className="identity-kicker">{profile.attributes.role || 'Character'}</span>
            <h1>{selected.name}</h1>
            {selected.aliases.length > 0 && <p className="aliases">also {selected.aliases.join(' · ')}</p>}
            <div className="category-ribbon">{profile.categories.map((category) => <span key={category}>{category}</span>)}</div>
            <dl className="identity-ledger">
              <div><dt>Pronouns</dt><dd>{profile.attributes.pronouns || '—'}</dd></div>
              <div><dt>Age</dt><dd>{profile.attributes.age || '—'}</dd></div>
              <div><dt>Canon facts</dt><dd>{relatedFacts.length}</dd></div>
            </dl>
            <div className="identity-actions">
              <button className="btn btn-primary" onClick={() => openDrawer(selected)}>Edit dossier</button>
              {characterAgent && <button className="btn" onClick={() => { useStore.getState().setPaneSize(pane.id, 'normal'); useStore.getState().openPane('agent', { bindingId: characterAgent.id, region: 'right' }); }}>Speak with {selected.name}</button>}
              <button className="linkish" onClick={() => { useStore.getState().setPaneSize(pane.id, 'normal'); useStore.getState().openPane('canon', { title: 'Canon', region: 'right' }); }}>open canon trail</button>
            </div>
          </aside>

          <main className="dossier-body">
            <section className="character-premise"><span>Story function</span><p>{selected.summary || 'No story function written yet. Define what changes when this character enters a scene.'}</p></section>
            <section className="body-motive">
              <div><span>Physical presence</span><p>{profile.physical.description || 'Physical presence unwritten.'}</p>{profile.physical.distinguishingFeatures.length > 0 && <ul>{profile.physical.distinguishingFeatures.map((item) => <li key={item}>{item}</li>)}</ul>}</div>
              <div><span>Wants</span>{profile.attributes.goals.length ? <ol>{profile.attributes.goals.map((item) => <li key={item}>{item}</li>)}</ol> : <p>Goals unwritten.</p>}<span className="secondary-label">Fears</span>{profile.attributes.fears.length ? <ol>{profile.attributes.fears.map((item) => <li key={item}>{item}</li>)}</ol> : <p>Fears unwritten.</p>}</div>
              <div><span>Visual language</span>{profile.physical.clothing.length ? <ul>{profile.physical.clothing.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Clothing and visual references unwritten.</p>}</div>
            </section>
            <section className="sensory-signature">
              <header><div><span>Perception model</span><h3>Sensory signature</h3></div><p>What reaches this character—and what does not.</p></header>
              <SenseBand name="Vision" glyph="V" sense={profile.senses.vision} />
              <SenseBand name="Audio" glyph="A" sense={profile.senses.audio} />
              <SenseBand name="Proximity" glyph="P" sense={profile.senses.proximity} />
            </section>
            <section className="canon-trail"><span>Canon trail</span>{relatedFacts.length ? relatedFacts.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)).map((fact) => <div key={fact.id}><i className={`fact-dot fact-${fact.status}`} /><b>{fact.predicate}</b><strong>{String(fact.value)}</strong><em>{fact.status}</em></div>) : <p>No linked facts yet.</p>}</section>
          </main>
        </div>
      )}

      {drawerEntity !== undefined && <Drawer entity={drawerEntity ?? undefined} draft={draft} setDraft={setDraft} onClose={closeDrawer} onSave={save} />}
    </div>
  );
}
