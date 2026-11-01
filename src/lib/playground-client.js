// Browser-safe twin of demoExamples() in demo.js (that file imports node:fs).
export function demoExamplesClient(demo) {
  const list = [...(demo?.examples || [])];
  if (demo?.example && !list.some((e) => e.code === demo.example)) list.unshift({ name: 'Example', code: demo.example });
  return list;
}
