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
  // The id in src/content/authors.yaml of the person the site belongs to. Posts by anyone else are guest posts.
  defaultAuthor: 'frederik',
  // Privacy-friendly visitor counts with GoatCounter (https://www.goatcounter.com): set your site code, e.g.
  // 'frederik' for frederik.goatcounter.com. Left empty, no analytics script is added.
  goatcounter: '',
  tagline: 'I build interpreters, tools and things for the web.',
  description: 'Projects, writing and experiments by Frederik.',
  email: 'hello@example.com', // TODO: your address. Shown on the contact page as a mailto: link
  social: [
    { label: 'GitHub', href: 'https://github.com/ReelPlum', icon: 'github' },
    // TODO: your LinkedIn profile URL
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/your-profile/', icon: 'linkedin' },
  ],
  nav: [
    { label: 'Projects', href: '/projects/' },
    { label: 'Blog', href: '/blog/' },
    { label: 'About', href: '/about/' },
    { label: 'CV', href: '/cv/' },
    { label: 'Contact', href: '/contact/' },
  ],
};
