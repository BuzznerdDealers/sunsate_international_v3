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
    "tel:8007417566": "tel:+18007417566",
}
INTENT = {
    "/service-appointment": "book-service", "/service": "book-service", "/parts": "browse-parts",
    "https://www.sunstateparts.com/login": "browse-parts", "/contact": "contact-dealer",
    "/locations/trailer-sales": "find-location", "/blog": "read-post",
}


def map_href(h):
    if h.startswith("../posts/") or h.startswith("posts/") or "/posts/" in h and h.endswith(".html"):
        return "/blog/posts/" + h.rsplit("/", 1)[1][:-5]
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
    "/contact": "contact-us", "/blog": "all-blog-posts",
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
            out.append(str(c).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
        elif c.name == "a":
            out.append(f'<a href="{map_href(c["href"])}">{inline_html(c)}</a>')
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


def place_image(slug, src, name):
    fname = os.path.basename(src)
    os.makedirs(IMG_DST + slug, exist_ok=True)
    dst = f"{IMG_DST}{slug}/{name}.jpg"
    shutil.copyfile(IMG_SRC + fname, dst)
    w, h = jpeg_size(dst)
    return {"src": f"/img/blog/{slug}/{name}.jpg", "width": w, "height": h}


# Node styles, in the design-system tokens the inspector offers.
BOX = {"borderWidth": 1, "borderStyle": "solid", "borderColor": "line"}
LABEL = {"fontSize": 10, "fontWeight": "700", "letterSpacing": 1, "textTransform": "uppercase",
         "textColor": "accent", "marginBottom": 10}


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
            kids.append(n(f"{cid}-cta", "buttons", {"align": "left", "items": [cta(plain(c), map_href(c["href"]), "link")]}))
        else:
            raise SystemExit(f"callout child <{c.name}>")
    m = re.search(r"margin:\s*([0-9]+)px(?:\s+0)?\s*([0-9]+)?px?", style)
    top = int(m.group(1)) if m else 34
    bottom = int(m.group(2)) if m and m.group(2) else top
    return row(f"{cid}-row", [col(cid, kids, styles={**BOX, "paddingTop": 26, "paddingRight": 28, "paddingBottom": 26,
                                                      "paddingLeft": 28, "marginTop": top, "marginBottom": bottom})])


def convert(path):
    slug = os.path.basename(path)[:-5]
    s = BeautifulSoup(open(path).read(), "html.parser")
    main = s.find("main")
    hero = main.select_one("section.post-hero")
    hero_img = hero.find("img")
    crumbs = hero.find("nav").find_all(["a", "span"])
    crumb3 = plain(crumbs[-1])
    h1 = plain(hero.find("h1"))
    byline = [plain(x) for x in hero.find("h1").find_next_sibling("div").find_all("span") if plain(x) != "·"]
    topic_chip, date_txt, read_txt, author = byline
    cover = place_image(slug, hero_img["src"], "hero")

    title_case = lambda t: " ".join(w.capitalize() if w.isupper() else w for w in t.split())
    hero_node = n("hero", "sharedSection", {"sectionId": "post-hero", "values": {
        "breadcrumb": f'<a href="/">Home</a> / <a href="/blog">Blog</a> / {title_case(crumb3.title())}',
        "title": h1, "topic": topic_chip.title().replace("&Amp;", "&"), "date": date_txt.title(),
        "readTime": read_txt.lower(), "author": title_case(author.title()),
        "image": {**cover, "alt": hero_img.get("alt", "")}}}, [])

    # --- the rail
    toc = main.select_one("aside.post-toc")
    items = [{"label": plain(a), "href": a["href"]} for a in toc.select("a.toc__link")]
    box = toc.find("div", style=re.compile("margin-top: 26px"))
    bparts = [c for c in box.children if isinstance(c, Tag)]
    aside = col("art-aside", [
        text("aside-label", plain(bparts[0]), styles=LABEL),
        text("aside-body", inline_html(bparts[1]), styles={"fontSize": 14, "lineHeight": 1.65, "marginBottom": 14}),
        n("aside-cta", "buttons", {"align": "left", "items": [cta(plain(bparts[2]), map_href(bparts[2]["href"]), "link")]}),
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
    for el in body.children:
        if not isinstance(el, Tag):
            continue
        st = el.get("style", "")
        cls = el.get("class", [])
        if el.name == "p":
            if el.get("id") == "post-lede":
                out.append(text("lede", inline_html(el), anchor="post-lede"))
            else:
                out.append(text(nid("p"), inline_html(el)))
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
            out.append(n(nid("checks"), "check-list", {"items": rows}))
        elif el.name == "div" and el.find("img") and "position: relative" in st:
            fig += 1
            img = el.find("img")
            out.append(n(f"fig-{fig}", "image", {"width": "full", "image": {**place_image(slug, img["src"], str(fig)), "alt": img.get("alt", "")}}))
        elif el.name == "div" and "border: 1px" in st:
            out.append(callout(nid("co"), el, st))
        elif el.name == "div" and "border-top" in st and "display: flex" in st:
            share = el
        elif el.name == "div" and "display: flex" in st:
            its = []
            for a in el.find_all("a"):
                style = "primary" if "hv-2" in a.get("class", []) else "secondary"
                its.append(cta(plain(a), map_href(a["href"]), style))
            out.append(n(nid("actions"), "buttons", {"align": "left", "items": its}))
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
        "primaryLabel": plain(btns[0]), "primaryUrl": map_href(btns[0]["href"]),
        "secondaryLabel": plain(btns[1]), "secondaryUrl": map_href(btns[1]["href"])}}, [])

    nodes = [hero_node, article, related, post_cta]
    # every id unique
    seen = set()
    def walk(ns):
        for x in ns:
            assert x["id"] not in seen, (slug, x["id"]); seen.add(x["id"]); walk(x.get("children", []))
    walk(nodes)

    desc = s.find("meta", attrs={"name": "description"})["content"]
    pub = s.find("meta", attrs={"property": "article:published_time"})
    kw = re.search(r'"keywords":\s*"([^"]*)"', str(s))
    return slug, {"title": h1, "description": desc, "coverImage": cover["src"],
                  "date": pub["content"][:10] if pub else None,
                  "keywords": [k.strip() for k in kw.group(1).split(",")] if kw else None,
                  "nodes": nodes}


# What one post's own <style> block sets differently from the rest.
POST_CSS = {
    "common-problems-with-air-brake-parts-for-semi-trucks":
        "\n/* This article's lists run at a looser 1.8 leading than the other posts'. */\n"
        '[data-bz-node="art-body"] .ss-prose-list li { line-height: 1.8; }\n',
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
    files = sorted(glob.glob(f"{PART}/posts/*.html"))
    for f in files:
        slug, c = convert(f)
        p = f"{REPO}/site/blog/posts/{slug}.json"
        old = json.load(open(p)) if os.path.exists(p) else {}
        card = meta[slug]
        post = {
            "slug": slug, "title": c["title"], "date": c["date"],
            "description": c["description"], "status": "published", "coverImage": c["coverImage"],
            "topic": card["topic"],
        }
        kws = c["keywords"] or old.get("keywords")
        if kws:
            post["keywords"] = kws
        post["nodes"] = c["nodes"]
        post["css"] = related_css(slug) + POST_CSS.get(slug, "")
        json.dump(post, open(p, "w"), indent=2, ensure_ascii=False); open(p, "a").write("\n")
        print(("updated " if old else "new     ") + slug)
    update_listing(meta)
