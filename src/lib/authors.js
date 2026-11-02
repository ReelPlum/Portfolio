// Authors of posts and projects. Kept free of astro imports so it can be unit tested.

/** The author ids of an entry, defaulting to the site's own author. */
export const authorIds = (entry, defaultAuthor) => (entry.data.authors?.length ? entry.data.authors : [defaultAuthor]);

/** A guest post is one the site's own author didn't write (or co-write). */
export const isGuest = (entry, defaultAuthor) => !authorIds(entry, defaultAuthor).includes(defaultAuthor);

/** Throws when an entry names an author that isn't in authors.yaml. */
export function checkAuthors(entries, known, defaultAuthor) {
  if (!known.has(defaultAuthor)) throw new Error(`defaultAuthor "${defaultAuthor}" (site.config.js) is not in authors.yaml`);
  for (const e of entries) {
    for (const id of authorIds(e, defaultAuthor)) {
      if (!known.has(id)) throw new Error(`Unknown author "${id}" in ${e.collection}/${e.id}. Add them to authors.yaml (known: ${[...known.keys()].join(', ')})`);
    }
  }
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
