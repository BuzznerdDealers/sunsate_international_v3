/**
 * A stand-in for the source website, for testing the migration offline.
 *
 * This is NOT the client's content. It is a synthetic WordPress + Divi site
 * that reproduces the *shapes* the migration has to cope with — paged archive,
 * themed post pages wrapped in header/nav/footer/share/related/comments/cookie
 * banner/tracking, lazy-loaded images, a REST API, a sitemap, robots.txt — so
 * the extractor can be exercised without touching anyone's live site.
 *
 * The post titles, dates, categories and slugs mirror the real archive so the
 * URLs and the dedupe behaviour are realistic. Every body paragraph is filler
 * written for this fixture and is clearly marked as such.
 *
 *   node tools/blog-import/fixtures/source-site.mjs --port 8099
 */

import { createServer } from 'node:http';

export const POSTS = [
  { slug: 'when-to-schedule-semi-truck-alignment-near-me', title: 'When to Schedule Semi Truck Alignment Near Me', date: '2026-07-30', category: 'Service', image: 'fleet-alignment-service' },
  { slug: 'why-visit-your-local-international-truck-service-department', title: 'Why Visit Your Local International Truck Service Department', date: '2026-07-15', category: 'Service', image: 'sun-state-service-team-2' },
  { slug: 'how-electrical-diagnostic-tools-prevent-breakdowns', title: 'How Electrical Diagnostic Tools Prevent Breakdowns', date: '2026-07-13', category: 'Diagnostics', image: 'truck-electrical-testing' },
  { slug: 'why-sun-state-is-one-of-the-top-fleet-service-providers', title: 'Why Sun State is One of the Top Fleet Service Providers', date: '2026-07-05', category: 'Fleet', image: 'commercial-truck-service' },
  { slug: 'signs-you-need-to-replace-your-semi-truck-suspension-parts', title: 'Signs You Need to Replace Your Semi Truck Suspension Parts', date: '2026-06-29', category: 'Parts', image: 'fleet-maintenance-inspection' },
  { slug: 'common-problems-with-air-brake-parts-for-semi-trucks', title: 'Common Problems With Air Brake Parts for Semi Trucks', date: '2026-06-25', category: 'Parts', image: 'air-brake-parts-truck' },
  { slug: 'what-to-expect-from-an-international-truck-service-center', title: 'What to Expect From an International Truck Service Center', date: '2026-06-19', category: 'Service', image: 'truck-engine-diagnostics' },
  { slug: 'commercial-truck-oil-change-mistakes-that-cost-you', title: 'Commercial Truck Oil Change Mistakes That Cost You', date: '2026-06-14', category: 'Maintenance', image: 'commercial-truck-oil-change' },
  { slug: 'why-fuel-filter-pressure-in-your-semi-truck-matters', title: 'Why Fuel Filter Pressure In Your Semi Truck Matters', date: '2026-06-09', category: 'Maintenance', image: 'semi-truck-maintenance-inspection' },
  { slug: 'how-to-read-a-dot-inspection-report', title: 'How to Read a DOT Inspection Report', date: '2026-05-28', category: 'Fleet', image: 'dot-inspection-report' },
  { slug: 'choosing-tires-for-mixed-service-work', title: 'Choosing Tires for Mixed Service Work', date: '2026-05-19', category: 'Parts', image: 'mixed-service-tires' },
  { slug: 'what-a-pm-service-actually-covers', title: 'What a PM Service Actually Covers', date: '2026-05-06', category: 'Maintenance', image: 'pm-service-bay' },
];

const PER_PAGE = 9;
const FILLER = 'This paragraph is fixture text written for the migration test harness. It stands in for the published article body so the extractor has realistic prose to work with.';

/** A themed post body: the article, plus everything the theme wraps round it. */
function postBody(post, index) {
  const withTable = index === 2;
  const withList = index !== 1;
  return `
<div class="et_pb_post_content entry-content" itemprop="articleBody">
  <p>${FILLER} It opens the piece on <strong>${post.title.toLowerCase()}</strong> and sets out why the topic matters to an <em>owner-operator</em> as much as to a fleet manager.</p>
  <p>A second paragraph continues the fixture text, and carries <a href="/parts/">an internal link to the parts department</a> as well as <a href="https://example.org/fmcsa-reference">an external reference</a>.</p>
  <h2>What to look for</h2>
  <p>${FILLER}</p>
  ${withList ? `<ul>
    <li>A first checklist item, with <strong>emphasis</strong> inside it.</li>
    <li>A second checklist item.</li>
    <li>A third checklist item that runs on a little longer so the list has an uneven shape.</li>
  </ul>` : ''}
  <figure class="wp-block-image size-large">
    <img src="/wp-content/uploads/2026/07/${post.image}-1024x640.jpg"
         data-src="/wp-content/uploads/2026/07/${post.image}-1024x640.jpg"
         class="wp-image-4821 lazyload" alt="${post.title}" width="1024" height="640" loading="lazy">
    <figcaption>A caption the article carries under the photograph.</figcaption>
  </figure>
  <h3>How the shop approaches it</h3>
  <p>${FILLER}</p>
  ${withTable ? `<table class="wp-block-table"><thead><tr><th scope="col">Interval</th><th scope="col">Check</th></tr></thead><tbody><tr><td>Every 15,000 miles</td><td>Full inspection</td></tr><tr><td>Every 45,000 miles</td><td>Replace</td></tr></tbody></table>` : ''}
  <ol>
    <li>Book the unit in.</li>
    <li>Approve the estimate.</li>
  </ol>
  <p>${FILLER} It closes the article.</p>
</div>`;
}

