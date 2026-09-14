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
| `--color-chrome: #141414` | `colors.ink` — the near-black used for header, footer and dark bands |
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

Everything the tokens cannot express — the 48px page gutter, the 120px section rhythm, the
hard-edged buttons and inputs, the explicit text colours on dark chrome — is in
`site/custom-code.json`, scoped to platform block classes. Two rules there fix platform
behaviour rather than style it, and both are flagged in §5.

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

- **The blog.** The handoff's blog landing (topic filter chips, featured post) is replaced
  by the platform's Posts feature: the nine posts are real records under
  `site/blog/posts/`, so `postsList` and the blog index resolve them. Only the excerpt was
  available in the handoff, so each post carries its excerpt, a link to the original
  article, and an editor's note where the migrated body goes.
- **The home hero's two-select finder** (Type / Category) is the platform's
  `inventory-search` widget, which searches the real catalogue.
- **The truck-type coverflow** is the platform `carousel` behaviour. The handoff stages it
  with absolutely-positioned cards placed by a script from a `data-pos` attribute; the
  platform's implementation brings arrows, keyboard support, `prefers-reduced-motion` and
  markup that is in flow before any script runs — which is also what the Design canvas
  needs, since it runs no site JS. The scale-and-fade coverflow effect is not reproduced.
- **Filter pill groups** (brand and perk filters on home, topic filters on the blog,
  department filters on the team page) are not reproduced as filters — see §5. They became
  either pre-filtered storefront links or in-page jump menus.
- **Location and department hours** are authored content in the `hours-grid` and
  `location-summary` components rather than the `hours` / `phone-numbers` widgets, because
  the design specifies them per department and the widgets render one list from the
  channel's snapshot. Swapping a card for a `widget` node is a one-line change once the
  dealer's Locations module carries per-department hours.
- **Videos and the truck configurator** ship as real links, upgraded to embeds by a page
  script — see §5.
- **The department directory, press coverage and community partner logos** use remote image
  URLs from `sunstateintl.com`. Re-upload those through the media library before launch.

---

## 5. Platform gaps found while building this

1. **A `filter` behaviour cannot be wired from the node model.** `renderer/client/widgets.js`
   reads each item's facet from a `data-<facet>` attribute on the element marked
   `part: "item"`, and each control's from `data-bz-facet` / `data-bz-value`. No block prop
   emits arbitrary data attributes, and a coded widget's markup sits *inside* the wrapper
   that carries `data-bz-part`, so the attributes land on the wrong element. Every filter
   group in this handoff — brand and perk filters, blog topics, team departments — is
   therefore unbuildable as a behaviour.
2. **A component's `list` prop cannot contain a list.** `normaliseProp` forces a list field
   whose type is `list` back to `text`. Anything shaped as a list of lists — the eight
   brochure groups on `/specifications`, each with its own documents — has to be written
   out one placement per group, which is what `npm run validate` then reports as a repeated
   shape. That note on `site/pages/specifications/page.json` is this limitation, not an
   oversight; the `doc-group` coded widget is the closest the model gets.
3. **`ctaId` cannot be bound through a component.** `scripts/validate.mjs` resolves
   `props.items[].ctaId` against `site/buttons.json` before any placement binds, so
   `"{{primaryCta}}"` fails as a dangling id. Components here take `label` + `url` props
   instead, which means those buttons are outside the CTA library.
4. **A stacked row keeps twelve tracks and eleven gaps.** `blocks.css` stacks a row by
   setting `grid-column: 1 / -1` on its columns but leaves `grid-template-columns:
   repeat(12, …)` in place. At this site's 48px gap and 20px mobile gutter that is 528px of
   gap inside a 350px container, so every stacked row ran off the side of a phone. The
   collapse rule is in `site/custom-code.json`; the same arithmetic bites any site whose
   row gap exceeds about a twelfth of the mobile content width.
5. **An image block cannot fill its node.** The block renders
   `.bz-block--image > .bz-container > figure > img`; a `height: 100%` on the figure
   resolves against the container, which has no height, so a photo meant to cover a band
   keeps its intrinsic ratio. One rule in `site/custom-code.json` carries the height down
   the chain; it is inert wherever the block is auto-height.
6. **No iframe block.** `<iframe>` is stripped from both coded widgets and `customHtml`, so
   the video library and the navconfig.com configurator ship as real links and are upgraded
   to embeds by `site/pages/videos/script.js` and
   `site/pages/truck-configurator/script.js`. The un-enhanced state is a working link,
   which is what the canvas draws and what a visitor without scripts gets.

No `customHtml` block is used anywhere in this site.

---

## 6. What the dealer still has to supply

- **Photography.** Every photograph in the handoff is a slot; each one here is a real
  `image` block or a background layer pointing at `/img/photo-placeholder.svg`, with the
  handoff's shot brief as its `alt` text. Searching the repo for `photo-placeholder` gives
  the complete shot list.
- **Maps.** The six location pages carry a map image slot; the home, locations and contact
  pages use the live `locations-map` widget, which needs the channel's Locations module.
- **Staff.** `/meet-the-team` renders six `staff` widgets keyed by department name. The
  handoff's 38-person roster is in `data/meet-the-team.json` for import.
- **Blog bodies.** Nine posts, each with its excerpt and a link to the original article.
- **`pageType` on each page and the analytics bags on both forms.** Deliberately unset:
  their allowed values come from whichever analytics providers the dealer has enabled, so
  they are set on the dashboard (Pages → page settings, and Forms), not here. `npm run
  validate` notes each one.
- **`channelToken`, `domain`, `url`, `storefrontOrigin`** in `dealer.config.json` stay as
  `REPLACE_…` until the repo is connected to the channel.

---

## 7. Verified state

```
npm run validate   exit 0 — 31 pages, 5 forms, 37 buttons, 1 template, 12 components,
                            2 coded widgets; notes only (pageType, REPLACE_ placeholders,
                            the brochure grid from §5.2)
npm test           exit 0 — 124/124
npm run build      exit 0 — 31 pages + 9 posts + the blog index, sitemap, robots, llms.txt
```

No horizontal overflow at 390px, 900px or 1440px on any of the 32 routes.
