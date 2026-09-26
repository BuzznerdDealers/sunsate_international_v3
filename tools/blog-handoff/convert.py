"""Blog handoff (Part N of 6) -> site/blog/posts/<slug>.json, and the blog page's cards.

Also reads a prototype batch (`.dc.html` pages beside an index) and a standalone post
handoff (one framework-free `index.html` with `css/` and `assets/`).

    python3 tools/blog-handoff/convert.py <path to sunstate-blog-handoff-part-N>

Needs BeautifulSoup (`pip install beautifulsoup4`). Run `npm run check` afterwards.

Reads each handoff post and writes a post document built from the site's own
blocks and components: the Post hero, the Post contents rail, prose text /
heading / Prose list / Checkmark list / image blocks, bordered callouts carrying
node styles, button rows from the Buttons library, the Share row, Latest posts
and the Contact CTA band. Anything the converter does not recognise is an error,
so nothing in the design is silently dropped.
"""
import json, re, sys, os, shutil, struct, urllib.parse, glob
from bs4 import BeautifulSoup, NavigableString, Tag

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PART = sys.argv[1].rstrip("/")  # handoff part folder

LINK_MAP = {
    "https://www.sunstateintl.com/": "/",
    "../blog.html": "/blog",
    "https://www.sunstateintl.com/request-service-repair-heavy-medium-duty-trucks-trailers-florida-service-appointment/": "/service-appointment",
    "https://www.sunstateintl.com/parts-accessories-heavy-medium-duty-trucks-trailers-florida-parts/": "/parts",
    "https://www.sunstateintl.com/service-repair-heavy-medium-duty-trucks-trailers-florida-service/": "/service",
    "https://www.sunstateintl.com/maps-and-directions-hours-trailer/": "/locations/trailer-sales",
    "https://www.sunstateintl.com/contact-call-email-internationals-trucks-dealerships-florida-xcontact/": "/contact",
    "https://www.sunstateparts.com/login": "https://www.sunstateparts.com/login",
    "https://www.sunstateintl.com/mobile-service-flyer/": "/mobile-service",
    # The old storefront's new-truck listing, both of its addresses: the platform storefront, filtered.
    "https://www.sunstateintltrucks.com/Inventory/?/listings/for-sale/trucks/27/?DSCompanyID=3352&dlr=1&settingscrmid=367933&condition=new": "/store/inventory?condition=new",
    "https://www.sunstateintl.com/new-heavy-medium-duty-trucks-for-sale-tampa-florida-xnewinventoryatlight-duty-truckmedium-duty-truckheavy-duty-truck/": "/store/inventory?condition=new",
    "https://www.sunstateintl.com/finance-trucks-trailers-tampa-orlando-florida-financing/": "/financing",
    "https://www.sunstateintl.com/read-other-customers-comments-about-us-xtestimonials/": "/reviews",
    "https://www.sunstateintl.com/about-us/": "/our-story",
    "https://www.sunstateintl.com/used-heavy-medium-duty-trucks-for-sale-tampa-florida-xpreownedinventoryatlight-duty-truckmedium-duty-truckheavy-duty-truck/": "/store/inventory?condition=used",
    # The old trailer site's home, linked from "Globe and Hyundai trailers": the trailer listings.
    "https://sunstatetrailers.com/": "/store/inventory?type=trailer",
    "https://sunstatetrailers.com/new-trailers/": "/store/inventory?type=trailer&condition=new",
    "https://www.sunstateintl.com/truck-configurator/": "/truck-configurator",
    "https://www.sunstateintl.com/learn-more-about-s13-powertrain/": "/specifications",
    "https://www.sunstateintl.com/extended-service/": "/extended-service",
    "https://www.sunstateintl.com/maps-and-directions-hours-tampa-adamo/": "/locations/tampa",
    "https://www.sunstateintl.com/maps-and-directions-hours-sarasota/": "/locations/sarasota",
    "https://www.sunstateintl.com/maps-and-directions-hours-davenport/": "/locations/davenport",
    "tel:8007417566": "tel:+18007417566",
}
INTENT = {
    "/service-appointment": "book-service", "/service": "book-service", "/parts": "browse-parts",
    "https://www.sunstateparts.com/login": "browse-parts", "/contact": "contact-dealer",
    "/locations/trailer-sales": "find-location", "/blog": "read-post",
}


# Prototype-format handoffs (Claude Design `.dc.html`) link to their sibling design pages by
# file name. Those resolve to this site's routes by what the link says, not only by which
# page it names: the design sends every inventory call to action to its Trailer Sales page,
# and on this site trailer inventory is the platform storefront.
DC_PAGES = {
    "Home.dc.html": "/", "Blog.dc.html": "/blog", "Contact Us.dc.html": "/contact",
    "Financing.dc.html": "/financing", "Service Appointment.dc.html": "/service-appointment",
    "Service.dc.html": "/service", "Mobile Service.dc.html": "/mobile-service", "Extended Service.dc.html": "/extended-service",
    # No trailer-specifications page exists on this site; each listing carries its specs.
    "Trailer Specifications.dc.html": "/store/inventory?type=trailer",
}
# Pages a later handoff repeats, word for word, from an earlier one. The post already built
# from the first handoff stands: the repeat ships smaller photographs and no rail.
REPEATS = {"batch-3": {"are-aftermarket-semi-truck-parts-as-reliable-as-oem.html",
                       "average-maintenance-cost-for-a-semi-truck.html",
                       "best-semi-truck-tires-for-long-term-hauls.html"},
           "batch-4": {"commercial-truck-oil-change-mistakes.html", "common-air-brake-problems.html",
                       "diesel-engine-diagnostic.html", "diesel-exhaust-fluid.html",
                       "do-semi-truck-maintenance-costs-outweigh-the-benefits.html"},
           # Every page of batch 5 repeats a post built from Parts 1-6; its "On this page" list and
           # share row are template holes ({{ r.title }}, {{ sl.label }}) with nothing to read.
           "batch-5": {"features-to-look-for-in-new-semi-trucks.html", "fleet-maintenance-programs-vs-one-off-repairs.html",
                       "fleet-truck-maintenance-reduces-downtime.html",
                       "fleet-truck-service-in-florida-keeps-businesses-moving.html", "fuel-filter-pressure.html",
                       "go-to-dealership-for-truck-equipment-in-tampa.html"},
           "batch-6": {"heavy-duty-truck-parts-tampa.html", "how-a-new-truck-can-help-grow-your-fright-trucking-business.html",
                       "how-to-choose-a-truck-parts-dealer.html", "how-to-choose-the-right-truck-parts-and-service-dealer.html"},
           "batch-7": {"ordering-semi-truck-parts-online-vs-local-service.html", "preventive-maintenance-for-semi-trucks.html",
                       "preventive-maintenance-saves-you-more-than-it-costs.html",
                       "preventive-maintenance-schedule-for-semi-trucks.html", "reliable-parts-for-semi-trucks.html",
                       "reliable-semi-truck-service-centers-in-florida.html"},
           "batch-8": {"reliable-truck-and-trailer-parts-in-tampa.html", "routine-dot-inspection-keeps-your-fleet-on-the-road.html",
                       "searching-for-an-international-truck-dealer.html", "semi-truck-brake-maintenance.html",
                       "semi-truck-engine-problems-every-driver-should-watch-for.html", "semi-truck-maintenance-checklist.html"}}
POST_TITLES = {}  # "Blog Post - <title>.dc.html" -> slug, filled from the handoff's own pages


def dc_href(h, label):
    name = urllib.parse.unquote(h.rsplit("/", 1)[-1])
    if name in DC_PAGES:
        return DC_PAGES[name]
    m = re.fullmatch(r"(Tampa|Sarasota|Davenport|Brooksville) Location\.dc\.html", name)
    if m:
        return "/locations/" + m.group(1).lower()  # the branch's generated page, by its Admin slug
    if name == "Trailer Sales Location.dc.html":
        l = (label or "").lower()
        if "new trailers" in l: return "/store/inventory?type=trailer&condition=new"
        if "used trailers" in l: return "/store/inventory?type=trailer&condition=used"
        if re.search(r"inventory|in stock|available|options|trailers we have", l): return "/store/inventory?type=trailer"
        return "/locations/trailer-sales"  # the business itself, named in the prose
    if name.startswith("Blog Post - "):
        title = name[len("Blog Post - "):-len(".dc.html")]
        if title in POST_TITLES: return "/blog/posts/" + POST_TITLES[title]
    raise SystemExit(f"unmapped design-page link: {h} ({label})")


# A standalone post handoff (`SS_International_10`: one `index.html`, framework-free HTML)
# links to its sibling pages by flat file name. "Sun State Trailers" in its prose is the
# Trailer Sales rooftop, as in every other trailer post.
FLAT_PAGES = {
    "home.html": "/", "blog.html": "/blog", "service.html": "/service",
    "service-appointment.html": "/service-appointment", "contact-us.html": "/contact",
    "financing.html": "/financing",
    # No trailer-specifications page exists on this site; each listing carries its specs (§15).
    "trailer-specifications.html": "/store/inventory?type=trailer",
}


def trailer_sales_href(label):
    """`trailer-sales.html` is the business, its stock and its rentals: what the link says decides."""
    l = (label or "").lower()
    if re.search(r"\brent", l):
        return "/store/inventory?type=trailer&condition=rental"  # as the Inventory page links rentals
    if "sun state" in l:
        return "/locations/trailer-sales"  # "Sun State Trailers" in the prose
    new, used = re.search(r"\bnew\b", l), re.search(r"\bused\b", l)
    if new and used: return "/store/inventory?type=trailer"
    if used: return "/store/inventory?type=trailer&condition=used"
    if new: return "/store/inventory?type=trailer&condition=new"
    if re.search(r"inventory|in stock|available|browse|explore|\bfind\b|check out", l): return "/store/inventory?type=trailer"
    return "/locations/trailer-sales"


