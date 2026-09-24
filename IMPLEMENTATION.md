# Sun State International — design handoff implementation notes

The `SS_International_2` handoff (33 pages, one token layer, one behaviour file) built into
this repo's `site/` tree. This file records the translation decisions: what maps to what,
what the node model could not express, and what the dealer still has to supply.

---

## 1. The design system

`css/tokens.css` → `site/tokens.json`.

| Handoff | `site/tokens.json` |
|---|---|
| `--color-accent: #EE2D24` | `colors.accent` |
| `--color-accent-hover: #c9241c` | `colors.accentDark` |
| `--color-ink: #242424` | `colors.ink` — body text and the contact band |
| `--color-chrome: #141414` | `colors.inkDark`, and `--chrome` in `site/custom-code.json` — header, footer, type rail, legal hero |
| `--color-body-text: #3f3f3f` | `--body-text` in `site/custom-code.json` |
| `--color-paper: #F4F4F4` | `colors.paper` |
| `--color-card: #FFFFFF` | `colors.card` |
| `--color-line: #DCDCDC` | `colors.line` |
| `--color-muted: #6C6C6C` | `colors.muted` |
| `--color-success / --color-warning` | `status.ok` / `status.warn` |
| `--text-hero: 64px` … `--text-micro: 11px` | `type.h1`–`type.eyebrow` (six steps, so the 14-step scale is compressed) |
| `--rad: 0` | every `radius.*` except `chip` |
| `--container: 1280px`, `--gutter: 48px` | `layout.container`, `layout.padDesktop` (32 tablet, 20 mobile) |

**Fonts.** The twelve licensed INTL Headline / INTL Text `.woff2` files ship in
`public/fonts/` and are declared in `tokens.fonts.files`, so the build emits the
`@font-face` rules and preloads the display faces. INTL Headline is an all-caps face — the
uppercase headings are the font, not a `text-transform`.

Everything the tokens cannot express — the 48px page gutter, the 90px section rhythm, the
hard-edged buttons and inputs, the explicit text colours on dark chrome — is in
`site/custom-code.json`, scoped to platform block classes. Several rules there fix platform
behaviour rather than style it, and each is flagged in §5.

