// Plain share links: no third-party scripts, nothing loads until someone clicks.
export function shareLinks({ url, title }) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  return [
    { id: 'linkedin', label: 'LinkedIn', icon: 'linkedin', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { id: 'x', label: 'X', icon: 'x', href: `https://x.com/intent/post?text=${t}&url=${u}` },
    { id: 'bluesky', label: 'Bluesky', icon: 'bluesky', href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${url}`)}` },
  ];
}
