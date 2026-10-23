import MarkdownIt from 'markdown-it';

// Replies are untrusted prose: HTML stays literal and images never load remotely.
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
markdown.validateLink = url => /^(https?:\/\/|mailto:|#)/i.test(url);
markdown.renderer.rules.image = (tokens, index) => `<span class="reply-image-note">${markdown.utils.escapeHtml(tokens[index].content || 'Image')}</span>`;
const renderLink = markdown.renderer.rules.link_open;
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet('target', '_blank');
  tokens[index].attrSet('rel', 'noopener noreferrer');
  return renderLink ? renderLink(tokens, index, options, env, renderer) : renderer.renderToken(tokens, index, options);
};

export const renderAgentMarkdown = (text: string) => markdown.render(text);