def href_of(a):
    return map_href(a["href"], plain(a))


def map_href(h, label=None):
    if h.endswith(".dc.html"):
        return dc_href(h, label)
    if h == "trailer-sales.html":
        return trailer_sales_href(label)
    if h in FLAT_PAGES:
        return FLAT_PAGES[h]
    if h.endswith("blog.html"):
        return "/blog"
    if h.endswith(".html") and ("/posts/" in h or "/" not in h):
        return "/blog/posts/" + h.rsplit("/", 1)[-1][:-5]
    if re.match(r"https://([a-z]+\.)?(international|hyundaitranslead)\.com(/|$)", h):
        return h  # the manufacturer's own site: an outbound link, kept as written
    if h not in LINK_MAP:
        raise SystemExit(f"unmapped link: {h}")
    return LINK_MAP[h]


# --- the Buttons library ------------------------------------------------------
BUTTONS_PATH = f"{REPO}/site/buttons.json"
buttons = json.load(open(BUTTONS_PATH))
by_key = {(b["label"], b["url"], b["style"]): b["id"] for b in buttons}
ids = {b["id"] for b in buttons}
added = []


def slugify(s):
    s = s.replace("&", "and").replace("→", "")
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# One library button per destination. A placement that words it differently, or
# draws it as a different variant, overrides the label or style on that item —
# the same way the blog page already places `schedule-service` as a link — so the
# library does not grow a near-duplicate for every phrasing in the copy.
DEST = {
    "/service-appointment": "schedule-service", "/parts": "parts-department",
    "https://www.sunstateparts.com/login": "order-parts-online", "/service": "service-department",
    "/contact": "contact-us", "/blog": "all-blog-posts", "tel:+18007417566": "call-main", "/mobile-service": "mobile-service",
    "/store/inventory?condition=new": "browse-new-trucks", "/store/inventory?condition=used": "browse-used-trucks",
    "/store/inventory?type=trailer": "browse-trailers",
    "/locations/trailer-sales": "trailer-sales-location",
    "/store/inventory?type=trailer&condition=new": "browse-new-trailers",
    "/store/inventory?type=trailer&condition=used": "browse-used-trailers", "/store/inventory?type=trailer&condition=rental": "browse-trailer-rentals", "/financing": "financing", "/reviews": "read-reviews",
    "/truck-configurator": "truck-configurator-link", "/specifications": "s13-powertrain", "/extended-service": "extended-service",
}
lib = {b["id"]: b for b in buttons}


def cta(label, url, style):
    if url not in DEST:
        raise SystemExit(f"no library button for {url}")
    b = lib[DEST[url]]
    item = {"ctaId": b["id"]}
    if label != b["label"]:
        item["label"] = label
    if style != b["style"]:
        item["style"] = style
    return item


# --- helpers ------------------------------------------------------------------
def n(id, type, props, children=None, styles=None):
    d = {"id": id, "type": type, "props": props}
    if styles:
        d["styles"] = {"base": styles}
    if children is not None:
        d["children"] = children
    return d


def text(id, t, styles=None, **kw):
    return n(id, "text", {"text": t, "align": "left", "width": "full", **kw}, styles=styles)


def row(id, cols, gap=0, styles=None):
    return n(id, "row", {"gap": gap}, cols, styles=styles)


def col(id, kids, span=12, styles=None, **kw):
    return n(id, "column", {"span": span, **kw}, kids, styles=styles)


def inline_html(el):
    """An element's contents as the inline HTML a text block allows: <a>, <strong>, <em>."""
    out = []
    for c in el.children:
        if isinstance(c, NavigableString):
            out.append(str(c).replace("<", "&lt;").replace(">", "&gt;"))  # the text block escapes & itself
        elif c.name == "a":
            out.append(f'<a href="{href_of(c)}">{inline_html(c)}</a>')
        elif c.name in ("strong", "b"):
            out.append(f"<strong>{inline_html(c)}</strong>")
        elif c.name in ("em", "i"):
            out.append(f"<em>{inline_html(c)}</em>")
        elif c.name == "br":
            out.append("<br>")
        else:
            raise SystemExit(f"unexpected inline <{c.name}> in {el}")
    s = "".join(out)
    return re.sub(r"\s+", " ", s).strip()


def plain(el):
    return re.sub(r"\s+", " ", el.get_text()).strip()


def jpeg_size(path):
    with open(path, "rb") as f:
        f.read(2)
        while True:
            m, = struct.unpack(">H", f.read(2)); ln, = struct.unpack(">H", f.read(2))
            if m in (0xFFC0, 0xFFC1, 0xFFC2):
                f.read(1); h, w = struct.unpack(">HH", f.read(4)); return w, h
            f.read(ln - 2)


IMG_SRC = f"{PART}/assets/img/posts/"
IMG_DST = f"{REPO}/public/img/blog/"


PAGE_DIR = None  # the handoff page being converted; its images resolve against it


def place_image(slug, src, name):
    fname = os.path.basename(src)
    source = os.path.join(PAGE_DIR, src) if PAGE_DIR and os.path.exists(os.path.join(PAGE_DIR, src)) else IMG_SRC + fname
    os.makedirs(IMG_DST + slug, exist_ok=True)
    dst = f"{IMG_DST}{slug}/{name}.jpg"
    assert source.lower().endswith((".jpg", ".jpeg", ".png")), source
    with open(source, "rb") as f:
        is_jpeg = f.read(2) == b"\xff\xd8"
    if source.lower().endswith(".png"):
        # A standalone handoff ships 2000px PNGs at ~3 MB: a real JPEG at the 1280px the
        # other posts' photographs are.
        from PIL import Image
        im = Image.open(source).convert("RGB")
        if im.width > 1280:
            im = im.resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS)
        im.save(dst, "JPEG", quality=85, optimize=True, progressive=False)
    elif is_jpeg:
        from PIL import Image
        im = Image.open(source)
        if im.width > 1280:
            # Batch 12 ships 1600px exports: the 1280px the other posts' photographs are.
            im.convert("RGB").resize((1280, round(im.height * 1280 / im.width)), Image.LANCZOS).save(
                dst, "JPEG", quality=85, optimize=True, progressive=False)
        else:
            shutil.copyfile(source, dst)
    else:
        # Batch 4 ships its photographs as opaque RGBA PNGs under a .jpg name, at ~1.3 MB
        # each. Served as they are, the file lies about its type; transcode to a real JPEG.
        from PIL import Image  # pip install pillow — only needed for such a batch
        Image.open(source).convert("RGB").save(dst, "JPEG", quality=85, optimize=True, progressive=False)
    w, h = jpeg_size(dst)
    return {"src": f"/img/blog/{slug}/{name}.jpg", "width": w, "height": h}


# Node styles, in the design-system tokens the inspector offers.
BOX = {"borderWidth": 1, "borderStyle": "solid", "borderColor": "line"}
LABEL = {"fontSize": 10, "fontWeight": "700", "letterSpacing": 1, "textTransform": "uppercase",
         "textColor": "accent", "marginBottom": 10}


POST_LINK = {"fontSize": 15, "fontWeight": "700"}


def arrow_link(id, a):
    """A callout's arrow link. To another article it is a text link — a read-next
    pointer is content, not a call to action with its own library button; to a
    service, a department or the parts store it is that destination's button."""
    url = href_of(a)
    if url.startswith("/blog/posts/"):
        return text(id, f'<a href="{url}">{inline_html(a)}</a>', styles=POST_LINK)
    return n(id, "buttons", {"align": "left", "items": [cta(plain(a), url, "link")]})


def margins(style):
    """Top and bottom of an inline `margin:` shorthand — `34px 0` or `8px 0 34px`."""
    m = re.search(r"(?<![-\w])margin:\s*([0-9]+)px(?:\s+0)?(?:\s+([0-9]+)px)?", style)
    top = int(m.group(1)) if m else 34
    bottom = int(m.group(2)) if m and m.group(2) else top
    return top, bottom


def callout(cid, box, style, css=None):
    """A bordered callout: an optional micro-label, an optional paragraph, a link — or a
    two-across run of bold names under the label, which is a Feature list of titles."""
    kids = []
    for c in box.children:
        if not isinstance(c, Tag):
            continue
        if c.name == "div" and "grid-2" in c.get("class", []):
            names = [x for x in c.children if isinstance(x, Tag)]
            assert all(x.name == "div" and not [y for y in x.children if isinstance(y, Tag)] for x in names), c
            kids.append(n(f"{cid}-names", "list", {"headingLevel": 3, "columns": 2, "items": [{"label": plain(x)} for x in names]}))
            fs = re.search(r"font-size:\s*([0-9.]+)px", names[0].get("style", ""))
            css.append(f'/* The callout\'s names are a plain two-across run: no tile, no rule. */\n'
                       f'[data-bz-node="art-body"] .bz-block--list[data-bz-node="{cid}-names"] {{ margin: 0; padding-block: 0; }}\n'
                       f'[data-bz-node="art-body"] [data-bz-node="{cid}-names"] .bz-grid {{ gap: 10px 24px; }}\n'
                       f'[data-bz-node="art-body"] [data-bz-node="{cid}-names"] .bz-feature {{ padding: 0; border: 0; background: none; }}\n'
                       f'[data-bz-node="art-body"] [data-bz-node="{cid}-names"] .bz-feature__t {{ font: 800 {fs.group(1) if fs else 17}px / 1.3 var(--font-heading); color: var(--ink); margin: 0; }}')
        elif c.name == "div":
            kids.append(text(f"{cid}-label", plain(c), styles=LABEL))
        elif c.name == "p":
            kids.append(text(f"{cid}-body", inline_html(c), styles={"fontSize": 15, "lineHeight": 1.7, "marginBottom": 12}))
        elif c.name == "a":
            kids.append(arrow_link(f"{cid}-cta", c))
        else:
            raise SystemExit(f"callout child <{c.name}>")
    top, bottom = margins(style)
    return row(f"{cid}-row", [col(cid, kids, styles={**BOX, "paddingTop": 26, "paddingRight": 28, "paddingBottom": 26,
                                                      "paddingLeft": 28, "marginTop": top, "marginBottom": bottom})])


