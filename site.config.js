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
  nav: [
    { label: 'Projects', href: '/projects/' },
    { label: 'Blog', href: '/blog/' },
    { label: 'About', href: '/about/' },
    { label: 'Contact', href: '/contact/' },
  ],
};
