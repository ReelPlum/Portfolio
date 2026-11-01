// Turns a URL into an embed description, or null if it is not embeddable.
// Pure function so it can be unit tested without a markdown pipeline.

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com']);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const VIDEO_EXT = /\.(mp4|webm|mov|ogv)$/i;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function parse(url) {
  try {
    return new URL(String(url).trim());
  } catch {
    return null;
  }
}

/** Parses "1m30s", "90", "90s" into seconds. */
export function parseStart(t) {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || !m[0]) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

export function youtubeId(u) {
  let id = null;
  if (u.hostname === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (u.pathname === '/watch') id = u.searchParams.get('v');
  else {
    const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);
    if (m) id = m[1];
  }
  return id && YT_ID.test(id) ? id : null;
}

export function embedFor(url) {
  const u = parse(url);
  if (!u || !/^https?:$/.test(u.protocol)) return null;

  if (YT_HOSTS.has(u.hostname)) {
    const id = youtubeId(u);
    if (!id) return null;
    const start = parseStart(u.searchParams.get('t') || u.searchParams.get('start'));
    const src = `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`;
    return { provider: 'youtube', id, src };
  }

  if (VIMEO_HOSTS.has(u.hostname)) {
    // vimeo.com/123, vimeo.com/123/abcdef (unlisted hash), player.vimeo.com/video/123, vimeo.com/channels/x/123
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => /^\d+$/.test(p));
    if (idx === -1) return null;
    const id = parts[idx];
    const hash = u.searchParams.get('h') || (parts[idx + 1] && /^[a-f0-9]+$/i.test(parts[idx + 1]) ? parts[idx + 1] : null);
    const src = `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}`;
    return { provider: 'vimeo', id, src };
  }

  if (VIDEO_EXT.test(u.pathname)) return { provider: 'video', src: u.href };
  return null;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function embedHtml(embed, title = '') {
  if (!embed) return '';
  if (embed.provider === 'video') {
    return `<figure class="embed embed-video"><video src="${esc(embed.src)}" controls playsinline preload="metadata"></video></figure>`;
  }
  const label = title || (embed.provider === 'youtube' ? 'YouTube video' : 'Vimeo video');
  return `<figure class="embed embed-${embed.provider}"><iframe src="${esc(embed.src)}" title="${esc(label)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></figure>`;
}
