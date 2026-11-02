// Tiny helper: an HTML string as hast nodes (a single "raw" node, which rehype-raw / stringify keep).
export const fromHtml = (html) => [{ type: 'raw', value: html }];
