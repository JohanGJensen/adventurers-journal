// A deliberately small markdown subset for notes: headings, lists, quotes, rules, paragraphs,
// and **bold**, *italic*, `code` inline. Produces a tree; rendering is up to the caller, so
// nothing here ever becomes raw HTML.

export type Inline = { t: 'text'; text: string } | { t: 'code'; text: string } | { t: 'strong' | 'em'; children: Inline[] };

export type Block =
  | { t: 'h'; level: 1 | 2 | 3; text: string }
  | { t: 'p'; lines: string[] }
  | { t: 'quote'; lines: string[] }
  | { t: 'ul' | 'ol'; items: string[] }
  | { t: 'hr' };

const H = /^(#{1,3})\s+(.*)$/;
const UL = /^\s*[-*•]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  const run = (re: RegExp) => {
    const got: string[] = [];
    while (i < lines.length && re.test(lines[i])) got.push(re.exec(lines[i++])![1]);
    return got;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = H.exec(line);
    if (h) {
      out.push({ t: 'h', level: h[1].length as 1 | 2 | 3, text: h[2].trim() });
      i++;
    } else if (HR.test(line)) {
      out.push({ t: 'hr' });
      i++;
    } else if (UL.test(line)) out.push({ t: 'ul', items: run(UL) });
    else if (OL.test(line)) out.push({ t: 'ol', items: run(OL) });
    else if (QUOTE.test(line)) out.push({ t: 'quote', lines: run(QUOTE) });
    else {
      const p: string[] = [];
      while (i < lines.length && lines[i].trim() && ![H, UL, OL, QUOTE, HR].some((re) => re.test(lines[i]))) p.push(lines[i++]);
      out.push({ t: 'p', lines: p });
    }
  }
  return out;
}

const INLINE = /`([^`\n]+)`|\*\*(?=\S)(.+?)(?<=\S)\*\*|(?<![\p{L}\p{N}*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\p{L}\p{N}*])|(?<![\p{L}\p{N}_])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}_])/u;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push({ t: 'text', text: rest });
      break;
    }
    if (m.index) out.push({ t: 'text', text: rest.slice(0, m.index) });
    if (m[1] !== undefined) out.push({ t: 'code', text: m[1] });
    else if (m[2] !== undefined) out.push({ t: 'strong', children: parseInline(m[2]) });
    else out.push({ t: 'em', children: parseInline(m[3] ?? m[4]) });
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
