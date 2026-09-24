"""Blog handoff (Part N of 6) -> site/blog/posts/<slug>.json, and the blog page's cards.

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
    "Financing.dc.html": "/financing",
    # No trailer-specifications page exists on this site; each listing carries its specs.
    "Trailer Specifications.dc.html": "/store/inventory?type=trailer",
}
POST_TITLES = {}  # "Blog Post - <title>.dc.html" -> slug, filled from the handoff's own pages


def dc_href(h, label):
    name = urllib.parse.unquote(h.rsplit("/", 1)[-1])
    if name in DC_PAGES:
        return DC_PAGES[name]
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


def href_of(a):
    return map_href(a["href"], plain(a))


def map_href(h, label=None):
    if h.endswith(".dc.html"):
        return dc_href(h, label)
    if h.endswith("blog.html"):
        return "/blog"
    if h.endswith(".html") and ("/posts/" in h or "/" not in h):
        return "/blog/posts/" + h.rsplit("/", 1)[-1][:-5]
    if re.match(r"https://([a-z]+\.)?international\.com(/|$)", h):
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
    "/store/inventory?condition=new": "browse-new-trucks",
    "/store/inventory?type=trailer": "browse-trailers",
    "/locations/trailer-sales": "trailer-sales-location",
    "/store/inventory?type=trailer&condition=new": "browse-new-trailers",
    "/store/inventory?type=trailer&condition=used": "browse-used-trailers", "/financing": "financing", "/reviews": "read-reviews",
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
    assert source.lower().endswith((".jpg", ".jpeg")), source
    shutil.copyfile(source, dst)
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
    m = re.search(r"margin:\s*([0-9]+)px(?:\s+0)?\s*([0-9]+)?px?", style)
    top = int(m.group(1)) if m else 34
    bottom = int(m.group(2)) if m and m.group(2) else top
    return top, bottom


def callout(cid, box, style):
    """A bordered callout: an optional micro-label, an optional paragraph, a link."""
    kids = []
    for c in box.children:
        if not isinstance(c, Tag):
            continue
        if c.name == "div":
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

RUNS = {"stage-row": "stages", "problem-card": "stacked", "repair-card": "inline", "step-row": "steps", "faq-item": "qa"}


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


def convert(path):
    global PAGE_DIR
    PAGE_DIR = os.path.dirname(path)
    slug = os.path.basename(path)[:-5]
    raw = open(path).read()
    s = BeautifulSoup(raw, "html.parser")
    own_style = re.search(r"<style>(.*?)</style>", raw, re.S).group(1)
    extra_css = []
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
        if x.name == "div" and not x.get("class") and kids and all("stage-row" in k.get("class", []) for k in kids):
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
                out.append(n(nid("questions"), "qa-list", {"items": [{"q": plain(x.find("h3")), "a": plain(x.find("p"))} for x in els]}))
            continue
        st = el.get("style", "")
        cls = el.get("class", [])
        if el.name == "p":
            if el.get("id") == "post-lede":
                out.append(text("lede", inline_html(el), anchor="post-lede"))
            elif pending_anchor:
                out.append(text(nid("p"), inline_html(el), anchor=pending_anchor)); pending_anchor = None
            else:
                out.append(text(nid("p"), inline_html(el)))
        elif el.name == "h2" and not plain(el) and "display:none" in st.replace(" ", ""):
            # An empty, hidden heading kept only as the rail's link target: the anchor moves
            # to the paragraph it introduces, so the link still lands and no blank heading ships.
            sec = el["id"]; pending_anchor = sec
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
            out.append(n(nid("checks"), "check-list", {**({"mark": "cross"} if "redflag-table" in cls else {}), "items": rows}))
        elif el.name == "div" and el.find("img") and "position: relative" in st:
            fig += 1
            img = el.find("img")
            out.append(n(f"fig-{fig}", "image", {"width": "full", "image": {**place_image(slug, img["src"], str(fig)), "alt": img.get("alt", "")}}))
        elif el.name == "div" and "border: 1px" in st:
            out.append(callout(nid("co"), el, st))
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
                kids = [n(f"{cid}-cta", "buttons", {"align": "left", "items": [cta(plain(a), href_of(a), "link") for a in anchors]})]
            top, bottom = margins(st)
            out.append(row(f"{cid}-row", [col(cid, kids, styles={"marginTop": top, "marginBottom": bottom})]))
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
            assert len(heads) == 3, heads
            rows = [[plain(td) for td in tr.find_all("td")] for tr in el.select("tbody tr")]
            assert all(len(r) == 3 for r in rows), rows
            out.append(n(nid("compare"), "compare-table", {"headA": heads[0], "headB": heads[1], "headC": heads[2],
                                                          "rows": [{"a": a, "b": b, "c": c} for a, b, c in rows]}))
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
            variant = "option" if "option-card" in cards[0].get("class", []) else "type"
            items = []
            for card in cards:
                it = {"title": "", "points": []}
                for x in [x for x in card.children if isinstance(x, Tag)]:
                    if x.name == "h3": it["title"] = plain(x)
                    elif x.name == "p" and "intro" not in it and not (x.get("style") and "font-weight: 700" in x["style"]): it["intro"] = inline_html(x)
                    elif x.name in ("p", "div") and not it["points"]: it["lead"] = plain(x)
                    elif x.name == "ul": it["points"] = [{"text": inline_html(li)} for li in x.find_all("li")]
                    else: raise SystemExit(f"card child <{x.name}>")
                items.append(it)
            out.append(n(nid("cards"), "card-lists", {"variant": variant, "items": items}))
            if variant == "type" and re.search(r"\.type-card ul li\s*\{\s*font-size:\s*14px", own_style):
                extra_css.append('[data-bz-node="art-body"] .ss-cl--type .ss-cl__list { margin: 0; }\n'
                                 '[data-bz-node="art-body"] .ss-cl--type .ss-cl__list li { font-size: 14px; }')
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
    """The blog page's Latest posts rail: one card per published post, newest first.

    The cards are typed rows because this renderer has no `posts` data source yet.
    A card that already has a cover image keeps it — that is the dealer's choice
    from the Media Bin — and a new one takes the post's hero photograph."""
    p = f"{REPO}/site/pages/blog/page.json"
    page = json.load(open(p))
    rail = [x for x in page["nodes"] if x["id"] == "bl-posts"][0]
    old = {r["href"].rsplit("/", 1)[1]: r for r in rail["props"]["values"]["posts"]}
    key = lambda t: re.sub(r"[^a-z0-9]+", "-", t.lower().replace("&", "and")).strip("-")
    rows = []
    for f in glob.glob(f"{REPO}/site/blog/posts/*.json"):
        d = json.load(open(f))
        if d.get("status", "published") != "published":
            continue
        slug, o = d["slug"], old.get(d["slug"], {})
        y, m, dd = map(int, d["date"].split("-"))
        import datetime
        dt = datetime.date(y, m, dd)
        row = {"topic": d["topic"], "topicKey": key(d["topic"]), "date": f"{dt:%b} {dt.day}, {dt:%Y}",
               "dateISO": d["date"], "title": d["title"], "href": "/blog/posts/" + slug,
               "excerpt": meta[slug]["excerpt"] if slug in meta else o.get("excerpt", "")}
        if o.get("coverImage"):
            row["coverImage"] = o["coverImage"]
        elif d.get("coverImage"):
            hero = d["nodes"][0]["props"].get("values", {}).get("image", {})
            row["coverImage"] = {"src": d["coverImage"], "alt": d["title"],
                                 **({"width": hero["width"], "height": hero["height"]} if hero.get("src") == d["coverImage"] else {})}
        rows.append(row)
    rows.sort(key=lambda r: r["dateISO"], reverse=True)
    rail["props"]["values"]["posts"] = rows
    chips = ["Parts", "Commercial trucks", "Service", "Maintenance", "Company", "Sales", "Trucks", "Parts & Service", "Fleet"]
    chips += sorted({r["topic"] for r in rows} - set(chips))
    rail["props"]["values"]["topics"] = [{"label": t, "value": key(t)} for t in chips]
    json.dump(page, open(p, "w"), indent=2, ensure_ascii=False); open(p, "a").write("\n")
    print(f"blog page: {len(rows)} cards")


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
    for f in files:
        h1 = BeautifulSoup(open(f).read(), "html.parser").select_one("section.post-hero h1")
        POST_TITLES[plain(h1)] = os.path.basename(f)[:-5]
        # the design page's file name is the title without its question mark or subtitle
        POST_TITLES[plain(h1).split("?")[0].split(":")[0].strip()] = os.path.basename(f)[:-5]
    for f in files:
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
            "description": c["description"], "status": old.get("status", "published"), "coverImage": c["coverImage"],
            "topic": card["topic"],
        }
        kws = c["keywords"] or old.get("keywords")
        if kws:
            post["keywords"] = kws
        post["nodes"] = c["nodes"]
        post["css"] = related_css(slug) + POST_CSS.get(slug, "") + c["css_extra"]
        json.dump(post, open(p, "w"), indent=2, ensure_ascii=False); open(p, "a").write("\n")
        print(("updated " if old else "new     ") + slug)
    update_listing(meta)
