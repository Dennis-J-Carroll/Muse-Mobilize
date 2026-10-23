import { useEffect, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { closeConversation, conversationModalOpen, useConversationView } from '../conversationView';
import type { Pane } from '../types';
import * as Icon from './icons';

export type ConversationPlacement = 'workspace' | 'workbench' | 'tab';

/** Non-modal: the writer can keep reading and editing the adjacent work. */
export function QuickConversation({ pane, contentRef, onPlace }: { pane?: Pane; contentRef: RefObject<HTMLDivElement>; onPlace: (placement: ConversationPlacement) => void }) {
  const request = useConversationView(state => state.current?.request);
  useEffect(() => {
    if (!pane) return;
    const frame = requestAnimationFrame(() => contentRef.current?.querySelector<HTMLTextAreaElement>('.agent-compose textarea')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [pane?.id, request, contentRef]);

  useEffect(() => {
    if (!pane) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || document.fullscreenElement) return;
      // Dialogs opened from a reply own their Escape before this non-modal drawer.
      if (conversationModalOpen() || (event.target instanceof Element && event.target.closest('[role="dialog"]'))) return;
      if (document.querySelector('[role="menu"]')) return;
      event.preventDefault();
      event.stopPropagation();
      closeConversation();
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, [pane?.id]);

  return createPortal(<section id="quick-conversation" className="tool-drawer is-tabs quick-conversation"
    role="region" aria-label={`${pane?.title ?? 'Muse'} conversation`} hidden={!pane}>
    <header className="tool-drawer-head">
      <Icon.Feather size={18} /><h2>{pane?.title ?? 'Muse'}</h2>
      <button type="button" aria-label="Close conversation" title="Return to your work (Escape)" onClick={() => closeConversation()}><Icon.Close size={16} /></button>
    </header>
    <div className="conversation-placement" role="group" aria-label={`Place ${pane?.title ?? 'Muse'} conversation`}>
      <span>Place in</span>
      <button type="button" onClick={() => onPlace('workspace')} title="Make a movable, resizable workspace card">Workspace</button>
      <button type="button" onClick={() => onPlace('workbench')} title="Open in the Workbench tool rail">Workbench</button>
      <button type="button" onClick={() => onPlace('tab')} title="Open as a tab in Tools">Tools tab</button>
    </div>
    <div className="tool-drawer-content" ref={contentRef} />
  </section>, document.body);
}