ID_ALIASES = {
    "features-you-should-look-for-in-a-new-semi-truck": {
        "co-increased-efficiency-2-row": "callout-row", "co-increased-efficiency-2": "callout",
        "co-increased-efficiency-2-label": "callout-label", "co-increased-efficiency-2-body": "callout-body",
        "co-increased-efficiency-2-cta": "callout-cta", "actions-get-the-equipment-2": "art-actions",
    },
}

RUNS = {"stage-row": "stages", "cost-card": "cost", "diff-row": "diff", "problem-card": "stacked", "repair-card": "inline", "step-row": "steps", "faq-item": "qa"}


def detail_card(card):
    """A problem or repair card: title, sentence, then labelled notes."""
    it = {"title": "", "body": "", "notes": []}
    for x in [x for x in card.children if isinstance(x, Tag)]:
        cls = x.get("class", [])
        if x.name == "h3": it["title"] = plain(x)
        elif x.name == "p" and not it["notes"] and not it["body"]: it["body"] = plain(x)
        elif x.name == "div" and "label" in cls: it["notes"].append({"label": plain(x), "text": ""})
        elif x.name == "p": it["notes"][-1]["text"] = plain(x)
        elif x.name == "div" and "row" in cls:
            tag, txt = x.find_all("span", recursive=False)
            it["notes"].append({"label": plain(tag), "text": plain(txt)})
        else: raise SystemExit(f"card child <{x.name} {cls}>")
    return it


def page_slug(path, raw=None):
    """A sunstateintl.com article keeps its live permalink as its slug — the file may carry a
    shortened name (batch 3 does), and the permalink is the address search engines hold."""
    raw = raw if raw is not None else open(path).read()
    if os.path.basename(path) == "index.html":
        # A standalone handoff is always index.html; the post is its canonical permalink.
        m = re.search(r'rel="canonical" href="https?://[^"]+/([^"/]+)/?"', raw)
        return m.group(1)
    m = re.search(r'rel="canonical" href="https://www\.sunstateintl\.com/([^"/]+)/?"', raw)
    return m.group(1) if m else os.path.basename(path)[:-5]


def normalise_standalone(s):
    """A standalone post handoff draws the same post as the prototype batches with its own
    class names. Rename them to the shapes convert() reads, so the post comes out on the
    shared layout with the same ids, buttons and styling as every other post.
    Returns the extra CSS the page asks for that the shared layer does not carry."""
    extra = []
    hero = s.select_one("section.hero--post")
    if hero is None:
        return extra
    hero["class"] = ["post-hero"]
    img = hero.find("img")
    pos = re.search(r"object-position:\s*([^;\"]+)", img.get("style", "")) if img else None
    if pos and pos.group(1).strip() not in ("center", "center center", "50% 50%"):
        extra.append(f'/* The hero photograph is framed a little high, as the design frames it. */\n'
                     f'[data-bz-section="post-hero"] [data-bz-node="ph-photo"] img {{ object-position: {pos.group(1).strip()}; }}')
    for t in hero.select(".post-byline time"):
        t.name = "span"  # the byline's date, read with its other parts
    toc = s.select_one("aside.toc")
    toc["class"] = ["post-toc"]
    toc.select_one(".toc__aside")["style"] = "margin-top: 26px"
    s.select_one(".article__body")["class"] = ["post-body"]
    for f in s.select(".post-body > figure.figure"):
        assert not f.find("figcaption"), f
        f.name = "div"; f["style"] = "position: relative"; del f["class"]
    for g in s.select(".post-body > div.grid--3"):
        g["class"] = ["grid-3"]
    for g in s.select(".post-body > div.grid--2"):
        g["class"] = ["grid-2"]
        for c in g.find_all("div", class_="card", recursive=False):
            c["class"] = ["factor-card"]
    for c in s.select(".post-body > div.callout"):
        c["style"] = "border: 1px solid var(--color-line); margin: 34px 0"  # .callout
    for a in s.select(".post-body > div.article__actions:not(.article__actions--inline)"):
        a["style"] = "display: flex"
        for b in a.select("a.btn--primary"):
            b["class"] = b.get("class", []) + ["hv-2"]
    for b in s.select(".post-body > div.article__actions--inline a.btn--primary"):
        b["class"] = b.get("class", []) + ["hv-2"]
    if s.select(".post-body .type-card"):
        extra.append("/* Its type cards: 24px in, the title 10px over a 14px list. */\n"
                     '[data-bz-node="art-body"] .ss-cl--type,\n[data-bz-node="art-body"] .ss-cl--type3 { gap: 24px; }\n'
                     '[data-bz-node="art-body"] .ss-cl--type { gap: 28px; }\n'
                     '[data-bz-node="art-body"] .ss-cl--type .ss-cl__card { padding: 24px; }\n'
                     '[data-bz-node="art-body"] .ss-cl--type .ss-cl__t { margin: 0 0 10px; }\n'
                     '[data-bz-node="art-body"] :is(.ss-cl--type, .ss-cl--type3) .ss-cl__list { margin: 0; padding-left: 18px; }\n'
                     '[data-bz-node="art-body"] :is(.ss-cl--type, .ss-cl--type3) .ss-cl__list li { font-size: 14px; }')
    if s.select(".post-body .num-card"):
        extra.append("/* Its numbered cards sit as far apart as the design's grids: 28px two across, 24px three. */\n"
                     '[data-bz-node="art-body"] .ss-cl--num { gap: 28px; }\n[data-bz-node="art-body"] .ss-cl--num3 { gap: 24px; }')
    if s.select(".post-body .type-card > p"):
        extra.append("/* A type card's sentence is set as body text, as the article's paragraphs are. */\n"
                     '[data-bz-node="art-body"] :is(.ss-cl--type, .ss-cl--type3) .ss-cl__p { font-size: 17px; line-height: 1.8; margin: 0 0 18px; }')
    for sh in s.select(".post-body > div.share"):
        sh["style"] = "border-top: 1px solid var(--color-line); display: flex"
    for sec in s.find("main").find_all("section", recursive=False):
        for w in sec.select("div.wrap"):
            w.unwrap()  # the CTA band's eyebrow is then the band's first div's first div
    return extra