Two numbers in the handoff's token file are not the numbers it draws with, so the measured
values are used: `--text-h2` says 38px but 76 of its 227 headings are 34px and only five
are 38 (the home page's bands), and `--section-y` says 120px but 68 of its sections are
90px, 34 are 80 and 34 are 100 — 120 appears nowhere. Headings also inherit the 1.6 body
leading rather than a heading leading, which is what makes a wrapped band heading sit as
loosely as it does.

---

## 2. Information architecture

Routes follow `combined-ia-sitemap.html`, not the legacy canonical URLs in each page's
`<head>`. `combined-ia-sitemap.html` is itself reference, not a route, and is not built.

| Handoff page | Route |
|---|---|
| `home` | `/` |
| `our-story` | `/about-us` |
| `meet-the-team`, `careers`, `reviews`, `community-involvement` | `/meet-the-team`, `/careers`, `/reviews`, `/community-involvement` |
| `news-and-press`, `videos` | `/news`, `/videos` |
| `inventory`, `capacity-yard-trucks`, `truck-configurator`, `deal-of-the-week` | same names |
| `brochures-and-s13-powertrain` | `/specifications` |
| `parts`, `aftermarket` | `/parts`, `/aftermarket` |
| `service`, `service-appointment`, `extended-service`, `mobile-service` | same names |
| `financing` | `/financing` |
| `locations` + the six detail pages | `/locations`, `/locations/tampa` … `/locations/aftermarket-parts` |
| `contact-us` | `/contact` |
| `policies`, `privacy-policy`, `terms-and-conditions` | `/legal/policies`, `/legal/privacy`, `/legal/terms` |
| `blog` | `/blog` — the platform's Posts feature, see §4 |
| `locations-map.html` | dropped; it is the map iframe, replaced by the `locations-map` widget |
| `combined-ia-sitemap.html` | dropped, per the handoff's own build note 7 |

Every internal link is a page slug or a storefront route, never a typed path: the menus in
`site/menus.json` use `type: "page"` + slug, and every inventory destination is
`type: "inventory"` with the route and its facets (`inventory?type=truck&condition=new`).
The handoff's links into `sunstateintltrucks.com` and `sunstatetrailers.com` were repointed
at the platform storefront, which is the point of the merge the IA describes.

---

## 3. Chrome, components and libraries

**`site/templates/default.json`** (condition `entireSite`) carries the utility bar, the
header and the legal strip, and places the footer as a component. Built once, not per page.

**Menus** (`site/menus.json`) — `main` is a three-level menu drawn with `layout: "mega"`:
trigger → column heading (`type: "label"`) → links. Nothing is scripted. Plus `utility`,
`hero-brands`, three footer columns, `legal`, and the in-page jump lists for the team,
brochure, parts and legal pages.

**Designed components** (`site/sections/`, Components → Designed):

| Component | Used for |
|---|---|
| `site-footer` | The footer band: brand column plus a repeated link column per menu |
| `cta-band` | The closing "Ready to get on the road?" band on 25 pages |
| `feature-grid` | The eyebrow/title/body/link card grid — the workhorse, ~30 placements |
| `photo-card-grid` | The same with a photo and a spec list (inventory categories, TJ models, coverage plans) |
| `media-band` | Copy beside a photograph |
| `bullet-grid` | Cards whose body is a bullet list (careers benefits, aftermarket capabilities) |
| `service-rows` | The numbered service rows on the home page and the configurator |
| `location-grid` | The six-up location cards |
| `location-summary` | A location page's address, phone lines, notice and map |
| `hours-grid` | Department hours tables |
| `type-rail` | The home page vehicle-type carousel |
| `staff-departments` | The team page's six department bands |

**Coded widgets** (`site/widgets/`, Components → Coded): `social-links` (the icon row) and
`doc-group` (a series' brochures and spec sheets).

**Forms** (`site/forms/`): `contact-us` and `service-appointment` are real form definitions
with conditional logic, consent text and role-based lead routing — not markup. The
template's three system forms (`request-info`, `request-a-quote`, `check-availability`) are
kept.

**Buttons** (`site/buttons.json`): 37 CTAs. Component-level buttons take a label and a URL
as props, because a `ctaId` cannot be bound through a component placement (§5).

**Platform data, not typed-out lists:** `inventory-search` and `inventory-carousel` on the
home and inventory pages, `locations-map` on home, locations and contact, `staff` per
department on the team page, and `faq` for all 132 accordion instances in the handoff — the
FAQ widget renders native `<details>`, needs no script, and emits `FAQPage` JSON-LD.

---

## 4. What is not a like-for-like copy

Everything below was measured against the handoff at 1440px rather than eyeballed: both
trees were rendered and their bounding boxes compared band by band. Every page is now
within a few dozen pixels of the handoff except where this section says otherwise.

- **Live platform data replaces the handoff's hardcoded arrays**, which is the one place
  the built site is deliberately *better* than the prototype and therefore does not match
  it pixel for pixel until the channel is connected:
  - `/meet-the-team` draws its 38 people from the `staff` widget. The handoff lists them in
    the page; the widget renders them from the dealer's channel, so that band is ~2,300px
    shorter in the static build and the right height once the roster is imported.
  - The home page's featured listings come from `inventory-carousel`, not four typed-out
    cards.
  - The locations map, location cards and department phone numbers come from the
    `locations-map` widget on home, locations and contact.
- **The blog.** The handoff's blog landing (topic chips, featured post) is the platform's
  Posts feature: nine real records under `site/blog/posts/`, so `postsList` and the blog
  index resolve them. Only the excerpt was available, so each post carries its excerpt, a
  link to the original article, and an editor's note where the migrated body goes.
- **The home hero's two-select finder** (Type / Category) is the platform's
  `inventory-search` widget, which searches the real catalogue instead of filtering a typed
  list. It is one text field and a button rather than two dropdowns.
- **The truck-type coverflow** keeps the handoff's staging (a script sets `data-pos`, the
  CSS places and scales the cards) because no behaviour expresses a coverflow; the
  un-staged state is a real in-flow rail, which is what the Design canvas and the first
  paint show. Arrows and a phone-width scroll rail are built in.
- **The inventory page** carried a live-inventory carousel and a search box the handoff does
  not draw; both were removed so the page runs in the handoff's order. Putting either back
  is one placement.
- **Question bands are accordions.** The handoff draws 24 of its 28 question bands as
  accordions and opens the first answer; the platform `faq` widget has no way to mark an
  item open, so ours open closed — about 75px shorter per band. The four bands the handoff
  does *not* draw as accordions (meet-the-team, careers, videos, inventory) are built the
  way it draws them: card grids and an open ruled list.
- **Location and department hours** come from the `hours` and `phone-numbers` widgets,
  keyed by `locationSlug`. The page still carries editorial chrome (hero copy, on-site
  department blurbs, FAQ answers). Cards and tables stay empty until Admin → Locations
  has a row whose slug matches the page (`tampa`, `davenport`, `sarasota`, `brooksville`,
  `trailer-sales`, `aftermarket-parts`).
- **Videos and the truck configurator** ship as real links, upgraded to embeds by a page
  script — see §5.
- **The header's phone number** is one number in the template; the handoff varies it per
  page. A template cannot, and a per-page header would mean a template per page.
- **The department directory, press coverage and community partner logos** use remote image
  URLs from `sunstateintl.com`. Re-upload those through the media library before launch.

---

## 5. Platform gaps found while building this

1. **A component prop with a non-empty default cannot be turned off by a placement.**
   `componentValues` treats an empty string as "not supplied" and falls back to the
   declared default, so a placement that wants no band heading gets the component's own.
   The locations page printed "Find a location" over its own band heading until
   `location-grid`'s defaults were emptied. A placement needs a way to say "none".
2. **`blocks.css` sets type on `.bz-block p` / `.bz-block h3`, which outranks every
   single-class rule the renderer itself ships.** `.bz-eyebrow`, `.bz-hero__sub` and
   `.bz-feature__t` are all (0,1,0) against (0,1,1), so a dealer stylesheet that follows
   the obvious pattern silently loses. Every eyebrow on this site rendered at 16px instead
   of 11px until the rules were given a second class.
3. **A `buttons` block allows at most three items.** A location card in this handoff
   carries three phone numbers, a "view location" link and a directions link, so it is
   built as two adjacent `buttons` blocks.
4. **A component's `list` prop cannot contain a list.** `normaliseProp` forces a list field
   whose type is `list` back to `text`. Anything shaped as a list of lists — the eight
   brochure groups on `/specifications`, each with its own documents — has to be written
   out one placement per group, which is what `npm run validate` then reports as a repeated
   shape. That note is this limitation, not an oversight.
5. **`ctaId` cannot be bound through a component.** `scripts/validate.mjs` resolves
   `props.items[].ctaId` against `site/buttons.json` before any placement binds, so
   `"{{primaryCta}}"` fails as a dangling id. Components here take `label` + `url` props
   instead, which puts those buttons outside the CTA library. It also means an optional
   button renders as an empty anchor when a placement leaves it out; one rule in
   `site/custom-code.json` hides them.
6. **A stacked row keeps twelve tracks and eleven gaps.** `blocks.css` stacks a row by
   setting `grid-column: 1 / -1` on its columns but leaves `grid-template-columns:
   repeat(12, …)` in place. At this site's 48px gap and 20px mobile gutter that is 528px of
   gap inside a 350px container, so every stacked row ran off the side of a phone. The
   collapse rule is in `site/custom-code.json`; the same arithmetic bites any site whose
   row gap exceeds about a twelfth of the mobile content width.
7. **An image block cannot fill its node.** The block renders
   `.bz-block--image > .bz-container > figure > img`; a `height: 100%` on the figure
   resolves against the container, which has no height, so a photo meant to cover a band
   keeps its intrinsic ratio. One rule in `site/custom-code.json` carries the height down
   the chain; it is inert wherever the block is auto-height.
8. **No iframe block.** `<iframe>` is stripped from both coded widgets and `customHtml`, so
   the video library and the navconfig.com configurator ship as real links and are upgraded
   to embeds by `site/pages/videos/script.js` and
   `site/pages/truck-configurator/script.js`. The un-enhanced state is a working link,
   which is what the canvas draws and what a visitor without scripts gets.
9. **`columns` is a reserved component prop key** (`renderer/custom-widgets.mjs`), so the
   footer's three link columns bound to nothing and rendered empty until the prop was
   renamed. The parser should refuse a reserved key rather than drop it silently.
10. **The `faq` widget cannot mark an item open**, which is how the handoff draws every one
    of its accordions — see §4.

A note on the `filter` behaviour, which an earlier draft of this file reported as
unbuildable: it **is** buildable. `parts()` in `renderer/client/widgets.js` collects
`[data-bz-part~="…"]` anywhere under the behaviour root, so a coded widget's own markup can
carry `data-bz-part="item"` together with its `data-<facet>` attributes. The home page's
brand and perk filters are built that way, with the behaviour declared on the section and
nothing scripted.

No `customHtml` block is used anywhere in this site.

---

## 6. What the dealer still has to supply

- **Photography.** Every photograph in the handoff is a slot; each one here is a real
  `image` block or a background layer pointing at `/img/photo-placeholder.svg`, with the
  handoff's shot brief as its `alt` text. Searching the repo for `photo-placeholder` gives
  the complete shot list. `public/img/` currently holds the logo, brand lockup, one staff
  photo (`team-tony-martell.png`) and the placeholder.
- **Locations module.** Six rooftops in Admin → Locations, slug exactly:
  `tampa` · `davenport` · `sarasota` · `brooksville` · `trailer-sales` · `aftermarket-parts`.
  Fill address (geocoded for the map), main phone, and on the Departments tab: enable
  Sales / Parts / Service (and Rental where it applies) as **public**, with hours and
  public phone contacts. Without that, the live widgets render "Locations load here."
- **Staff.** `/meet-the-team` renders one `staff` widget per department code
  (`executive`, `sales`, `parts`, `service`, `office`). `executive` is not in the
  platform seed — add it as a custom department, then publish people onto those
  departments from Locations → Employees. Until then the bands stay empty.
- **Blog bodies.** Nine posts, each with its excerpt and a link to the original article.
- **`pageType` on each page and the analytics bags on both forms.** Deliberately unset:
  their allowed values come from whichever analytics providers the dealer has enabled, so
  they are set on the dashboard (Pages → page settings, and Forms), not here. `npm run
  validate` notes each one.
- **Publish from the dashboard** after filling Locations. Publish now re-resolves every
  widget in the repo server-side and commits the answers, so there is no longer any need to
  open each page and save it first — one Publish is the whole action. It also brings
  `renderer/` up to date; do not edit it here.
- **`dealer.config.json` identity** (`channelToken` `c1-msqf4iad`) is already baked.
  Production `storefrontOrigin` is rewritten by the platform on the production dashboard;
  the local value `https://a1.buzznerdsubsite.loc` is not what Vercel should ship.

---

## 7. Verified state

```
npm run validate   exit 0 — notes only (pageType, brochure grid from §5.4)
npm run build      exit 0 — 31 pages + 9 posts + the blog index (renderer 4.14.0)
```

All four renderer copies are on **4.14.0** — template, dashboard, Vendure catalogue and this
repo.

### Rooftop structured data

Each of the six location pages carries `locationSlug` in `site/pages.json`, matching its
directory and the slug in Admin → Locations. That makes the page emit a `LocalBusiness` for
**that branch** — address, geo, phone, per-department `openingHoursSpecification` — instead
of repeating the company's head-office record on all six, which is what every rooftop page
published before.

It is built from the page's own widget snapshots, so it appears once the dealer has filled
in Locations and pressed Publish, and not before. A page with no snapshot falls back to the
company node rather than inventing an address.

The FAQ blocks on each rooftop page still spell out that branch's address and hours as
editorial prose. That is dealer-maintained copy, not live data: if a rooftop moves or
changes its hours, those answers have to be edited on the Pages screen. Everything above
them updates itself.
---

## 8. `SS_International_7` — the trailer-parts post

> Superseded by §9: the blog handoff redraws this post without the quick answer and FAQ,
> with its own photographs, on the shared post layout.

The handoff is one page: the blog post *Why Go to Sun State Trailers for Semi Trailer Parts*.
Its header, utility bar, footer and tokens are the ones already built here, so the chrome was
left as the dealer last saved it and only the post was added.

| Handoff | Here |
|---|---|
| `.hero--post` | the **Post hero** component, as on the other long-form posts |
| `.toc` + `.toc__aside` | the **Post contents** coded widget and a bordered promo column (`parts-and-service` button) |
| `.answer` | the quick-answer column (`#post-answer` on its text block, `#post-lede` on the lede) |
| `.grid--2` of `.card` lists | a two-column row, each column a **Prose list** |
| `.spec-table` checkmark rows | the new **Checkmark list** coded widget (`site/widgets/check-list.json`) — a real `<ul>` |
| `.figure` | image blocks cropped to 380px (240px at phone width) in the post's CSS |
| `.callout`, `.article__actions` | buttons from the library: `get-support`, `trailer-parts-get-started`, `contact-us-outline` |
| `.share` | the **Share row** coded widget |
| FAQ accordion + FAQPage schema | the platform `faq` widget, which emits the schema from the same items |
| related posts | the platform **Latest posts** block, with an `all-blog-posts` link |
| dark CTA band | the **Contact CTA band** component |

Body copy is the handoff's verbatim. The three photographs are the handoff's placeholders,
re-encoded as JPEG under `public/img/blog/` with the live post's filenames, so the real
images can replace them one for one (or be swapped on the post in the dashboard).

What the platform could not express, and what was changed:

- **Related posts are the latest posts, not three chosen Parts posts.** The Latest posts
  block has no topic filter and cannot leave out the post being read, so it asks for four
  and the post's CSS hides its own card, or the fourth. The handoff's three related titles
  do not exist as posts in this repo. Cards show a "Cover" placeholder until each post gets a
  cover image on the Posts screen.
- **The first FAQ answer opens closed**, as on every other FAQ band here.
- **`BlogPosting`, `BreadcrumbList` and `speakable` JSON-LD are not emitted** — the build
  writes the FAQ and dealer nodes for a post, not an article node. Worth reporting.
- **Share links and inline links** point at this site's routes (`/parts`, `/service`,
  `/locations/trailer-sales`), not the handoff's `sunstatetrailers.com` URLs. The
  `/locations/trailer-sales` link resolves once that rooftop is published from Admin.
