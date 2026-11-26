import { describe, expect, test } from 'bun:test';
import { parseBlocks, parseInline } from '../src/lib/markdown';

describe('markdown', () => {
  test('blocks', () => {
    expect(parseBlocks('# Title\nfirst line\nsecond\n\n- a\n* b\n1. one\n2) two\n> said\n> more\n---\nend')).toEqual([
      { t: 'h', level: 1, text: 'Title' },
      { t: 'p', lines: ['first line', 'second'] },
      { t: 'ul', items: ['a', 'b'] },
      { t: 'ol', items: ['one', 'two'] },
      { t: 'quote', lines: ['said', 'more'] },
      { t: 'hr' },
      { t: 'p', lines: ['end'] },
    ]);
    expect(parseBlocks('')).toEqual([]);
    expect(parseBlocks('#hashtag')).toEqual([{ t: 'p', lines: ['#hashtag'] }]);
  });

  test('inline', () => {
    expect(parseInline('a **bold [[X]]** and *it* or _it_ `co*de`')).toEqual([
      { t: 'text', text: 'a ' },
      { t: 'strong', children: [{ t: 'text', text: 'bold [[X]]' }] },
      { t: 'text', text: ' and ' },
      { t: 'em', children: [{ t: 'text', text: 'it' }] },
      { t: 'text', text: ' or ' },
      { t: 'em', children: [{ t: 'text', text: 'it' }] },
      { t: 'text', text: ' ' },
      { t: 'code', text: 'co*de' },
    ]);
    // stray markers stay text
    expect(parseInline('2 * 3 * 4 and snake_case_name')).toEqual([{ t: 'text', text: '2 * 3 * 4 and snake_case_name' }]);
  });
});
