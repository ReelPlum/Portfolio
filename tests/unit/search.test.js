import { describe, it, expect } from 'vitest';
import {
  markdownToText, chunkText, createKeywordIndex, keywordSearch, termRanges, mergeRanges, highlightRanges,
  segments, snippet, quantize, dequantize, cosine, hashEmbed, semanticScores, mergeResults, matchedFields,
  findMath, renderParts, tokenize, paragraphs, prefixed, EMBED_MODELS, DEFAULT_MODEL,
} from '../../src/lib/search.js';
import { buildChunks } from '../../src/lib/search-build.js';

const docs = [
  { id: 'projects/interp', type: 'Project', title: 'My Interpreter', description: 'A language interpreter in Rust', tags: ['Rust', 'WebAssembly'], body: 'The lexer turns text into tokens. The parser builds a tree.' },
  { id: 'blog/pasta', type: 'Post', title: 'Cooking pasta', description: 'Dinner notes', tags: ['Food'], body: 'Boil water, add salt, cook the pasta for nine minutes.' },
  { id: 'blog/math', type: 'Post', title: 'Sums', description: '', tags: [], body: 'Gauss noticed $\\sum_{k=1}^{n} k = \\frac{n(n+1)}{2}$ as a child.' },
];

describe('markdownToText', () => {
  // Regression: the list-marker rule swallowed the blank line before a list item.
  it('strips markdown but keeps readable text', () => {
    expect(markdownToText('# Title\n\nSome **bold** and _em_ and [a link](/x) and ![alt](/i.png).\n\n- item\n\n```js\nlet x = 1\n```'))
      .toBe('Title\n\nSome bold and em and a link and alt.\n\nitem\n\nlet x = 1');
  });
  it('drops embed links on their own line', () => {
    expect(markdownToText('Watch:\n\nhttps://youtu.be/aqz-KE-bpKQ\n\nDone')).toBe('Watch:\n\nDone');
    // Regression: site-relative PDF embeds showed up as "/files/notes.pdf" in search snippets.
    expect(markdownToText('Notes:\n\n/files/notes.pdf\n\nEnd')).toBe('Notes:\n\nEnd');
  });
  // Regression: "_" in LaTeX subscripts was treated as emphasis and removed (x_1 + y_2 became x1 + y2).
  it('keeps LaTeX untouched', () => {
    expect(markdownToText('We have $x_1 + y_2$ and $a*b*c$.')).toBe('We have $x_1 + y_2$ and $a*b*c$.');
  });
});

describe('findMath / renderParts', () => {
  it('finds inline and display maths but not prices', () => {
    const m = findMath('Cost $5 and $10. Then $x^2$ and $$\\int f$$.');
    expect(m.map((x) => [x.tex, x.display])).toEqual([['x^2', false], ['\\int f', true]]);
  });
  it('splits text, keeps formulas whole and marks highlighted ones', () => {
    const text = 'sum $a_1$ here';
    expect(renderParts(text, [[0, 2], [5, 5]])).toEqual([
      { type: 'text', text: 'sum', match: true },
      { type: 'text', text: ' ', match: false },
      { type: 'math', tex: 'a_1', display: false, match: true },
      { type: 'text', text: ' here', match: false },
    ]);
  });
});

describe('chunkText', () => {
  it('groups sentences into passages', () => {
    const chunks = chunkText('One. Two. Three. Four.', 10);
    expect(chunks).toEqual(['One. Two.', 'Three.', 'Four.']);
    expect(chunkText('')).toEqual([]);
  });
  it('buildChunks makes one whole-document vector plus one per paragraph', () => {
    const doc = { ...docs[0], body: 'First paragraph about the lexer and how it turns the source text into a stream of tokens.\n\nSecond paragraph about the parser, which builds a syntax tree from the stream of tokens.' };
    const chunks = buildChunks([doc]);
    expect(chunks[0]).toMatchObject({ doc: 'projects/interp', kind: 'd', text: doc.description });
    expect(chunks[0].embedText).toContain('My Interpreter. A language interpreter in Rust. Rust, WebAssembly');
    expect(chunks[0].embedText).toContain('Second paragraph');
    expect(chunks.slice(1).map((c) => c.kind)).toEqual(['p', 'p']);
    expect(chunks[2]).toMatchObject({ text: doc.body.split('\n\n')[1], embedText: `My Interpreter. ${doc.body.split('\n\n')[1]}` });
  });
});