- A **column cannot carry an anchor** (only sections and blocks render one), which is why
  `#post-answer` sits on the answer's text block.

---

## 9. Blog handoff, Part 1 of 6 — the blog page and nine posts

`design_handoff_blog_parts/sunstate-blog-handoff-part-1`: `blog.html` and nine article pages.
Parts 2–6 carry the other 45 posts on the same design.

**The posts.** Four are new (*Heavy Duty Truck Parts Tampa*, *How to Choose a Service and Truck
Parts Dealer*, *How to Choose the Right Truck Parts and Service Dealer*, *What Happens When You
Run Out of Diesel Exhaust Fluid?*), and five replace what was here: the air-brake and oil-change
posts (short migrations with no hero or rail) and three drafts that held only an excerpt
(*What to Expect From an International Truck Service Center*, *Why Fuel Filter Pressure…*),
now published. *Why Go to Sun State Trailers…* is redrawn on the same layout. Body copy
matches the handoff word for word — checked mechanically against every post.

Each post is the same tree: the **Post hero** component, an `article` section holding
`art-side` (the **Post contents** rail and a promo card) and `art-body`, then `related`
(Latest posts) and the **Contact CTA band**. In the body: text and heading blocks, the
**Prose list**, the **Checkmark list** (now with an optional bold title per row), image blocks,
bordered callouts, button rows and the **Share row**.

