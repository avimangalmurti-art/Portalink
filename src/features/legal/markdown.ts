export const escapeLegalHtml = (value: string) => value.replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character] ?? character));
function inline(text: string): string {
  return escapeLegalHtml(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_match, label: string, href: string) => {
    if (!/^https:\/\//i.test(href) && !/^\/(?!\/)/.test(href)) return label;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
}
/** Deliberately small, escaped Markdown subset: no raw HTML or executable URLs. */
export function legalMarkdownHtml(markdown: string): string {
  return markdown.replace(/\r\n/g,'\n').split(/\n\s*\n/).map(block => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(block);
    if (heading) {
      const text = heading[2], id = ['Private','Public','Citable'].includes(text) ? ` id="${text.toLowerCase()}"` : '';
      return `<h${heading[1].length + 1}${id}>${inline(text)}</h${heading[1].length + 1}>`;
    }
    if (block.split('\n').every(line => /^- /.test(line))) return `<ul>${block.split('\n').map(line=>`<li>${inline(line.slice(2))}</li>`).join('')}</ul>`;
    return `<p>${inline(block).replace(/\n/g,'<br>')}</p>`;
  }).join('\n');
}
