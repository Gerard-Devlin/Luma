import type { DanmakuComment } from './types';

export function parseXmlDanmaku(xmlContent: string): DanmakuComment[] {
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlContent, 'text/xml');
  const nodes = xml.getElementsByTagName('d');
  const comments: DanmakuComment[] = [];

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const p = node.getAttribute('p');
    const text = node.textContent;

    if (!p || !text) continue;

    const parts = p.split(',');
    const cid = Number.parseInt(parts[7] || String(i), 10) || i;

    comments.push({ p, m: text, cid });
  }

  return comments;
}