`tools/blog-handoff/convert.py` builds every post from its handoff page, so Parts 2–6 come
out with the same ids, the same buttons and the same styling. It fails on any element it does
not recognise rather than dropping it, and it also rewrites the blog page's cards.

**Where the styling lives.**

- The article layout — the grid, the sticky rail, prose type, the photo crop, the button
  pair, the Keep reading cards — is written **once**, in *Design → Custom code*, under
  "Long-form posts", keyed to those five node ids. It used to be ~150 lines repeated in each
  post. The contents rail's scroll-spy moved there too.
- Every box inside a post (callouts, the rail's promo card, the two-column cards, the quick
  answer on *Features…*) carries its border, padding and label type as **node styles**, so it
  is restyled in the inspector and keeps its look when duplicated on the canvas.
- A post's own CSS is now one rule: hiding its own card from Keep reading. The air-brake post
  adds its looser list leading, the only per-post rule the handoff has.

**Buttons.** Every callout, rail link and button pair places an existing library button for its
destination — `schedule-service`, `parts-department`, `order-parts-online`,
`service-department`, `contact-us`, `all-blog-posts` — with the post's own wording as a
label override. The four single-use buttons §8 added were removed.

**The blog page** keeps its structure and copy (they already matched). Changed: the hero
photograph, the topic chips (the handoff's nine, plus *Diagnostics* for the post that uses
it), a three-column grid, and the cards — one per published post, with the handoff's topics
and excerpts. Cards that already had a Media Bin cover keep it.

**What differs from the handoff, and why.**

