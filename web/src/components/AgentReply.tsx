import { useMemo, useState } from 'react';
import { renderAgentMarkdown } from '../agentMarkdown';

export function AgentReply({ text }: { text: string }) {
  const html = useMemo(() => renderAgentMarkdown(text), [text]);
  return <div className="agent-reply" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function CopyReply({ text }: { text: string }) {
  const [status, setStatus] = useState('');
  return <div className="reply-copy"><button type="button" className="linkish" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setStatus('Copied.'); }
    catch { setStatus('Copy unavailable. Select reply text and copy manually.'); }
  }}>Copy response</button><span role="status">{status}</span></div>;
}
