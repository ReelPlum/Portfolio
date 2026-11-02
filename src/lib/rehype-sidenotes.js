// Footnotes double as Tufte-style sidenotes. Each footnote reference gets a copy of its note right after
// it; CSS floats that copy into the margin when the post column has room (a container query) and hides
// the footnote list at the bottom. On narrower screens the copies stay hidden and the normal footnotes
// at the end of the post are used, so nothing is lost without the margin.

const isEl = (n, tag) => n?.type === 'element' && (!tag || n.tagName === tag);
const has = (n, prop) => n.properties && n.properties[prop] !== undefined;

function find(node, test, out = []) {
  if (test(node)) out.push(node);
  for (const c of node.children || []) find(c, test, out);
  return out;
}

const clone = (n) => JSON.parse(JSON.stringify(n));

/** The footnote's content as inline nodes: paragraphs become spans and back links are dropped. */
function inlineContent(li) {
  const strip = (n) => {
    if (!n.children) return n;
    n.children = n.children.filter((c) => !(isEl(c, 'a') && has(c, 'dataFootnoteBackref'))).map(strip);
    return n;
  };
  return clone(li).children.filter((c) => !(c.type === 'text' && !c.value.trim())).map((c) => {
    const s = strip(c);
    if (isEl(s, 'p')) return { type: 'element', tagName: 'span', properties: { className: ['sidenote-p'] }, children: s.children };
    return s;
  });
}

export function rehypeSidenotes() {
  return (tree) => {
    const section = find(tree, (n) => isEl(n, 'section') && has(n, 'dataFootnotes'))[0];
    if (!section) return;
    const notes = new Map(find(section, (n) => isEl(n, 'li') && typeof n.properties?.id === 'string').map((li) => [li.properties.id, li]));
    const parents = find(tree, (n) => (n.children || []).some((c) => isEl(c, 'sup') && find(c, (x) => isEl(x, 'a') && has(x, 'dataFootnoteRef')).length));
    for (const parent of parents) {
      for (let i = 0; i < parent.children.length; i++) {
        const sup = parent.children[i];
        const ref = isEl(sup, 'sup') && find(sup, (x) => isEl(x, 'a') && has(x, 'dataFootnoteRef'))[0];
        if (!ref) continue;
        const id = String(ref.properties.href || '').replace(/^#/, '');
        const li = notes.get(id);
        if (!li) continue;
        const num = find(ref, (x) => x.type === 'text').map((t) => t.value).join('');
        parent.children.splice(i + 1, 0, {
          type: 'element', tagName: 'span',
          properties: { className: ['sidenote'], role: 'note', ariaLabel: `Note ${num}` },
          children: [{ type: 'element', tagName: 'span', properties: { className: ['sidenote-num'], ariaHidden: 'true' }, children: [{ type: 'text', value: num }] }, { type: 'text', value: ' ' }, ...inlineContent(li)],
        });
        i += 1;
      }
    }
    section.properties.className = [...(section.properties.className || []), 'has-sidenotes'];
  };
}