- **The design system.** The dealer changed the tokens on 22 September: `accent` is now
  `#272623` (not the handoff's red `#EE2D24`), `accentDark` `#ff7144`, `paper` `#e8e8e8`,
  and the type scale moved. Everything here uses the tokens, so posts follow whatever the
  Design system says; the handoff's red appears only once `accent` is set back.
- **Keep reading shows the latest posts**, not the three the handoff picks by hand: Latest
  posts has no way to choose posts or skip the one being read (worth reporting).
- **The blog page's cards are typed rows.** This renderer has no `posts` data source, so a post
  published on the Posts screen does not appear on the blog page until its card is added.
  The converter adds them; a data source would remove the step (worth reporting).
- **Dates.** The handoff's post pages and its listing disagree by a day on four posts (oil
  change, both parts-dealer posts, DEF). The post page, the page metadata and the handoff
  README agree, so those dates are used throughout.
- **Photographs** are the handoff's 1280px exports in `public/img/blog/<slug>/`. The Media
  Bin already holds full-size originals for some of these posts; they could not be matched
  from here, so swapping them in is a dashboard edit.
- *How Electrical Diagnostic Tools…* and *When to Schedule Semi Truck Alignment…* are
  published here but not among the handoff's 54 posts. They were left as they are.
- The header and footer are the dealer's current template, not the handoff's; and the
  article JSON-LD (`BlogPosting`, `BreadcrumbList`) is still not emitted for posts.

---

## 10. Blog handoff, Part 2 of 6 — nine more posts

Nine new posts, built by `tools/blog-handoff/convert.py` on the §9 layout: *Fleet Maintenance
Programs vs One-Off Repairs*, *Where to Go For New and Used Truck Parts in Tampa, FL*, *Truck
Alignment Service: When It's Worth the Cost*, *Why OEM International Truck Parts Matter
Long-Term*, *Common Causes of Heavy-Duty Truck Transmission Failure*, *What to Expect From a
Truck PM Service Visit*, *How Fleet Truck Maintenance Services Reduce Downtime*, *International
Truck Parts Near Me*, and *Common Signs You Need a Diesel Engine Diagnostic*. Body copy and
contents rails match the handoff word for word; the blog page now carries 21 cards.

Part 2 draws four shapes Part 1 did not, and the converter now handles each:

| Handoff | Here |
|---|---|
| `.smoke-table` (label / detail) | the existing **Definition rows** widget, set to the post's measure in the shared post CSS |
| `.compare-table` (factor / option / option) | a new **Comparison table** coded widget (`site/widgets/compare-table.json`) |
| `.checklist-group` | a bordered column (node styles) with a label and a **Prose list** |
| a row of arrow links | a column holding a buttons block of link-style library buttons |

Links between posts point at `/blog/posts/<slug>`; every one in this part resolves to a built
post.

---

## 11. Blog handoff, Part 3 of 6 — nine more posts

Nine new posts on the §9 layout: *Avoid Cheap Parts: How to Find Reliable Parts for Semi
Trucks*, *How a Routine DOT Inspection Keeps Your Fleet on the Road*, *How to Choose the Best
Semi Truck Tires for Long-Term Hauls*, *Preventive Maintenance for Semi Trucks*, *Semi Truck
Maintenance Checklist*, *Semi Truck Road Service*, *The Real Average Maintenance Cost for a
Semi Truck*, *Where to Find Reliable Truck and Trailer Parts in Tampa* and *Why Florida Fleets
Choose Us for Fleet Management Support*. Body copy and contents rails match the handoff word
for word, every link between posts resolves, and the blog page carries 30 cards.

New shapes, and what they became:

| Handoff | Here |
|---|---|
| `.grid-4` of title-and-sentence cards | the platform **Feature list** block, four columns, dressed as the design's bordered cards inside a post |
| `.compare-grid`, `.pm-grid` (titled cards, each holding a list) | a new **Card lists** coded widget (`site/widgets/card-lists.json`) — one item per card, each with its own list of points; a *Card style* setting gives the comparison and the compact group spacing |
| `.stat-band` | the platform **Stat band** block, drawn inside a post as two white cells on a hairline grid |
| a photograph shown whole (the daily checklist) | an image in its own column with node styles, so it is not cropped to 380px |

Converter changes: `tel:` links place `call-main`, the mobile-service flyer maps to the Mobile
Service page, and a callout or link row that points at another post is a text link rather than
a library button — a read-next pointer is content, and a button per article would fill the
library. Re-running Parts 1 and 2 reproduces them, except that two posts dropped a label
override: the dealer has since renamed `schedule-service` to "Schedule Service", which is the
wording those posts wanted.

---

## 12. Blog handoff, Part 4 of 6 — nine more posts

Nine new posts on the §9 layout: *Are Aftermarket Semi Truck Parts as Reliable as OEM?*,
*International Truck Parts Benefits*, *Ordering Semi Truck Parts Online vs Local Service*,
*Preventive Maintenance for Semi Trucks: Why It Saves You More Than It Costs*, *Preventive
Maintenance Schedule for Semi Trucks*, *Semi Truck Brake Maintenance*, *Semi Truck Maintenance
Mistakes That Cost Fleets Thousands*, *Signs It's Time to Replace Your Semi Truck Battery* and
*Why You Need Reliable Semi Truck Service Centers Like Sun State International in Florida*. Body
copy and contents rails match the handoff word for word, every rail link lands on its heading,
and the blog page carries 39 cards.

New shapes, and what they became:

| Handoff | Here |
|---|---|
| `.mistake-head` (number badge + h2) | a row of two columns — a text block as the badge, a real heading block carrying the anchor — laid out by node styles |
| `.pro-tip` | a text block in a column ruled in the accent down its left edge (node styles) |
| `.grid-4` of `.interval-card` (mileage label + list) | **Card lists**, a new *Interval* card style, four across |
| `.grid-2` of title-and-sentence cards | the **Feature list** block, two columns — one list rather than four copied boxes |

