// Everything you are likely to want to change about the site lives here.
export default {
  url: 'https://reelplum.github.io',
  // Served from https://reelplum.github.io/Portfolio/ while the repo is called "Portfolio".
  // Rename the repo to reelplum.github.io and set this to '/'.
  base: '/Portfolio/',
  // Link to this website's own source code (shown in the footer)
  source: 'https://github.com/ReelPlum/Portfolio',
  title: 'Frederik',
  author: 'Frederik',
  tagline: 'I build interpreters, tools and things for the web.',
  description: 'Projects, writing and experiments by Frederik.',
  email: 'hello@example.com', // TODO: your address. Shown on the contact page as a mailto: link
  social: [
    { label: 'GitHub', href: 'https://github.com/ReelPlum', icon: 'github' },
    // TODO: your LinkedIn profile URL
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/your-profile/', icon: 'linkedin' },
  ],
  // Projects and blog posts are both just posts (.md files in src/content/posts/). Their tags decide where they show up.
  tags: {
    // Tags that get their own page. Each page lists the posts that have any of its `tags`
    // (leave `tags` out to list every post; `exclude` leaves posts with those tags out).
    // A post's address is under the first page it is on: /projects/interpreter/. Posts on no page live at /posts/<name>/.
    //   layout: 'cards' (tiles with the cover image), 'list' (rows) or 'large' (one big tile each)
    //   sort:   'date' (newest first) or 'featured' (featured: true first, then `order`, then newest)
    //   icon:   Material Symbols icon for the page's posts in lists and search; name: what search calls one of them
    pages: [
      { path: 'projects', title: 'Projects', description: 'Things I have built, some of which you can try right here.', tags: ['project'], layout: 'cards', sort: 'featured', icon: 'code', name: 'Project' },
      { path: 'blog', title: 'Blog', description: 'Notes on building things.', tags: ['blog'], layout: 'list', icon: 'article', name: 'Post' },
    ],
    // The feeds on the home page, top to bottom. Same filters and layouts as pages, plus:
    //   limit: how many posts to show; featured: true only shows posts with `featured: true`;
    //   link: where "See all" goes. A post already shown higher up is skipped unless the section says repeat: true.
    home: [
      { title: 'Featured', tags: ['project'], featured: true, limit: 1, layout: 'large' },
      { title: 'Projects', tags: ['project'], sort: 'featured', limit: 4, layout: 'cards', link: '/projects/' },
      { title: 'Latest writing', tags: ['blog'], limit: 4, layout: 'list', link: '/blog/' },
    ],
    // Give every tag a page at /tags/<tag>/ (plus a list of all tags at /tags/) and make tags clickable.
    tagPages: true,
  },
  nav: [
    { label: 'Projects', href: '/projects/' },
    { label: 'Blog', href: '/blog/' },
    { label: 'About', href: '/about/' },
    { label: 'Contact', href: '/contact/' },
  ],
};