describe('paragraphs', () => {
  it('splits on blank lines', () => {
    const a = 'A'.repeat(100);
    const b = 'B'.repeat(100);
    expect(paragraphs(`${a}\n\n${b}`)).toEqual([a, b]);
    expect(paragraphs('')).toEqual([]);
  });
  it('joins short blocks such as headings to the paragraph after them', () => {
    const p = 'This paragraph explains how the lexer works in some detail, long enough to stand alone.';
    expect(paragraphs(`How it works\n\n${p}`)).toEqual([`How it works ${p}`]);
  });
  it('keeps a short trailing block with the paragraph before it', () => {
    const p = 'This paragraph explains how the lexer works in some detail, long enough to stand alone.';
    expect(paragraphs(`${p}\n\nThe end.`)).toEqual([`${p} The end.`]);
  });
  it('splits very long paragraphs by sentence', () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const out = paragraphs(long, { max: 300 });
    expect(out.length).toBeGreaterThan(1);
    expect(out.every((p) => p.length <= 300)).toBe(true);
  });
});

describe('embedding models', () => {
  it('uses nomic-embed-text with its search prefixes by default', () => {
    expect(DEFAULT_MODEL).toBe('nomic-ai/nomic-embed-text-v1.5');
    expect(prefixed(DEFAULT_MODEL, 'query', 'rust')).toBe('search_query: rust');
    expect(prefixed(DEFAULT_MODEL, 'document', 'rust')).toBe('search_document: rust');
    expect(prefixed('Xenova/all-MiniLM-L6-v2', 'query', 'rust')).toBe('rust');
  });
  it('rejects unknown models with a helpful message', () => {
    expect(() => prefixed('nope/model', 'query', 'x')).toThrow(/Unknown embedding model "nope\/model"/);
    expect(Object.keys(EMBED_MODELS)).toContain(DEFAULT_MODEL);
  });
});

describe('ranges and highlighting', () => {
  it('finds every occurrence of every query word', () => {
    expect(termRanges('Rust and rust', 'rust')).toEqual([[0, 3], [9, 12]]);
    expect(termRanges('abc', 'x')).toEqual([]); // single letters are ignored
  });
  it('merges overlapping and adjacent ranges', () => {
    expect(mergeRanges([[5, 7], [0, 2], [3, 4], [10, 12]])).toEqual([[0, 7], [10, 12]]);
  });
  it('drops tiny fuzzy fragments', () => {
    expect(highlightRanges('interpreter', 'interpreter', [[0, 0], [2, 3]])).toEqual([[0, 10]]);
    expect(highlightRanges('interpreters', 'interprete', [[0, 9]])).toEqual([[0, 9]]);
  });
  it('segments', () => {
    expect(segments('hello world', [[0, 4]])).toEqual([{ text: 'hello', match: true }, { text: ' world', match: false }]);
    expect(segments('abc', [])).toEqual([{ text: 'abc', match: false }]);
  });
  it('snippet centres on the first match and shifts ranges', () => {
    const text = `${'a '.repeat(100)}needle ${'b '.repeat(100)}`;
    const s = snippet(text, termRanges(text, 'needle'), 20);
    expect(s.text.startsWith('…')).toBe(true);
    expect(s.text.endsWith('…')).toBe(true);
    const [[a, b]] = s.ranges;
    expect(s.text.slice(a, b + 1)).toBe('needle');
  });
  // Regression: snippets cut formulas in half, leaving a stray "$" that KaTeX could not render.
  it('snippet never cuts a formula in half', () => {
    const text = `${'word '.repeat(30)}$\\frac{a}{b} + \\sqrt{c}$ ${'more '.repeat(30)}`;
    const s = snippet(text, [[150, 152]], 10);
    expect(findMath(s.text)).toHaveLength(1);
    expect((s.text.match(/\$/g) || []).length % 2).toBe(0);
  });
  it('tokenize keeps symbols used in language names', () => {
    expect(tokenize('C++ and C# vs Rust!')).toEqual(['c++', 'and', 'c#', 'vs', 'rust']);
  });
});

describe('keyword search', () => {
  const fuse = createKeywordIndex(docs);
  it('finds documents by title, tag and body and reports matched fields', () => {
    const [top] = keywordSearch(fuse, 'interpreter');
    expect(top.doc.id).toBe('projects/interp');
    expect(Object.keys(top.matches)).toEqual(expect.arrayContaining(['title', 'description']));
    expect(keywordSearch(fuse, 'webassembly')[0].matches).toHaveProperty('tags:1');
    expect(keywordSearch(fuse, 'salt')[0].doc.id).toBe('blog/pasta');
  });
  it('tolerates typos', () => {
    expect(keywordSearch(fuse, 'interpeter')[0].doc.id).toBe('projects/interp');
  });
  it('returns nothing for an empty query', () => {
    expect(keywordSearch(fuse, '   ')).toEqual([]);
  });
});

