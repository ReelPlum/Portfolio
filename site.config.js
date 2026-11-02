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
  // Product reviews (```product blocks in posts). See "Product reviews" in README.md.
  affiliates: {
    // Shown under every list of stores. Most countries require you to say that links are affiliate links.
    disclosure: 'Some of these are affiliate links: if you buy something, I may earn a small commission at no extra cost to you.',
    // Your Amazon Associates tracking ID for each Amazon store you've joined, used by offers that say
    // `amazon: de` etc. Stores without one link to the product without a tracking ID.
    amazon: {
      // de: 'yourtag-21',
      // 'co.uk': 'yourtag-21',
      // com: 'yourtag-20',
    },
  },
  nav: [
    { label: 'Projects', href: '/projects/' },
    { label: 'Blog', href: '/blog/' },
    { label: 'About', href: '/about/' },
    { label: 'Contact', href: '/contact/' },
  ],
};