Two posts set their own type in the handoff, and carry it in their own CSS: the mistakes post
sets its headings at 26px (21px at phone width) to suit seven numbered ones, and the
aftermarket post rules its comparison in ink under sentence-case headings with roomier cells.

---

## 13. Blog handoff, Part 5 of 6 — nine more posts

Nine new posts on the §9 layout: *Do Semi Truck Maintenance Costs Outweigh the Benefits?*,
*Features to Look for in New Semi Trucks*, *Fleet Truck Service in Florida*, *How a New Truck
Can Help Grow Your Freight Trucking Business*, *Semi Truck Engine Problems Every Driver Should
Watch For*, *Take Your Business Further With These Fleet Services*, *What Are the Most Common
Semi Truck Repairs and How to Handle Them*, *What You Should Look for in a Commercial Truck
Trader* and *Why Florida Fleet Owners Choose Sun State International for Truck Service*. Body
copy and contents rails match the handoff word for word; the blog page carries 48 cards.

New shapes, and what they became — each run of repeated cards is one list:

| Handoff | Here |
|---|---|
| a run of `.problem-card` (warning signs / prevention) | a new **Detail cards** coded widget, *label above the note* |
| a run of `.repair-card` (when to fix / when to replace) | **Detail cards**, *label beside the note* |
| a run of `.step-row` | a new **Numbered steps** coded widget |
| a run of `.faq-item` | a new **Question list** coded widget. It is drawn open, as the design has it; the platform FAQ widget is an accordion, and the handoff declares no FAQ structured data for this post |
| `.redflag-table` | the **Checkmark list** with a new *Mark* setting — ✕ in the design system's "bad" colour |
| `.grid-3` of title-and-sentence cards | the **Feature list**, three across — or **Card lists** in a new *Feature* style when a card's sentence carries a link, which a Feature list item cannot hold |
| `.grid-4` of one-line `.feature-card` tiles | the **Feature list**, titles only, set as body text in that post |

Links: the old storefront's new-truck listing (`sunstateintltrucks.com`) and the old site's
new-inventory page now point at `/store/inventory?condition=new` (the *Browse new trucks*
button), financing at `/financing`, reviews at `/reviews`, about-us at `/our-story`.

The converter now reads each post's own `<style>` block for the differences the handoff sets
per post — card padding, card type size, a one-column stat band — and writes only those into
that post's CSS. It also stopped escaping `&` in prose: the text block escapes it itself, so
"Parts & Service" had been showing as `&amp;` in the three posts that use it.

---

## 14. Blog handoff, Part 6 of 6 — the last nine posts

Eight new posts and one rebuilt: *Is a New Freight Truck Worth the Cost?*, *Searching for an
International Truck Dealer?*, *The Latest Design and Safety Updates in New Tractor-Trailers*,
*Which Semi Truck Is Right for Your Business?*, *Who Makes International Trucks?*, *Why Sun
State International Is the Go-To Dealership for Truck Equipment in Tampa*, *Why You Should Add
a New International Truck to Your Fleet*, *Why Your Business Needs a Fleet Management System*,
and *Features You Should Look for In a New Semi Truck*, rebuilt on the shared layer. Body copy,
contents rails and the Features FAQ match the handoff word for word.

**The handoff is complete.** All 54 of its posts are published and on the blog page (56 cards:
the 54 and the two posts this repo had that the handoff does not list — *How Electrical
Diagnostic Tools Prevent Breakdowns* and *When to Schedule Semi Truck Alignment Near Me*). Three
older draft stubs the handoff also does not list are left as drafts: *Why Visit Your Local
International Truck Service Department*, *Signs You Need to Replace Your Semi Truck Suspension
Parts* and *Why Sun State Is One of the Top Fleet Service Providers*.

*Features…* was built by hand before the converter existed. The rebuild keeps all 54 of its node
ids — the converter's names for its callout and button row are mapped back — and its hero
photograph, cover, keywords and FAQ; the handoff draws the hero as "photo to be supplied", so the
dealer's own photo stays. Its quick answer and its FAQ (the platform FAQ widget, which emits the
FAQPage data the handoff declares) are now produced by the converter too.

New shapes, and what they became:

| Handoff | Here |
|---|---|
| a whole card that is one link (New / Pre-owned; Inventory / Parts / Service) | a new **Link cards** coded widget |
| titled cards of bold-led points (cab types) | **Card lists**, *Spec* style — its points may now carry bold |
| an accent label over one line (model series), two or three across | **Card lists**, *Series* styles |
| a small number over a short heading ("01 / Built in the U.S.") | **Card lists**, *Numbered* style |
| title-and-sentence cards two across where a card carries a link | **Card lists**, *Feature, two across* |
| a numbered section ("01" beside a heading and paragraphs) | a row of real blocks — the number, then the heading and its paragraphs — on a 56px / 1fr grid set by node styles |
| the quick answer | the accent-ruled column, with the ids the post always had |

Links: international.com and its subdomains stay outbound; the old site's used-truck listing
goes to `/store/inventory?condition=used`, its configurator, S13 and extended-service pages to
`/truck-configurator`, `/specifications` and `/extended-service`, and its Tampa, Sarasota and
Davenport directions pages to those rooftops' generated pages.

---

## 15. Sun State Trailers blog, batch 1 of 2 — six dry-van posts