/** The full themed page: chrome the migration is expected to remove. */
function postPage(post, index, origin) {
  const url = `${origin}/${post.slug}/`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: post.title,
        datePublished: `${post.date}T09:00:00-04:00`,
        dateModified: `${post.date}T09:00:00-04:00`,
        url,
        articleSection: post.category,
        image: `${origin}/wp-content/uploads/2026/07/${post.image}-1024x640.jpg`,
        author: { '@type': 'Organization', name: 'Sun State International Trucks, LLC.' },
      },
    ],
  };
  return `<!DOCTYPE html>
<html lang="en-US" class="js">
<head>
<meta charset="UTF-8">
<title>${post.title} | Sun State International Trucks</title>
<meta name="description" content="${post.title} — guidance from the Sun State ${post.category.toLowerCase()} team in Tampa, Sarasota and Davenport, Florida.">
<meta property="og:title" content="${post.title}">
<meta property="og:description" content="${post.title} — guidance from the Sun State team.">
<meta property="og:image" content="${origin}/wp-content/uploads/2026/07/${post.image}-1024x640.jpg">
<meta property="article:published_time" content="${post.date}T09:00:00-04:00">
<meta property="article:section" content="${post.category}">
<link rel="canonical" href="${url}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}</script>
<style>.et_pb_post_content{margin:0}</style>
</head>
<body class="post-template-default single single-post category-${post.category.toLowerCase()} et_divi_theme">
<div id="cookie-consent-banner" class="cookie-banner"><p>We use cookies.</p><button>Accept</button></div>
<header id="main-header" class="et-l et_pb_header">
  <nav id="top-menu" class="et-menu-nav"><ul><li><a href="/">Home</a></li><li><a href="/blogs/">Blog</a></li><li><a href="/parts/">Parts</a></li></ul></nav>
  <div class="et_pb_header_social">Follow us</div>
</header>
<div id="main-content">
<article id="post-${1000 + index}" class="et_pb_post post type-post">
  <div class="et_post_meta_wrapper">
    <h1 class="entry-title">${post.title}</h1>
    <p class="post-meta">by <a href="/author/sunstate/" rel="author">Sun State Team</a> |
      <time class="published" datetime="${post.date}T09:00:00-04:00">${post.date}</time> |
      <a href="/category/${post.category.toLowerCase()}/">${post.category}</a></p>
  </div>
  ${postBody(post, index)}
  <div class="addtoany_share_save_container"><span>Share this</span><a href="#">Facebook</a></div>
  <div class="et_pb_widget dealer-inventory-widget"><h4>Browse our inventory</h4><a href="/inventory/">See trucks</a></div>
  <section class="related-posts"><h3>Related posts</h3><ul><li><a href="/some-other-post/">Some other post</a></li></ul></section>
  <div id="comments" class="comments-area"><h3>0 Comments</h3><form id="commentform"><textarea></textarea></form></div>
</article>
<aside id="sidebar" class="widget-area"><div class="widget"><h4>Categories</h4><a href="/category/parts/">Parts</a></div></aside>
</div>
<footer id="main-footer"><div class="footer-widgets"><a href="/contact-us/">Contact us</a></div><p>© 2026 Sun State</p></footer>
<img src="https://www.facebook.com/tr?id=123&ev=PageView" height="1" width="1" alt="">
<script src="/wp-includes/js/jquery.min.js"></script>
</body></html>`;
}