describe('vectors', () => {
  it('quantize / dequantize round-trips closely', () => {
    const v = [0.5, -0.25, 1, -1, 0];
    const back = dequantize(quantize(v));
    v.forEach((x, i) => expect(back[i]).toBeCloseTo(x, 1));
  });
  it('cosine', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
  it('hashEmbed is normalised and deterministic', () => {
    const a = hashEmbed('rust interpreter');
    expect(Math.hypot(...a)).toBeCloseTo(1);
    expect(hashEmbed('rust interpreter')).toEqual(a);
    expect(cosine(a, hashEmbed('interpreter rust'))).toBeCloseTo(1);
  });
  it('semanticScores keeps the best passage per document', () => {
    const chunks = [
      { doc: 'a', kind: 'p', text: 'one', vec: [1, 0] },
      { doc: 'a', kind: 'p', text: 'two', vec: [0.9, 0.1] },
      { doc: 'b', kind: 'p', text: 'three', vec: [0, 1] },
    ];
    const s = semanticScores([1, 0], chunks);
    expect(s.get('a')).toEqual({ score: 1, chunk: 'one' });
    expect(s.get('b').score).toBeCloseTo(0);
  });
  it('scores a document by its whole-document vector too, but shows its best paragraph', () => {
    const chunks = [
      { doc: 'a', kind: 'd', text: 'summary', vec: [1, 0] },
      { doc: 'a', kind: 'p', text: 'close paragraph', vec: [0.8, 0.6] },
      { doc: 'a', kind: 'p', text: 'far paragraph', vec: [0, 1] },
    ];
    expect(semanticScores([1, 0], chunks).get('a')).toEqual({ score: 1, chunk: 'close paragraph' });
  });
  it('a document with no paragraphs still scores, without a passage', () => {
    expect(semanticScores([1, 0], [{ doc: 'a', kind: 'd', text: 's', vec: [1, 0] }]).get('a')).toEqual({ score: 1, chunk: null });
  });
});

describe('hybrid results', () => {
  const fuse = createKeywordIndex(docs);
  it('keyword only when no vectors', () => {
    const r = mergeResults(keywordSearch(fuse, 'pasta'), null, docs);
    expect(r.map((x) => x.doc.id)).toEqual(['blog/pasta']);
    expect(r[0].semanticOnly).toBe(false);
  });
  it('adds semantic-only matches above the threshold, with the matching passage', () => {
    const sem = new Map([['blog/pasta', { score: 0.2, chunk: 'x' }], ['projects/interp', { score: 0.8, chunk: 'The parser builds a tree.' }]]);
    const r = mergeResults(keywordSearch(fuse, 'syntax tree builder'), sem, docs);
    const interp = r.find((x) => x.doc.id === 'projects/interp');
    expect(interp).toBeTruthy();
    expect(r.find((x) => x.doc.id === 'blog/pasta')).toBeUndefined();
  });
  it('ranks results that match both ways first', () => {
    const sem = new Map([['projects/interp', { score: 0.9, chunk: 'tokens' }], ['blog/pasta', { score: 0.4, chunk: 'water' }]]);
    const r = mergeResults(keywordSearch(fuse, 'rust'), sem, docs);
    expect(r[0].doc.id).toBe('projects/interp');
    expect(r[0].semanticOnly).toBe(false);
    expect(r.find((x) => x.doc.id === 'blog/pasta').semanticOnly).toBe(true);
  });
});

describe('matchedFields', () => {
  const fuse = createKeywordIndex(docs);
  const fields = (q, sem) => matchedFields(mergeResults(keywordSearch(fuse, q), sem ?? null, docs)[0], q);
  it('shows each matching field with the match highlighted', () => {
    const f = fields('rust');
    const desc = f.find((x) => x.key === 'description');
    expect(desc.text.slice(desc.ranges[0][0], desc.ranges[0][1] + 1)).toBe('Rust');
    const tags = f.find((x) => x.key === 'tags');
    expect(tags.items[0]).toEqual({ text: 'Rust', ranges: [[0, 3]] });
  });
  it('shows a content snippet when the body matches', () => {
    const body = fields('tokens').find((x) => x.key === 'body');
    expect(body.label).toBe('Content');
    expect(body.text.slice(body.ranges[0][0], body.ranges[0][1] + 1)).toBe('tokens');
  });
  it('keeps LaTeX intact in content snippets', () => {
    const body = fields('gauss').find((x) => x.key === 'body');
    expect(findMath(body.text)).toHaveLength(1);
  });
  it('shows the related passage for meaning-only matches', () => {
    const sem = new Map([['blog/pasta', { score: 0.9, chunk: 'Boil water, add salt.' }]]);
    const r = mergeResults([], sem, docs);
    const f = matchedFields(r[0], 'italian dinner recipe');
    expect(f.find((x) => x.key === 'passage')).toMatchObject({ label: 'Matching paragraph', text: 'Boil water, add salt.' });
  });
});