A Claude Design prototype handoff (`handoff/batch-1`): six Sun State Trailers articles on the
same post design as §9 — *Why Choose Hyundai Dry Van Trailer Dealers*, *Dry Van Trailer Resale
Value Over Time*, *How Long Do Dry Van Trailers Last in Real Use?*, *Dry Van Trailer Financing
at Sun State Trailers*, *Dry Van vs Reefer Trailer* and *Aluminum vs Stainless Steel Dry Van
Trailer Comparison*. Built by `tools/blog-handoff/convert.py`; body copy and contents rails
match the handoff word for word, and every rail link lands.

**What was translated and what was not.** The pages run inside the prototype runtime
(`support.js`, `<x-dc>`, `<helmet>`, `style-hover`, `<sc-for>` menus) and ship a `_ds/` design
system for an unrelated inventory widget ("Syyo", orange and cream). Per CLAUDE.md §7 none of
that is carried over: the article markup is read, the chrome is the site's own template, and
the tokens stay the site's. The photographs were PNGs named `.jpg`; they are re-encoded as real
JPEGs (2.7 MB for 25) under `public/img/blog/<slug>/`.

**Links.** The prototype links to its sibling design pages by file name. The converter maps
them by what each link says: inventory calls to action ("Browse / Explore / See … inventory")
go to the storefront's trailer listings, "New Trailers" and "Used Trailers" to those listings
filtered by condition, "Sun State Trailers" in prose to the Trailer Sales rooftop page,
Contact and Financing to their pages. Three buttons were added to the library for this:
`browse-new-trailers`, `browse-used-trailers` and `trailer-sales-location`.
*Trailer Specifications* has no page on this site (the Specifications page is the truck
brochure library), so its two buttons go to the trailer listings, where each unit carries its
specs — worth revisiting if a trailer specifications page is built.

**Cards and metadata.** These posts are not in the Part 1 listing, so the converter takes each
card's topic, date and excerpt from the page itself — the hero's topic chip ("Trailer Sales",
a new chip on the blog page), the publish date, and the lede cut the way the listing cuts it —
and records them in `tools/blog-handoff/blog-cards.json`. The blog page now carries 58 cards.
It no longer lists the four posts the dealer set to draft on 24 September (oil change, air
brakes, electrical diagnostics, alignment), whose typed cards had been linking to pages that
no longer build, nor the *Diagnostics* chip only one of them used.

New shapes:

| Handoff | Here |
|---|---|
| `.type-card` (title, sentence, bold lead-in, list) | **Card lists**, new *Type* style, with a new optional lead-in field |
| `.option-card` (title, sentence, BEST FOR label, list) | **Card lists**, new *Option* style |
| `.reason-card` (title and sentence, three across) | the **Feature list**, carded as this batch cards them |
| a run of `.stage-row` ("0–5 yrs" beside a sentence) | a new **Stage list** coded widget |
| an empty hidden `h2` kept as a rail target | no heading; its anchor moves to the paragraph it introduces |

**Converter changes, all backwards compatible** (Parts 1–6 re-run to the same output): it keeps
a post's existing status instead of re-publishing it, reads a page's own ink-ruled comparison
style, resolves images against the page, and finds a prototype batch's pages beside its index.

---

## 16. Sun State Trailers blog, batch 2 of 2 — six more dry-van posts

The second prototype batch, same format and treatment as §15: *Dry Van Trailer Dimensions and
What They Mean*, *Dry Van Trailer Maintenance Costs to Plan For*, *Dry Van Trailer
Specifications Explained Simply*, *Dry Van Trailer Weight Capacity and Payload Basics*, *New vs
Used Dry Van Trailer* and *Standard Size of a Dry Van Trailer*. Body copy and contents rails
match the handoff word for word; the blog page carries 64 cards. The prototype runtime and its
`_ds/` bundle are not carried over, and the photographs (PNGs named `.jpg`) are re-encoded.

New shapes:

| Handoff | Here |
|---|---|
| a run of `.cost-card` (title, sentence, list, closing note) | **Card lists**, new *Cost* style — one per row, with a new optional closing-note field |
| `.num-card` (a large number over a title and text), two across or alone | **Card lists**, new *Numbered* and *Numbered, full width* styles, with a new optional number field |
| `.type-card` three across; a note after a type card's list | **Card lists**, *Type, three across*; the closing-note field |
| a type card holding two labelled lists ("Benefits" / "Ideal for") | real blocks in two bordered columns — two lists per card nest deeper than a list widget allows |
| a run of `.diff-row` (ruled heading, text, list) | real blocks in columns ruled across the top by node styles, set in the article's prose type |
| questions inside a wrapper, ruled above each | the **Question list**, ruled as that post rules them |
| a four-column comparison (53 / 48 / 28 ft) | the **Comparison table**, now with an optional fourth column |

The one new design-page link, *Service Appointment*, goes to `/service-appointment`.

**Old addresses.** These twelve trailer posts (§15 and this batch) were published on
sunstatetrailers.com. Redirects are not authored in this repo — if that domain is pointed at
this site, the rules below go on **Storefront → 301 Redirects** in Admin (it imports a Simple
301 Redirects CSV):