def convert(path):
    global PAGE_DIR
    PAGE_DIR = os.path.dirname(path)
    slug = page_slug(path)
    raw = open(path).read()
    s = BeautifulSoup(raw, "html.parser")
    own = re.search(r"<style>(.*?)</style>", raw, re.S)
    own_style = own.group(1) if own else ""  # a standalone handoff keeps its CSS in css/
    extra_css = normalise_standalone(s)
    main = s.find("main")
    hero = main.select_one("section.post-hero")
    hero_img = hero.find("img")
    crumbs = hero.find("nav").find_all(["a", "span"])
    crumb3 = plain(crumbs[-1])
    h1 = plain(hero.find("h1"))
    byline = [plain(x) for x in hero.find("h1").find_next_sibling("div").find_all("span") if plain(x) != "·"]
    topic_chip, date_txt, read_txt, author = byline
    existing = f"{REPO}/site/blog/posts/{slug}.json"
    if hero_img is None:
        # "Photo to be supplied" in the handoff: keep the photograph the post already has.
        old = json.load(open(existing))
        cover = {k: v for k, v in old["nodes"][0]["props"]["values"]["image"].items() if k != "alt"}
        hero_img = {"alt": old["nodes"][0]["props"]["values"]["image"].get("alt", "")}
        cover_src = old.get("coverImage") or cover["src"]
    elif not os.path.exists(os.path.join(PAGE_DIR, hero_img["src"])) and os.path.exists(existing) \
            and json.load(open(existing))["nodes"][0]["props"]["values"]["image"]["src"] != "/img/photo-placeholder.svg":
        # The page names a photograph its handoff did not ship: a post that already has
        # one keeps it.
        old = json.load(open(existing))
        cover = {k: v for k, v in old["nodes"][0]["props"]["values"]["image"].items() if k != "alt"}
        cover_src = old.get("coverImage") or cover["src"]
    elif not os.path.exists(os.path.join(PAGE_DIR, hero_img["src"])):
        # ...and a new post takes the component's own "to be supplied" slot rather than
        # someone else's photograph, so the gap is visible on the canvas and in the card.
        print(f"  MISSING hero photograph for {slug}: {hero_img['src']} — placeholder used")
        cover = {"src": "/img/photo-placeholder.svg"}
        cover_src = None
    else:
        cover = place_image(slug, hero_img["src"], "hero")
        cover_src = cover["src"]

    title_case = lambda t: " ".join(w.capitalize() if w.isupper() else w for w in t.split())
    hero_node = n("hero", "sharedSection", {"sectionId": "post-hero", "values": {
        "breadcrumb": f'<a href="/">Home</a> / <a href="/blog">Blog</a> / {title_case(crumb3.title())}',
        "title": h1, "topic": topic_chip.title().replace("&Amp;", "&"), "date": date_txt.title(),
        "readTime": read_txt.lower(), "author": title_case(author.title()),
        "image": {**cover, "alt": hero_img.get("alt", "")}}}, [])

    # --- the rail
    toc = main.select_one("aside.post-toc")
    # the rail's own in-page links (a prototype batch does not class them toc__link)
    items = [{"label": plain(a), "href": a["href"]} for a in toc.select("nav a[href^='#']")]
    box = toc.find("div", style=re.compile("margin-top: 26px"))
    bparts = [c for c in box.children if isinstance(c, Tag)]
    aside = col("art-aside", [
        text("aside-label", plain(bparts[0]), styles=LABEL),
        text("aside-body", inline_html(bparts[1]), styles={"fontSize": 14, "lineHeight": 1.65, "marginBottom": 14}),
        n("aside-cta", "buttons", {"align": "left", "items": [cta(plain(bparts[2]), href_of(bparts[2]), "link")]}),
    ], styles={**BOX, "paddingTop": 20, "paddingRight": 20, "paddingBottom": 20, "paddingLeft": 20, "marginTop": 26})
    side = col("art-side", [n("art-toc", "post-toc", {"label": "On this page", "items": items}),
                            row("art-aside-row", [aside])], span=3)

    # --- the body
    body = main.select_one(".post-body")
    out, sec, seq, fig = [], "intro", {}, 0

    def nid(kind):
        seq[sec] = seq.get(sec, 0) + 1
        return f"{kind}-{sec}-{seq[sec]}"

    share = None
    pending_anchor = None
    elements, run = [], None
    flat = []
    for x in [x for x in body.children if isinstance(x, Tag)]:
        kids = [k for k in x.children if isinstance(k, Tag)]
        # A plain wrapper around a run of stage rows is the run itself.
        if x.name == "div" and not x.get("class") and kids and (
                all("stage-row" in k.get("class", []) for k in kids) or all("faq-item" in k.get("class", []) for k in kids)):
            flat.extend(kids)
        else:
            flat.append(x)
    for el in flat:
        kind = next((k for k in RUNS if k in el.get("class", [])), None)
        if kind and run and run[0] == kind:
            run[1].append(el)
        elif kind:
            run = (kind, [el]); elements.append(run)
        else:
            run = None; elements.append(el)
    for el in elements:
        if isinstance(el, tuple):
            kind, els = el
            if RUNS[kind] in ("stacked", "inline"):
                out.append(n(nid("details"), "detail-cards", {"variant": RUNS[kind], "items": [detail_card(x) for x in els]}))
            elif RUNS[kind] == "cost":
                # Cost cards, one per row: title, sentence, list, a closing note — Card lists.
                items = []
                for x in els:
                    it = {"title": "", "points": []}
                    for y in [y for y in x.children if isinstance(y, Tag)]:
                        if y.name == "h3": it["title"] = plain(y)
                        elif y.name == "p" and not it["points"]: it["intro"] = inline_html(y)
                        elif y.name == "ul": it["points"] = [{"text": inline_html(li)} for li in y.find_all("li")]
                        elif y.name == "p": it["outro"] = plain(y)
                        else: raise SystemExit(f"cost card child <{y.name}>")
                    items.append(it)
                out.append(n(nid("cards"), "card-lists", {"variant": "cost", "items": items}))
            elif RUNS[kind] == "diff":
                # Ruled sections (heading, text, list), one after another: real blocks in a column
                # ruled across the top by node styles, so the prose stays editable.
                for x in els:
                    cid = nid("diff"); kids = []
                    for j, y in enumerate([y for y in x.children if isinstance(y, Tag)]):
                        if y.name == "h3": kids.append(n(f"{cid}-h", "heading", {"text": plain(y), "headingLevel": 3, "align": "left"}))
                        elif y.name == "p": kids.append(text(f"{cid}-p{j}", inline_html(y)))
                        elif y.name in ("ul", "ol"): kids.append(n(f"{cid}-list{j}", "prose-list", {"ordered": y.name == "ol", "items": [{"text": inline_html(li)} for li in y.find_all("li", recursive=False)]}))
                        else: raise SystemExit(f"diff row child <{y.name}>")
                    out.append(row(f"{cid}-row", [col(cid, kids, styles={"borderTopWidth": 1, "borderLeftWidth": 0, "borderRightWidth": 0,
                        "borderBottomWidth": 0, "borderStyle": "solid", "borderColor": "line", "paddingTop": 22, "paddingBottom": 22})]))
            elif RUNS[kind] == "stages":
                items = []
                for x in els:
                    yrs = x.find("div", class_="yrs"); rest = [y for y in x.children if isinstance(y, Tag) and y is not yrs]
                    inner = rest[0] if rest[0].name == "div" else x
                    h3 = inner.find("h3"); p_ = inner.find("p")
                    items.append({"label": plain(yrs), **({"title": plain(h3)} if h3 else {}), "text": plain(p_)})
                out.append(n(nid("stages"), "stage-list", {"items": items}))
            elif RUNS[kind] == "steps":
                items = []
                for x in els:
                    num = plain(x.find("div", class_="step-num")); inner = x.find_all("div", recursive=False)[1]
                    items.append({"num": num, "title": plain(inner.find("h3")), "text": plain(inner.find("p"))})
                out.append(n(nid("steps"), "step-list", {"items": items}))
            else:
                if re.search(r"\.faq-item\s*\{[^}]*border-top", own_style):
                    extra_css.append("/* Its questions are ruled above each, and closed off below the last. */\n"
                                     '[data-bz-node="art-body"] .ss-qa { margin-bottom: 20px; }\n'
                                     '[data-bz-node="art-body"] .ss-qa__i { border-bottom: 0; border-top: 1px solid var(--line); }\n'
                                     '[data-bz-node="art-body"] .ss-qa__i:last-child { border-bottom: 1px solid var(--line); }\n'
                                     '[data-bz-node="art-body"] .ss-qa__a { font-size: 15px; }')
                out.append(n(nid("questions"), "qa-list", {"items": [{"q": plain(x.find("h3")), "a": plain(x.find("p"))} for x in els]}))
            continue
        st = el.get("style", "")
        cls = el.get("class", [])
        if el.name == "p":
            if el.get("id") == "post-lede":
                out.append(text("lede", inline_html(el), anchor="post-lede"))
            elif "font-family: var(--font-display)" in st and "border-top" in st:
                # A pull statement: the display face, ruled above and below. The rules, measure
                # and size are node styles; only the face has no style field.
                cid = nid("pull")
                fs = re.search(r"font-size:\s*([0-9.]+)px", st)
                top, bottom = margins(st)
                # The ruled box is a column, as a callout's is: the long-form layout zeroes a
                # block's own padding, not a column's.
                out.append(row(f"{cid}-row", [col(cid, [text(f"{cid}-text", inline_html(el), styles={
                    "fontSize": int(float(fs.group(1))) if fs else 22, "fontWeight": "800", "lineHeight": 1.4, "textColor": "ink"})],
                    styles={"borderTopWidth": 1, "borderBottomWidth": 1, "borderLeftWidth": 0, "borderRightWidth": 0,
                            "borderStyle": "solid", "borderColor": "line", "paddingTop": 24, "paddingBottom": 24,
                            "marginTop": top, "marginBottom": bottom})]))
                extra_css.append(f'[data-bz-node="art-body"] .bz-col [data-bz-node="{cid}-text"].bz-block--text p {{ font-family: var(--font-heading); font-size: inherit; line-height: 1.4; font-weight: inherit; color: inherit; margin: 0; max-width: none; }}')
            elif pending_anchor:
                out.append(text(nid("p"), inline_html(el), anchor=pending_anchor)); pending_anchor = None
            else:
                out.append(text(nid("p"), inline_html(el)))
        elif el.name == "h2" and not plain(el) and "display:none" in st.replace(" ", ""):
            # An empty, hidden heading kept only as the rail's link target: the anchor moves
            # to the paragraph it introduces, so the link still lands and no blank heading ships.
            sec = el["id"]; pending_anchor = sec
        elif el.name == "h2" and [x.name for x in el.children if isinstance(x, Tag)] == ["span", "span"] \
                and re.fullmatch(r"\d+", plain(el.find("span"))):
            # A heading led by a small accent index ("01  Build Your Fleet…"), the pair on one
            # baseline: the index as text beside a real heading block, which keeps the anchor.
            sec = el["id"]
            num, h = el.find_all("span", recursive=False)
            out.append(row(f"nh-{sec}", [
                col(f"nh-{sec}-lead", [text(f"nh-{sec}-index", plain(num), styles={
                    "fontSize": 13, "fontWeight": "700", "letterSpacing": 2, "lineHeight": 1, "textColor": "accent"})],
                    span=1, styles={"flexShrink": 0, "marginRight": 16}),
                col(f"nh-{sec}-col", [n(f"h-{sec}", "heading", {"text": plain(h), "headingLevel": 2, "align": "left", "anchor": sec})],
                    span=11, styles={"flexGrow": 1}),
            ], styles={"display": "flex", "alignItems": "baseline", "marginTop": 52, "marginBottom": 16}))
        elif el.name == "h2" and not el.get("id"):
            # A heading the contents rail does not list (batch 14's closing one): no anchor, and
            # its node named from its first words.
            sec = "-".join(slugify(plain(el)).split("-")[:4])
            out.append(n(f"h-{sec}", "heading", {"text": plain(el), "headingLevel": 2, "align": "left"}))
        elif el.name == "h2":
            sec = el["id"]
            out.append(n(f"h-{sec}", "heading", {"text": plain(el), "headingLevel": 2, "align": "left", "anchor": sec}))
        elif el.name == "h3":
            p = {"text": plain(el), "headingLevel": 3, "align": "left"}
            if el.get("id"):
                p["anchor"] = el["id"]
            out.append(n(nid("h3"), "heading", p))
        elif el.name in ("ul", "ol"):
            out.append(n(nid("list"), "prose-list", {"ordered": el.name == "ol",
                                                    "items": [{"text": inline_html(li)} for li in el.find_all("li", recursive=False)]}))
        elif el.name == "table" and "spec-table" in cls:
            rows = []
            for tr in el.select("tr"):
                td = tr.find_all("td")[1]
                strong = td.find("strong")
                if strong:
                    t = plain(strong); strong.extract()
                    rows.append({"title": t, "text": plain(td)})
                else:
                    rows.append({"text": plain(td)})
            bullet = [plain(tr.find("td")) for tr in el.select("tr")] == ["•"] * len(rows)  # warning signs, not ticks
            mark = {"mark": "cross"} if "redflag-table" in cls else {"mark": "bullet"} if bullet else {}
            out.append(n(nid("checks"), "check-list", {**mark, "items": rows}))
        elif el.name == "div" and el.find("img") and "position: relative" in st:
            fig += 1
            img = el.find("img")
            out.append(n(f"fig-{fig}", "image", {"width": "full", "image": {**place_image(slug, img["src"], str(fig)), "alt": img.get("alt", "")}}))
        elif el.name == "div" and "border: 1px" in st:
            out.append(callout(nid("co"), el, st, extra_css))
        elif el.name == "div" and "border-top" in st and "display: flex" in st:
            share = el
        elif el.name == "div" and "display: flex" in st and not el.select(".hv-2, .hv-3"):
            # A row of arrow links, not a button pair: its own column so it keeps the
            # margins the design gives it rather than the button pair's.
            cid = nid("links")
            anchors = el.find_all("a")
            if any(href_of(a).startswith("/blog/posts/") for a in anchors):
                kids = [arrow_link(f"{cid}-{i+1}", a) for i, a in enumerate(anchors)]
            else:
                # A button pair spelled out inline (batch 2 and 3: 48px tall, the first filled,
                # the rest outlined) keeps this row — the ids already shipped with it — and
                # takes the filled/outlined styles; anything else is a row of arrow links.
                style_of = lambda a: ("link" if "height: 48px" not in a.get("style", "") else
                                      "primary" if "background: var(--color-accent" in a.get("style", "") else "secondary")
                kids = [n(f"{cid}-cta", "buttons", {"align": "left", "items": [cta(plain(a), href_of(a), style_of(a)) for a in anchors]})]
            top, bottom = margins(st)
            out.append(row(f"{cid}-row", [col(cid, kids, styles={"marginTop": top, "marginBottom": bottom})]))
        elif el.name == "div" and "article__actions--inline" in cls:
            # A button row mid-article: the end-of-post pair's buttons, 8px / 34px around it.
            cid = nid("actions")
            out.append(n(cid, "buttons", {"align": "left", "items": [
                cta(plain(a), href_of(a), "primary" if "hv-2" in a.get("class", []) else "secondary") for a in el.find_all("a")]}))
            extra_css.append(f'[data-bz-node="art-body"] > [data-bz-node="{cid}"] .bz-btns {{ margin: 8px 0 34px; }}')
        elif el.name == "div" and "check-list" in cls and el.find("div", class_="check-item", recursive=False):
            # Checkmark rows in a round accent badge: the Checkmark list's round-badge mark.
            out.append(n(nid("checks"), "check-list", {"mark": "dot", "items": [
                {"text": plain(x.find("p"))} for x in el.find_all("div", class_="check-item", recursive=False)]}))
        elif el.name == "div" and "display: flex" in st:
            its = []
            for a in el.find_all("a"):
                style = "primary" if "hv-2" in a.get("class", []) else "secondary"
                its.append(cta(plain(a), href_of(a), style))
            out.append(n(nid("actions"), "buttons", {"align": "left", "items": its}))
        elif el.name == "table" and "smoke-table" in cls:
            # Label and detail, ruled: the site's Definition rows, set to the post's measure.
            out.append(n(nid("defs"), "def-rows", {"rows": [
                {"label": plain(tr.find_all("td")[0]), "text": plain(tr.find_all("td")[1])} for tr in el.select("tr")]}))
        elif el.name == "table" and "compare-table" in cls:
            heads = [plain(th) for th in el.select("thead th")]
            assert len(heads) in (3, 4), heads
            rows = [[plain(td) for td in tr.find_all("td")] for tr in el.select("tbody tr")]
            assert all(len(r) == len(heads) for r in rows), rows
            keys = "abcd"
            out.append(n(nid("compare"), "compare-table", {**{f"head{k.upper()}": h for k, h in zip(keys, heads)},
                                                          "rows": [dict(zip(keys, r)) for r in rows]}))
        elif el.name == "div" and el.get("id") == "post-answer":
            # The answer-engine block: an accent-ruled panel, same ids as the post has always used.
            label, p = [x for x in el.children if isinstance(x, Tag)]
            out.append(row("qa-row", [col("qa", [
                text("qa-label", plain(label), styles={**LABEL, "marginBottom": 12}),
                text("qa-body", inline_html(p), anchor="post-answer", styles={"fontSize": 16, "lineHeight": 1.75, "textColor": "ink"}),
            ], styles={"background": "paper", "borderLeftWidth": 3, "borderTopWidth": 0, "borderRightWidth": 0,
                       "borderBottomWidth": 0, "borderStyle": "solid", "borderColor": "accent", "paddingTop": 24,
                       "paddingRight": 26, "paddingBottom": 24, "paddingLeft": 26, "marginBottom": 38})]))
        elif el.name == "div" and el.find("a", class_="factor-card", recursive=False):
            items = []
            for a in el.find_all("a", class_="factor-card", recursive=False):
                label, title = [x for x in a.children if isinstance(x, Tag)]
                items.append({"label": plain(label), "title": plain(title), "url": href_of(a),
                              "newTab": href_of(a).startswith("http")})
            out.append(n(nid("links"), "link-cards", {"across": "3" if "grid-3" in cls else "2", "items": items}))
        elif el.name == "div" and "grid-2" in cls and all(
                [x.name for x in card.children if isinstance(x, Tag)] == ["h3", "ul"]
                for card in el.find_all("div", class_="factor-card", recursive=False)) and el.find("div", class_="factor-card", recursive=False):
            # Titled cards of short bold-led points (cab types): Card lists, spec style.
            out.append(n(nid("cards"), "card-lists", {"variant": "spec", "items": [
                {"title": plain(card.find("h3")), "points": [{"text": inline_html(li)} for li in card.find_all("li")]}
                for card in el.find_all("div", class_="factor-card", recursive=False)]}))
        elif el.name == "div" and "grid-3" in cls and all(
                [x.name for x in card.children if isinstance(x, Tag)] == ["div", "div"]
                for card in el.find_all("div", class_="factor-card", recursive=False)) and el.find("div", class_="factor-card", recursive=False):
            # An accent label over a bold name set as a plain div ("INTERNATIONAL / MV Series",
            # "01 / Cost per mile"): the numbered Card lists, which draw exactly that pair.
            cards = el.find_all("div", class_="factor-card", recursive=False)
            cid = nid("cards")
            out.append(n(cid, "card-lists", {"variant": "numbered", "items": [
                {"title": plain(card.find_all("div", recursive=False)[0]),
                 "intro": inline_html(card.find_all("div", recursive=False)[1]), "points": []} for card in cards]}))
            fs = re.search(r"font-size:\s*([0-9.]+)px", cards[0].find_all("div", recursive=False)[1].get("style", ""))
            pad = re.search(r"\.factor-card\s*\{[^}]*padding:\s*([0-9]+)px", own_style)
            extra_css.append(f'[data-bz-node="art-body"] [data-bz-node="{cid}"] .ss-cl__t {{ margin-bottom: 10px; }}'
                             + (f' [data-bz-node="art-body"] [data-bz-node="{cid}"] .ss-cl__card {{ padding: {pad.group(1)}px; }}' if pad and pad.group(1) != "20" else "")
                             + (f' [data-bz-node="art-body"] [data-bz-node="{cid}"] .ss-cl__p {{ font-size: {fs.group(1)}px; }}' if fs and fs.group(1) != "17" else ""))
        elif el.name == "div" and ("grid-2" in cls or "grid-3" in cls) and all(
                [x.name for x in card.children if isinstance(x, Tag)] in (["div", "p"], ["div", "h3"])
                for card in el.find_all("div", class_="factor-card", recursive=False)) and el.find("div", class_="factor-card", recursive=False):
            # An accent label over one line — model series ("LT® SERIES / Long-haul
            # efficiency") or a numbered point ("01 / a short heading"): Card lists.
            cards = el.find_all("div", class_="factor-card", recursive=False)
            numbered = cards[0].find("h3", recursive=False) is not None
            variant = "numbered" if numbered else ("series" if "grid-3" in cls else "series2")
            out.append(n(nid("cards"), "card-lists", {"variant": variant, "items": [
                {"title": plain(card.find("div")), "intro": inline_html(card.find(["p", "h3"], recursive=False)), "points": []}
                for card in cards]}))
        elif el.name == "div" and el.find("div", class_=["type-card", "option-card"], recursive=False):
            # Titled cards: a sentence, a bold lead-in or a BEST FOR label, then a list — Card lists.
            cards = el.find_all("div", class_=["type-card", "option-card"], recursive=False)
            if any(len(card.find_all("ul", recursive=False)) > 1 for card in cards):
                # A card holding two labelled lists ("Benefits" / "Ideal for") nests deeper than a
                # list widget allows: real blocks in bordered columns instead, one per card.
                cid = nid("cards"); cols = []
                for i, card in enumerate(cards):
                    kids = []
                    for j, y in enumerate([y for y in card.children if isinstance(y, Tag)]):
                        if y.name == "h3": kids.append(n(f"{cid}-{i+1}-h", "heading", {"text": plain(y), "headingLevel": 3, "align": "left"}))
                        elif y.name == "p": kids.append(text(f"{cid}-{i+1}-l{j}", plain(y), styles={"fontSize": 13, "fontWeight": "700", "letterSpacing": 1,
                                                        "textTransform": "uppercase", "textColor": "ink", "marginTop": 10, "marginBottom": 6}))
                        elif y.name == "ul": kids.append(n(f"{cid}-{i+1}-list{j}", "prose-list", {"ordered": False, "items": [{"text": inline_html(li)} for li in y.find_all("li")]}))
                        else: raise SystemExit(f"card child <{y.name}>")
                    cols.append(col(f"{cid}-{i+1}", kids, span=12 // len(cards), styles={**BOX, "paddingTop": 24, "paddingRight": 24, "paddingBottom": 24, "paddingLeft": 24}))
                out.append(row(cid, cols, gap=4, styles={"marginBottom": 20}))
                continue
            variant = "option" if "option-card" in cards[0].get("class", []) else ("type3" if "grid-3" in cls else "type")
            items = []
            for card in cards:
                it = {"title": "", "points": []}
                for x in [x for x in card.children if isinstance(x, Tag)]:
                    if x.name == "h3": it["title"] = plain(x)
                    elif x.name == "p" and "intro" not in it and not it["points"] and not (x.get("style") and "font-weight: 700" in x["style"]): it["intro"] = inline_html(x)
                    elif x.name in ("p", "div") and not it["points"]: it["lead"] = plain(x)
                    elif x.name == "p" and it["points"]: it["outro"] = plain(x)
                    elif x.name == "ul": it["points"] = [{"text": inline_html(li)} for li in x.find_all("li")]
                    else: raise SystemExit(f"card child <{x.name}>")
                items.append(it)
            out.append(n(nid("cards"), "card-lists", {"variant": variant, "items": items}))
            if variant == "type" and re.search(r"\.type-card ul li\s*\{\s*font-size:\s*14px", own_style):
                extra_css.append('[data-bz-node="art-body"] .ss-cl--type .ss-cl__list { margin: 0; }\n'
                                 '[data-bz-node="art-body"] .ss-cl--type .ss-cl__list li { font-size: 14px; }')
        elif el.name == "div" and ("num-card" in cls or el.find("div", class_="num-card", recursive=False)):
            # A large number over a title and a sentence or list: Card lists, numbered — two
            # across in a grid, full width when a card stands alone.
            cards = [el] if "num-card" in cls else el.find_all("div", class_="num-card", recursive=False)
            items = []
            for card in cards:
                it = {"points": []}
                for y in [y for y in card.children if isinstance(y, Tag)]:
                    if "n" in y.get("class", []): it["num"] = plain(y)
                    elif y.name == "h3": it["title"] = plain(y)
                    elif y.name == "p": it["intro"] = inline_html(y)
                    elif y.name == "ul": it["points"] = [{"text": inline_html(li)} for li in y.find_all("li")]
                    else: raise SystemExit(f"number card child <{y.name}>")
                items.append(it)
            out.append(n(nid("cards"), "card-lists", {"variant": "num-wide" if "num-card" in cls else "num3" if "grid-3" in cls else "num", "items": items}))
        elif el.name == "div" and el.find("div", class_="reason-card", recursive=False) and all(
                [x.name for x in card.children if isinstance(x, Tag)] == ["h3", "p"]
                for card in el.find_all("div", class_="reason-card", recursive=False)):
            # Reasons, three across: the Feature list, carded the way this batch cards them.
            cards = el.find_all("div", class_="reason-card", recursive=False)
            out.append(n(nid("features"), "list", {"headingLevel": 2, "columns": 3, "items": [
                {"label": plain(x.find("h3")), "desc": plain(x.find("p"))} for x in cards]}))
            extra_css.append('/* Its reason cards: roomier, 24px apart, the sentence at 15px. */\n'
                             '[data-bz-node="art-body"] .bz-block--list .bz-grid { gap: 24px; }\n'
                             '[data-bz-node="art-body"] .bz-block--list .bz-feature { padding: 24px; }\n'
                             '[data-bz-node="art-body"] .bz-block--list .bz-feature__t { margin: 0 0 10px; }\n'
                             '[data-bz-node="art-body"] .bz-block--list .bz-feature__d { font-size: 15px; line-height: 1.7; }')
        elif el.name == "div" and "grid-template-columns: 56px" in st:
            # A numbered section ("01"): the number beside a real heading and its paragraphs,
            # laid out by the row's node styles so the prose stays editable on the canvas.
            num, inner = [x for x in el.children if isinstance(x, Tag)]
            cid = nid("numbered")
            kids = []
            for j, x in enumerate([x for x in inner.children if isinstance(x, Tag)]):
                if x.name == "h3": kids.append(n(f"{cid}-h", "heading", {"text": plain(x), "headingLevel": 3, "align": "left"}))
                elif x.name == "p": kids.append(text(f"{cid}-p{j}", inline_html(x)))
                elif x.name in ("ul", "ol"): kids.append(n(f"{cid}-list{j}", "prose-list", {"ordered": x.name == "ol", "items": [{"text": inline_html(li)} for li in x.find_all("li", recursive=False)]}))
                else: raise SystemExit(f"numbered section child <{x.name}>")
            out.append(row(cid, [
                col(f"{cid}-num-col", [text(f"{cid}-index", plain(num), styles={"fontSize": 13, "fontWeight": "700", "letterSpacing": 2, "lineHeight": 1.6, "textColor": "accent"})], span=1),
                col(f"{cid}-body", kids, span=11),
            ], styles={"display": "grid", "gridColumns": "56px 1fr", "gap": 8, "borderTopWidth": 1, "borderStyle": "solid",
                       "borderColor": "line", "borderLeftWidth": 0, "borderRightWidth": 0, "borderBottomWidth": 0,
                       "paddingTop": 26, "marginTop": 26}))
        elif el.name == "div" and "grid-4" in cls and el.find("div", class_="interval-card", recursive=False):
            # Mileage cards: a small accent label over a list — Card lists, interval style.
            items = []
            for card in el.find_all("div", class_="interval-card", recursive=False):
                mi, ul = [x for x in card.children if isinstance(x, Tag)]
                assert "mi" in mi.get("class", []) and ul.name == "ul"
                items.append({"title": plain(mi), "points": [{"text": plain(li)} for li in ul.find_all("li")]})
            out.append(n(nid("cards"), "card-lists", {"variant": "interval", "items": items}))
        elif el.name == "div" and ("grid-2" in cls or "grid-3" in cls) and all(
                [x.name for x in card.children if isinstance(x, Tag)] == ["h3", "p"]
                for card in el.find_all("div", class_="factor-card", recursive=False)) and el.find("div", class_="factor-card", recursive=False):
            # Title-and-sentence cards two or three across: the Feature list, as the four-up
            # grid is — unless a card's sentence carries a link, which a Feature list item
            # cannot hold; those are Card lists in the feature style.
            cards = el.find_all("div", class_="factor-card", recursive=False)
            cols = 2 if "grid-2" in cls else 3
            if any(card.find("p").find("a") for card in cards):
                out.append(n(nid("cards"), "card-lists", {"variant": "feature" if cols == 3 else "feature2", "items": [
                    {"title": plain(card.find("h3")), "intro": inline_html(card.find("p")), "points": []} for card in cards]}))
            else:
                out.append(n(nid("features"), "list", {"headingLevel": 2, "columns": cols, "items": [
                    {"label": plain(card.find("h3")), "desc": plain(card.find("p"))} for card in cards]}))
            fs = re.search(r"font-size:\s*([0-9.]+)px", cards[0].find("p").get("style", ""))
            if fs and fs.group(1) != "14.5":
                extra_css.append(f'[data-bz-node="art-body"] .bz-block--list .bz-feature__d {{ font-size: {fs.group(1)}px; }}')
        elif el.name == "div" and "grid-4" in cls and el.find("div", class_="feature-card", recursive=False):
            # One-line feature tiles: a Feature list of titles only, set as plain text.
            items = [{"label": plain(x)} for x in el.find_all("div", class_="feature-card", recursive=False)]
            out.append(n(nid("features"), "list", {"headingLevel": 2, "columns": 4, "items": items}))
            extra_css.append('/* Its four-up tiles are one line of body text each, not a title. */\n'
                             '[data-bz-node="art-body"] .bz-block--list .bz-feature { padding: 22px; }\n'
                             '[data-bz-node="art-body"] .bz-block--list .bz-feature__t { font: 400 16px / 1.7 var(--font-body); color: var(--body-text); margin: 0; }')
        elif el.name == "div" and "mistake-head" in cls:
            # A numbered section heading: the number badge and a real heading block side
            # by side, so the heading keeps its anchor for the rail and stays editable.
            num, h = el.find("span", class_="mistake-num"), el.find("h2")
            sec = h["id"]
            out.append(row(f"mh-{sec}", [
                col(f"mh-{sec}-badge", [text(f"mh-{sec}-num", plain(num), styles={
                    "background": "accent", "textColor": "card", "fontSize": 16, "fontWeight": "800",
                    "width": 36, "height": 36, "display": "flex", "alignItems": "center", "justifyContent": "center"})],
                    span=1, styles={"flexShrink": 0, "marginRight": 12}),
                col(f"mh-{sec}-col", [n(f"h-{sec}", "heading", {"text": plain(h), "headingLevel": 2, "align": "left", "anchor": sec})],
                    span=11, styles={"flexGrow": 1}),
            ], styles={"display": "flex", "alignItems": "center", "marginTop": 48, "marginBottom": 16}))
        elif el.name == "div" and "pro-tip" in cls:
            cid = nid("tip")
            out.append(row(f"{cid}-row", [col(cid, [text(f"{cid}-text", inline_html(el))], styles={
                "borderLeftWidth": 3, "borderTopWidth": 0, "borderRightWidth": 0, "borderBottomWidth": 0,
                "borderStyle": "solid", "borderColor": "accent", "paddingTop": 4, "paddingBottom": 4,
                "paddingLeft": 18, "marginBottom": 18, "fontSize": 15, "lineHeight": 1.8})]))
        elif el.name == "div" and "grid-4" in cls:
            # Title-and-sentence cards four across: the platform's Feature list.
            items = []
            for card in el.find_all("div", class_="factor-card", recursive=False):
                h, p = [x for x in card.children if isinstance(x, Tag)]
                assert h.name == "h3" and p.name == "p", (h.name, p.name)
                items.append({"label": plain(h), "desc": plain(p)})
            out.append(n(nid("features"), "list", {"headingLevel": 2, "columns": 4, "items": items}))
        elif el.name == "div" and ("compare-grid" in cls or "pm-grid" in cls):
            # Titled cards each holding a list: the Card lists widget, one item per card.
            items = []
            for card in [x for x in el.children if isinstance(x, Tag)]:
                it = {"title": "", "points": []}
                for x in [x for x in card.children if isinstance(x, Tag)]:
                    if x.name == "h3": it["title"] = plain(x)
                    elif x.name == "p": it["intro"] = plain(x)
                    elif x.name == "ul": it["points"] = [{"text": plain(li)} for li in x.find_all("li")]
                    else: raise SystemExit(f"card child <{x.name}>")
                items.append(it)
            out.append(n(nid("cards"), "card-lists", {"variant": "compare" if "compare-grid" in cls else "group", "items": items}))
        elif el.name == "div" and "stat-band" in cls:
            stats = []
            for cell in el.find_all("div", class_="stat-cell", recursive=False):
                v, l = [x for x in cell.children if isinstance(x, Tag)]
                stats.append({"value": plain(v), "label": plain(l)})
            out.append(n(nid("stats"), "statBand", {"stats": stats}))
        elif el.name == "div" and el.find("img") and "margin: 8px 0 24px" in st:
            # A photograph shown whole rather than cropped, with its own margins.
            fig += 1
            img = el.find("img")
            out.append(row(f"fig-{fig}-row", [col(f"fig-{fig}-col", [
                n(f"fig-{fig}", "image", {"width": "full", "image": {**place_image(slug, img["src"], str(fig)), "alt": img.get("alt", "")}})
            ], styles={"marginTop": 8, "marginBottom": 24, "radius": 4, "overflow": "hidden"})]))
        elif el.name == "div" and "checklist-group" in cls:
            cid = nid("group")
            label, ul = [c for c in el.children if isinstance(c, Tag)]
            assert label.name == "div" and ul.name == "ul"
            out.append(row(f"{cid}-row", [col(cid, [
                text(f"{cid}-label", plain(label), styles={"fontSize": 12, "fontWeight": "700", "letterSpacing": 1,
                                                          "textColor": "ink", "marginBottom": 10}),
                n(f"{cid}-list", "prose-list", {"ordered": False, "items": [{"text": inline_html(li)} for li in ul.find_all("li")]}),
            ], styles={**BOX, "paddingTop": 20, "paddingRight": 22, "paddingBottom": 20, "paddingLeft": 22, "marginBottom": 16})]))
        elif el.name == "div" and "grid-2" in cls:
            cid = nid("cards"); cols = []
            for i, card in enumerate(el.find_all("div", class_="factor-card", recursive=False)):
                kids = []
                for j, c in enumerate([c for c in card.children if isinstance(c, Tag)]):
                    if c.name == "ul":
                        kids.append(n(f"{cid}-{i+1}-list", "prose-list", {"ordered": False, "items": [{"text": inline_html(li)} for li in c.find_all("li")]}))
                    elif c.name == "h3":
                        kids.append(n(f"{cid}-{i+1}-h", "heading", {"text": plain(c), "headingLevel": 3, "align": "left"}))
                    elif c.name == "p":
                        kids.append(text(f"{cid}-{i+1}-p{j}", inline_html(c)))
                    else:
                        raise SystemExit(f"factor-card child <{c.name}>")
                cols.append(col(f"{cid}-{i+1}", kids, span=6, styles={**BOX, "paddingTop": 22, "paddingRight": 22, "paddingBottom": 22, "paddingLeft": 22}))
            out.append(row(cid, cols, gap=4, styles={"marginBottom": 20}))
        else:
            raise SystemExit(f"{slug}: unhandled body element <{el.name} class={cls} style={st[:60]}>")

    post_url = "https://www.sunstateintl.com/blog/posts/" + slug
    U = urllib.parse.quote(post_url, safe=""); T = urllib.parse.quote(h1, safe="")
    if share is not None:
        labels = [plain(a) for a in share.find_all("a")]
        assert labels == ["Facebook", "X", "LinkedIn", "Email"], labels
        out.append(n("art-share", "post-share", {"label": "Share", "items": [
            {"label": "Facebook", "url": f"https://www.facebook.com/sharer/sharer.php?u={U}", "newTab": True},
            {"label": "X", "url": f"https://x.com/intent/tweet?url={U}&text={T}", "newTab": True},
            {"label": "LinkedIn", "url": f"https://www.linkedin.com/sharing/share-offsite/?url={U}", "newTab": True},
            {"label": "Email", "url": f"mailto:?subject={T}&body={U}", "newTab": False}]}))

    article = n("article", "section", {"width": "boxed", "background": "card", "paddingY": 8},
                [row("art-row", [side, col("art-body", out, span=9)], gap=8)])

    # --- after the article: Keep reading, then the CTA band
    secs = main.find_all("section", recursive=False)
    extra = [x for x in secs if "More from the blog" not in x.get_text() and x is not secs[-1]]
    if extra:
        raise SystemExit(f"{slug}: unexpected section {extra[0].get_text()[:60]}")
    kr = [x for x in secs if "More from the blog" in x.get_text()][0]
    assert plain(kr.find("h2")) == "More from the blog."
    related = n("related", "section", {"width": "boxed", "background": "paper", "paddingY": 10}, [
        row("related-row", [col("related-col", [
            n("related-h", "heading", {"text": "More from the blog.", "headingLevel": 2, "align": "left", "eyebrow": "Keep reading"}),
            n("related-posts", "postsList", {"count": 4, "showDates": True, "headingLevel": 3}),
            n("related-cta", "buttons", {"align": "left", "items": [cta("All blog posts →", "/blog", "link")]}),
        ])], gap=5)])

    band = secs[-1]
    eyebrow = plain(band.find("div").find("div"))
    heading = plain(band.find("h2"))
    bodyp = plain(band.find("p"))
    btns = band.find_all("a")
    post_cta = n("post-cta", "sharedSection", {"sectionId": "cta-band", "values": {
        "eyebrow": eyebrow.capitalize() if eyebrow.isupper() else eyebrow, "heading": heading, "body": bodyp,
        "primaryLabel": plain(btns[0]), "primaryUrl": href_of(btns[0]),
        "secondaryLabel": plain(btns[1]), "secondaryUrl": href_of(btns[1])}}, [])

    # A post's own FAQ: the platform FAQ widget, which draws the accordion the design
    # draws and emits the FAQPage structured data from the same items.
    faq_sec = main.select_one("section#post-faq")
    faq = []
    if faq_sec is not None:
        eyebrow_el = faq_sec.find("div")
        items = []
        for trig in faq_sec.select("[data-disclosure]"):
            panel = faq_sec.find(id=trig["aria-controls"])
            items.append({"q": plain(trig.find("span")), "a": plain(panel)})
        eb = plain(eyebrow_el)
        faq = [n("faq", "section", {"width": "boxed", "background": "card", "paddingY": 0, "anchor": "post-faq"}, [
            row("faq-row", [col("faq-col", [
                n("faq-h", "heading", {"text": plain(faq_sec.find("h2")), "headingLevel": 2, "align": "left",
                                       "eyebrow": eb.capitalize() if eb.isupper() else eb}),
                n("faq-list", "widget", {"widget": "faq", "config": {"items": items}}),
            ])], gap=5)])]
    nodes = [hero_node, article, *faq, related, post_cta]
    # A post built before the converter keeps its node ids where the converter names the
    # same node differently: a changed id reads as delete-and-add, and loses the history.
    alias = ID_ALIASES.get(slug, {})
    def rename(ns):
        for x in ns:
            x["id"] = alias.get(x["id"], x["id"]); rename(x.get("children", []))
    rename(nodes)
    # every id unique
    seen = set()
    def walk(ns):
        for x in ns:
            assert x["id"] not in seen, (slug, x["id"]); seen.add(x["id"]); walk(x.get("children", []))
    walk(nodes)

    if re.search(r"\.factor-card p\s*\{[^}]*line-height:\s*1\.7", own_style) and any(x["type"] == "list" for x in out):
        extra_css.append('[data-bz-node="art-body"] .bz-block--list .bz-feature__t { margin: 0 0 8px; }\n'
                         '[data-bz-node="art-body"] .bz-block--list .bz-feature__d { line-height: 1.7; }')
    m = re.search(r"\.factor-card\s*\{[^}]*padding:\s*([0-9]+)px", own_style)
    if m and m.group(1) != "20" and any(x["type"] == "list" for x in out):
        extra_css.append(f'[data-bz-node="art-body"] .bz-block--list .bz-feature {{ padding: {m.group(1)}px; }}')
    if (slug not in POST_CSS and any(x["type"] == "compare-table" for x in out)
            and re.search(r"\.compare-table th\s*\{[^}]*border-bottom:\s*2px solid var\(--color-ink\)", own_style)):
        extra_css.append("/* Its comparison is ruled in ink under sentence-case headings, with roomier cells. */\n"
                         '[data-bz-node="art-body"] .ss-cmp { margin-bottom: 20px; }\n'
                         '[data-bz-node="art-body"] .ss-cmp thead th { letter-spacing: .1em; text-transform: none; border-bottom: 2px solid var(--ink); }\n'
                         '[data-bz-node="art-body"] .ss-cmp tbody th,\n'
                         '[data-bz-node="art-body"] .ss-cmp td { padding: 14px; font-size: 15px; line-height: 1.3; }\n'
                         '[data-bz-node="art-body"] .ss-cmp tbody th { width: auto; }\n'
                         '@media (max-width: 640px) { [data-bz-node="art-body"] .ss-cmp th, [data-bz-node="art-body"] .ss-cmp td { font-size: 13px; } }')
    if re.search(r"\.stat-band\{[^}]*grid-template-columns:\s*1fr;", own_style):
        extra_css.append('/* Its stat band stacks the figures, one per row. */\n'
                         '[data-bz-node="art-body"] .bz-block--statBand .bz-stats { grid-template-columns: minmax(0, 1fr); }')
    desc = s.find("meta", attrs={"name": "description"})["content"]
    pub = s.find("meta", attrs={"property": "article:published_time"})
    kw = re.search(r'"keywords":\s*"([^"]*)"', str(s))
    lede = body.select_one("#post-lede") or body.find("p")
    lede_text = plain(lede)
    excerpt = lede_text if len(lede_text) <= 210 else lede_text[:210].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return slug, {"topic": topic_chip.title().replace("&Amp;", "&"), "excerpt": excerpt, "css_extra": "".join("\n" + x + "\n" for x in dict.fromkeys(extra_css)), "title": h1, "description": desc, "coverImage": cover_src,
                  "date": pub["content"][:10] if pub else None,
                  "keywords": [k.strip() for k in kw.group(1).split(",")] if kw else None,
                  "nodes": nodes}


# What one post's own <style> block sets differently from the rest.
POST_CSS = {
    "common-problems-with-air-brake-parts-for-semi-trucks":
        "\n/* This article's lists run at a looser 1.8 leading than the other posts'. */\n"
        '[data-bz-node="art-body"] .ss-prose-list li { line-height: 1.8; }\n',
    "dry-van-trailer-specifications-explained-simply":
        "\n/* Its type cards set their sentences small, and their lists at 14px. */\n"
        '[data-bz-node="art-body"] .ss-cl--type3 .ss-cl__p { font-size: 13px; line-height: 1.8; letter-spacing: .04em; margin: 0 0 6px; }\n'
        '[data-bz-node="art-body"] .bz-col .ss-prose-list { padding-left: 18px; }\n'
        '[data-bz-node="art-body"] .bz-col .ss-prose-list li { font-size: 14px; }\n',
    "semi-truck-maintenance-mistakes-that-cost-fleets-thousands":
        "\n/* This article sets its headings a step smaller and closer, to suit seven numbered ones. */\n"
        '[data-bz-node="art-body"] > .bz-block--heading h2,\n'
        '[data-bz-node="art-body"] .bz-col > .bz-block--heading h2 { font-size: 26px; }\n'
        '[data-bz-node="art-body"] > .bz-block--heading h2 { margin-top: 48px; }\n'
        "@media (max-width: 640px) {\n"
        '  [data-bz-node="art-body"] > .bz-block--heading h2,\n'
        '  [data-bz-node="art-body"] .bz-col > .bz-block--heading h2 { font-size: 21px; }\n'
        "}\n",
    "are-aftermarket-semi-truck-parts-as-reliable-as-oem":
        "\n/* This article's comparison is ruled in ink under sentence-case headings, with roomier cells. */\n"
        '[data-bz-node="art-body"] .ss-cmp { margin-bottom: 34px; }\n'
        '[data-bz-node="art-body"] .ss-cmp thead th { line-height: 1.3; text-transform: none; border-bottom: 2px solid var(--ink); }\n'
        '[data-bz-node="art-body"] .ss-cmp tbody th,\n'
        '[data-bz-node="art-body"] .ss-cmp td { padding: 14px; }\n'
        '[data-bz-node="art-body"] .ss-cmp tbody th { width: auto; white-space: nowrap; }\n'
        '@media (max-width: 640px) { [data-bz-node="art-body"] .ss-cmp th, [data-bz-node="art-body"] .ss-cmp td { font-size: 12.5px; } }\n',
}


def update_listing(meta):
    """The blog page's Latest posts rail and its topic chips.

    This renderer has no `posts` data source and no pager block, so the rail's
    `posts` list is written here, one row per published post, newest first, from
    the post files themselves: title, date, topic and cover from the post, and
    the listing's excerpt from the post's own `excerpt`, which convert() writes.
    Every post is a card and the topic chips filter them in place. Rerun this
    after adding a post so its card appears. The chips are derived from the
    topics in play so a new topic gets one."""
    import datetime
    p = f"{REPO}/site/pages/blog/page.json"
    page = json.load(open(p))
    rail = [x for x in page["nodes"] if x["id"] == "bl-posts"][0]
    key = lambda t: re.sub(r"[^a-z0-9]+", "-", t.lower().replace("&", "and")).strip("-")
    topics, rows = set(), []
    for f in glob.glob(f"{REPO}/site/blog/posts/*.json"):
        d = json.load(open(f))
        if d.get("status", "published") != "published":
            continue
        topics.add(d["topic"])
        day = datetime.date.fromisoformat(d["date"][:10])
        row = {"topic": d["topic"], "topicKey": key(d["topic"]),
               "date": f"{day:%b} {day.day}, {day.year}", "dateISO": day.isoformat(),
               "title": d["title"], "href": f"/blog/posts/{d['slug']}", "excerpt": d.get("excerpt", "")}
        if d.get("coverImage"):
            row["coverImage"] = {"src": d["coverImage"], "alt": d["title"]}
        rows.append(row)
    rows.sort(key=lambda r: (r["dateISO"], r["title"]), reverse=True)
    rail["props"]["values"]["posts"] = rows
    chips = ["Parts", "Commercial trucks", "Service", "Maintenance", "Company", "Sales", "Trucks", "Parts & Service", "Fleet"]
    chips += sorted(topics - set(chips))
    rail["props"]["values"]["topics"] = [{"label": t, "value": key(t)} for t in chips]
    # The pager band drew a block this renderer does not have; every card is on the one page.
    page["nodes"] = [x for x in page["nodes"] if x["id"] != "bl-pager"]
    json.dump(page, open(p, "w"), indent=2, ensure_ascii=False); open(p, "a").write("\n")
    print(f"blog page: {len(topics)} topics; {len(rows)} cards from the post files")


def related_css(slug):
    sel = f'[data-bz-node="related-posts"] .bz-card[href$="/{slug}"]'
    return (f"/* Latest posts cannot leave out the post being read, so it asks for four and\n"
            f"   this post's own card is hidden (or, when it is not among them, the fourth). */\n"
            f"{sel} {{ display: none; }}\n"
            f'[data-bz-node="related-posts"] .bz-grid:not(:has(.bz-card[href$="/{slug}"])) > .bz-card:nth-child(n+4) {{ display: none; }}\n')


if __name__ == "__main__":
    # Topic, date and excerpt per post, as the handoff's blog.html (Part 1) lists them.
    meta = json.load(open(os.path.join(os.path.dirname(__file__), "blog-cards.json")))
    # Parts 1-6 keep their articles in posts/; a prototype batch keeps them beside index.html.
    files = sorted(glob.glob(f"{PART}/posts/*.html")) or sorted(
        f for f in glob.glob(f"{PART}/*.html") if os.path.basename(f) != "index.html")
    if not files and "hero--post" in open(f"{PART}/index.html").read():
        files = [f"{PART}/index.html"]  # a standalone handoff: the one page is the post
    for f in files:
        h1 = BeautifulSoup(open(f).read(), "html.parser").select_one("section.post-hero h1, section.hero--post h1")
        POST_TITLES[plain(h1)] = page_slug(f)
        # the design page's file name is the title without its question mark or subtitle
        POST_TITLES[plain(h1).split("?")[0].split(":")[0].strip()] = page_slug(f)
    for f in files:
        if os.path.basename(PART.rstrip("/")) in REPEATS and os.path.basename(f) in REPEATS[os.path.basename(PART.rstrip("/"))]:
            print(f"kept    {page_slug(f)} (a repeat of the earlier handoff's page)")
            continue
        slug, c = convert(f)
        p = f"{REPO}/site/blog/posts/{slug}.json"
        old = json.load(open(p)) if os.path.exists(p) else {}
        if slug not in meta:
            # Not in the Part 1 listing: the card's topic, date and excerpt come from the page —
            # the hero's topic chip, the publish date, and the lede cut the way the listing cuts it.
            meta[slug] = {"topic": c["topic"], "dateISO": c["date"], "excerpt": c["excerpt"]}
            json.dump(meta, open(os.path.join(os.path.dirname(__file__), "blog-cards.json"), "w"), indent=1, ensure_ascii=False)
        card = meta[slug]
        post = {
            "slug": slug, "title": c["title"], "date": c["date"],
            "description": c["description"], "excerpt": card["excerpt"],
            "status": old.get("status", "published"), "coverImage": c["coverImage"],
            "topic": card["topic"],
        }
        if not post["coverImage"]:
            del post["coverImage"]
        kws = c["keywords"] or old.get("keywords")
        if kws:
            post["keywords"] = kws
        post["nodes"] = c["nodes"]
        post["css"] = related_css(slug) + POST_CSS.get(slug, "") + c["css_extra"]
        json.dump(post, open(p, "w"), indent=2, ensure_ascii=False); open(p, "a").write("\n")
        print(("updated " if old else "new     ") + slug)
    update_listing(meta)