function archivePage(pageNum, origin) {
  const start = (pageNum - 1) * PER_PAGE;
  const slice = POSTS.slice(start, start + PER_PAGE);
  const hasNext = start + PER_PAGE < POSTS.length;
  const cards = slice
    .map(
      (p) => `<article class="et_pb_post"><a class="entry-featured-image-url" href="${origin}/${p.slug}/">
        <img src="/wp-content/uploads/2026/07/${p.image}-400x250.jpg" alt="${p.title}"></a>
      <h2 class="entry-title"><a href="${origin}/${p.slug}/">${p.title}</a></h2>
      <p class="post-meta"><a href="/category/${p.category.toLowerCase()}/">${p.category}</a> | ${p.date}</p></article>`,
    )
    .join('\n');
  return `<!DOCTYPE html><html lang="en-US"><head><meta charset="UTF-8">
<title>Blog | Sun State International Trucks</title>
<link rel="canonical" href="${origin}/blogs/${pageNum > 1 ? `page/${pageNum}/` : ''}">
</head><body class="archive blog">
<header id="main-header"><nav id="top-menu"><a href="/">Home</a></nav></header>
<div id="main-content">${cards}
<div class="pagination clearfix">${
    hasNext
      ? `<div class="alignleft"><a href="${origin}/blogs/page/${pageNum + 1}/?et_blog" >« Older Entries</a></div>`
      : ''
  }${pageNum > 1 ? `<div class="alignright"><a href="${origin}/blogs/${pageNum > 2 ? `page/${pageNum - 1}/` : ''}?et_blog">Next Entries »</a></div>` : ''}</div>
</div>
<footer id="main-footer"><a href="/contact-us/">Contact</a></footer>
</body></html>`;
}

/** A 1x1 PNG, standing in for every photograph on the fixture site. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export function createFixtureServer({ restApi = true, brokenImages = [] } = {}) {
  return createServer((req, res) => {
    const origin = `http://${req.headers.host}`;
    const url = new URL(req.url, origin);
    const path = url.pathname;
    const send = (status, type, body) => {
      res.writeHead(status, { 'content-type': type });
      res.end(body);
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'read-only');

    if (path === '/robots.txt') {
      return send(200, 'text/plain', 'User-agent: *\nDisallow: /wp-admin/\nAllow: /\n');
    }

    if (path === '/wp-sitemap.xml') {
      return send(
        200,
        'application/xml',
        `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>${origin}/wp-sitemap-posts-post-1.xml</loc></sitemap></sitemapindex>`,
      );
    }
    if (path === '/wp-sitemap-posts-post-1.xml') {
      return send(
        200,
        'application/xml',
        `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${POSTS.map(
          (p) => `<url><loc>${origin}/${p.slug}/</loc></url>`,
        ).join('')}</urlset>`,
      );
    }

    if (path === '/wp-json/wp/v2/posts') {
      if (!restApi) return send(404, 'application/json', '{"code":"rest_no_route"}');
      const page = Number(url.searchParams.get('page') || 1);
      const perPage = Number(url.searchParams.get('per_page') || 10);
      const slice = POSTS.slice((page - 1) * perPage, page * perPage);
      if (!slice.length) return send(400, 'application/json', '{"code":"rest_post_invalid_page_number"}');
      return send(
        200,
        'application/json',
        JSON.stringify(
          slice.map((p, i) => ({
            id: 1000 + i,
            date: `${p.date}T09:00:00`,
            date_gmt: `${p.date}T13:00:00`,
            slug: p.slug,
            link: `${origin}/${p.slug}/`,
            title: { rendered: p.title },
            content: { rendered: postBody(p, POSTS.indexOf(p)) },
            excerpt: { rendered: `<p>${FILLER}</p>` },
            _embedded: {
              author: [{ name: 'Sun State Team' }],
              'wp:term': [[{ taxonomy: 'category', name: p.category }]],
            },
          })),
        ),
      );
    }

    if (path === '/blogs/' || path === '/blogs') return send(200, 'text/html', archivePage(1, origin));
    const paged = path.match(/^\/blogs\/page\/(\d+)\/?$/);
    if (paged) {
      const page = Number(paged[1]);
      if (page > Math.ceil(POSTS.length / PER_PAGE)) return send(404, 'text/html', 'Not found');
      return send(200, 'text/html', archivePage(page, origin));
    }

    if (path.startsWith('/wp-content/uploads/')) {
      if (brokenImages.some((frag) => path.includes(frag))) return send(404, 'text/plain', 'gone');
      return send(200, 'image/jpeg', PNG);
    }

    const slug = path.replace(/^\/+|\/+$/g, '');
    const index = POSTS.findIndex((p) => p.slug === slug);
    if (index !== -1) return send(200, 'text/html', postPage(POSTS[index], index, origin));

    return send(404, 'text/html', '<html><body>Not found</body></html>');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const portArg = process.argv.indexOf('--port');
  const port = portArg === -1 ? 8099 : Number(process.argv[portArg + 1]);
  const noRest = process.argv.includes('--no-rest');
  createFixtureServer({ restApi: !noRest }).listen(port, () => {
    process.stdout.write(`fixture source site on http://localhost:${port}/blogs/\n`);
  });
}