| Old path on sunstatetrailers.com | New path |
|---|---|
| `/new-trailers/aluminum-vs-stainless-steel-dry-van-trailer/` | `/blog/posts/aluminum-vs-stainless-steel-dry-van-trailer` |
| `/new-trailers/dry-van-trailer-financing/` | `/blog/posts/dry-van-trailer-financing-at-sun-state-trailers` |
| `/new-trailers/dry-van-trailer-resale-value-over-time/` | `/blog/posts/dry-van-trailer-resale-value-over-time` |
| `/uncategorized/dry-van-vs-reefer-trailer/` | `/blog/posts/dry-van-vs-reefer-trailer` |
| `/new-trailers/how-long-do-dry-van-trailers-last-in-real-use/` | `/blog/posts/how-long-do-dry-van-trailers-last-in-real-use` |
| `/uncategorized/why-choose-hyundai-dry-van-trailer-dealers/` | `/blog/posts/why-choose-hyundai-dry-van-trailer-dealers` |
| `/new-trailers/dry-van-trailer-dimensions-and-what-they-mean/` | `/blog/posts/dry-van-trailer-dimensions-and-what-they-mean` |
| `/new-trailers/dry-van-trailer-maintenance-costs/` | `/blog/posts/dry-van-trailer-maintenance-costs-to-plan-for` |
| `/new-trailers/dry-van-trailer-specifications/` | `/blog/posts/dry-van-trailer-specifications-explained-simply` |
| `/new-trailers/dry-van-trailer-weight-capacity/` | `/blog/posts/dry-van-trailer-weight-capacity-and-payload-basics` |
| `/new-trailers/new-vs-used-dry-van-trailer/` | `/blog/posts/new-vs-used-dry-van-trailer` |
| `/new-trailers/standard-size-of-a-dry-van-trailer/` | `/blog/posts/standard-size-of-a-dry-van-trailer` |


## 17. Blog handoff, batch 3 — three new posts, three repeats

Six prototype pages in the §15 format. Three are new posts, each on its live sunstateintl.com
permalink (the page's own `rel="canonical"`), not the shortened file name:

| Handoff file | Post | Topic, date |
|---|---|---|
| `5-benefits-of-used-dry-freight-truck-bodies` | `5-benefits-of-shopping-for-used-dry-freight-truck-bodies` | Sales, Apr 25, 2025 |
| `benefit-from-new-dry-freight-truck-bodies` | `how-your-business-can-benefit-from-new-dry-freight-truck-bodies` | Sales, Apr 18, 2025 |
| `8-things-for-the-best-fleet-maintenance` | `8-things-you-need-to-know-for-the-best-fleet-maintenance` | Fleet, Apr 11, 2025 |

The other three repeat, word for word, posts already on the site: *Are Aftermarket Semi Truck
Parts as Reliable as OEM?*, *The Real Average Maintenance Cost for a Semi Truck* and *How to
Choose the Best Semi Truck Tires for Long-Term Hauls*. **They are left as they are**: the repeat
ships 1000px photographs against the 1280px ones already there and no contents rail, so
re-converting it would only lose something. The converter lists them as repeats and skips them.

Body copy and rails of the new posts match the handoff word for word; the blog page carries 67
cards.

New shapes:

| Handoff | Here |
|---|---|
| an accent label over a bold name, three across ("INTERNATIONAL / MV Series", "01 / Cost per mile") | **Card lists**, *Numbered* style, sized to the handoff on that node |
| an `h2` led by a small accent index ("01  Build Your Fleet…") | a row: the index as text beside a real heading, which keeps the rail's anchor |
| a pull statement — display face, ruled above and below | text in a ruled column (the rules, padding and size are node styles) |
| a bordered callout holding a label and a two-across run of names | the callout, with the names as a **Feature list** of titles, untiled |
| a button pair spelled out inline (48px, filled then outlined) | the site's primary and secondary buttons |

That last one was already in batches 1 and 2, where the pair had come out as two text links.
Those twelve posts now carry the filled / outlined styles too — a style change on each button,
with every node id kept.

Links and the library:

- A new library button, **Browse used trucks** (`/store/inventory?condition=used`), for "Shop
  Used Truck Bodies". It is edited on **Buttons** like the rest.
- *Service*, *Mobile Service* and *Extended Service* design pages go to those pages; *Tampa /
  Sarasota / Davenport Location* go to the branch's generated page.
- sunstatetrailers.com's home ("Globe and Hyundai trailers") goes to the trailer listings, and
  its `/new-trailers/` to new trailers. hyundaitranslead.com, the body maker's own site, stays
  an outbound link, as international.com does.
- A converter bug fixed on the way: a plain `margin: 28px 0` was read as the 34px default. It
  changed no earlier post.

**Dropped / to supply.**

- *5 Benefits of Shopping for Used Dry Freight Truck Bodies* names a hero photograph the
  handoff did not ship (`pasted-1790169124717-0.jpg`, a team member opening a truck body's
  rear doors). The post uses the Post hero's own "photograph to be supplied" slot and its blog
  card the empty image box, so the gap shows. Upload the photo on the post's hero (Posts →
  the post → canvas), and on that post's card on the Blog page (Pages → Blog → the post cards).
- The handoff's hand-picked "Keep reading" cards are the latest-posts list, as on every post.

**Old addresses.** The three new posts keep their sunstateintl.com path under `/blog/posts/`.
If the old domain is pointed at this site, these go on **Storefront → 301 Redirects** in Admin:

| Old path on sunstateintl.com | New path |
|---|---|
| `/5-benefits-of-shopping-for-used-dry-freight-truck-bodies/` | `/blog/posts/5-benefits-of-shopping-for-used-dry-freight-truck-bodies` |
| `/how-your-business-can-benefit-from-new-dry-freight-truck-bodies/` | `/blog/posts/how-your-business-can-benefit-from-new-dry-freight-truck-bodies` |
| `/8-things-you-need-to-know-for-the-best-fleet-maintenance/` | `/blog/posts/8-things-you-need-to-know-for-the-best-fleet-maintenance` |
