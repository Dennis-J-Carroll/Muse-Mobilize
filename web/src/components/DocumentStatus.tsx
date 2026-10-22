import { useStore } from '../store';

/** Status follows the document, including when several writing panes are open. */
export function DocumentStatus({ documentId }: { documentId: string }) {
  const doc = useStore((s) => s.docs[documentId]);
  if (!doc) return null;
  const words = doc.content.split(/\s+/).filter(Boolean).length;
  const saved = doc.recovery ? 'Recovered draft needs review'
    : doc.applyingPatch ? 'Applying accepted edit…'
    : doc.dirty ? 'Unsaved changes'
    : doc.savedAt ? `Saved at ${new Date(doc.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'No unsaved changes';
  return <div className="document-status" role="group" aria-label={`${doc.title} status`}>
    <span className="document-status-title" title={doc.title}>{doc.title}</span>
    <span>{words.toLocaleString()} {words === 1 ? 'word' : 'words'}</span>
    {/* Announce save transitions, not a new word count on every keystroke. */}
    <span role="status">{saved}</span>
  </div>;
}
