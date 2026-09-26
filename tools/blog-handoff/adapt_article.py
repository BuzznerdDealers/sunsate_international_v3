"""Single-article handoff (plain HTML) -> a one-page batch in the prototype format convert.py reads.

    python3 tools/blog-handoff/adapt_article.py <handoff folder with index.html> <out folder>
    python3 tools/blog-handoff/convert.py <out folder>

Needs BeautifulSoup and Pillow.

Some handoffs arrive as one framework-agnostic page (`index.html`, `css/`, `js/`, `assets/img/`)
instead of a batch of Claude Design prototype pages. The article is the same shape, only named
differently — `.hero--post` for `section.post-hero`, `aside.toc` for `aside.post-toc`,
`.article__body` for `.post-body`, `.figure`, `.grid--2 > .card`, `.callout`,
`.article__actions`, `.share`. This rewrites the page into the prototype markup so the one
converter builds every post, with the same blocks, components and Buttons-library entries.

It also transcodes the photographs: the handoff ships 2000px PNGs (~3 MB each); the posts
here carry 1280px JPEGs. The written page is named after the canonical permalink, which
becomes the post's slug. Anything it does not recognise is an error, as in convert.py.
"""
import os, re, sys
from bs4 import BeautifulSoup, Tag
from PIL import Image

SRC, OUT = sys.argv[1].rstrip("/"), sys.argv[2].rstrip("/")
WIDTH = 1280

# The handoff's flat file names -> the design-page names convert.py already resolves.
PAGES = {
    "home.html": "Home.dc.html", "blog.html": "Blog.dc.html", "service.html": "Service.dc.html",
    "service-appointment.html": "Service Appointment.dc.html", "contact-us.html": "Contact Us.dc.html",
    "trailer-sales.html": "Trailer Sales Location.dc.html", "financing.html": "Financing.dc.html",
}

raw = open(f"{SRC}/index.html").read()
s = BeautifulSoup(raw, "html.parser")
canon = s.find("link", rel="canonical")["href"]
slug = canon.rstrip("/").rsplit("/", 1)[-1]
os.makedirs(f"{OUT}/assets", exist_ok=True)
out = BeautifulSoup("<html><head></head><body><main></main></body></html>", "html.parser")
main = out.main


def tag(name, attrs=None, text=None, kids=()):
    t = out.new_tag(name, attrs=attrs or {})
    if text is not None:
        t.string = text
    for k in kids:
        t.append(k)
    return t


def photo(img):
    """The photograph as a real 1280px JPEG beside the page, named as the handoff names it."""
    src = os.path.join(SRC, img["src"])
    name = os.path.splitext(os.path.basename(src))[0] + ".jpg"
    im = Image.open(src).convert("RGB")
    if im.width > WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    im.save(f"{OUT}/assets/{name}", "JPEG", quality=85, optimize=True)
    return tag("img", {"src": f"assets/{name}", "alt": img.get("alt", "")})


def relink(el):
    """Every link to a design page, by the name convert.py resolves; anything unknown stops."""
    for a in ([el] if el.name == "a" else []) + el.find_all("a", href=True):
        h = a["href"]
        if h.startswith(("#", "tel:", "mailto:", "http")):
            continue
        if h not in PAGES:
            raise SystemExit(f"unmapped link: {h} ({a.get_text(strip=True)})")
        a["href"] = PAGES[h]
    return el


def copy(el):
    return relink(BeautifulSoup(str(el), "html.parser").find(el.name))


# --- head: the page's own meta, canonical and JSON-LD; convert.py reads a <style> block
for x in s.head.find_all(["meta", "link", "script", "title"]):
    if x.name == "link" and "stylesheet" in (x.get("rel") or []):
        continue
    out.head.append(copy(x))
out.head.append(tag("style", text=""))

# --- the hero
h = s.select_one("section.hero--post")
crumbs = copy(h.select_one("nav.breadcrumb"))
byline = tag("div")
for x in h.select_one(".post-byline").find_all(["span", "time"], recursive=False):
    byline.append(tag("span", text=x.get_text(strip=True)))
hero = (tag("section", {"class": "post-hero"}, kids=[
    tag("div", kids=[photo(h.select_one(".hero__media img"))]), crumbs,
    tag("h1", text=h.find("h1").get_text(strip=True)), byline]))


# --- the rail
toc = s.select_one("aside.toc")
nav = tag("nav", {"aria-label": "Table of contents"})
for a in toc.select("nav a[href^='#']"):
    nav.append(tag("a", {"href": a["href"]}, a.get_text(strip=True)))
box = toc.select_one(".toc__aside")
parts = [x for x in box.children if isinstance(x, Tag)]
if [x.name for x in parts] != ["div", "p", "a"]:
    raise SystemExit(f"rail card: {[x.name for x in parts]}")
card = tag("div", {"style": "margin-top: 26px; border: 1px solid var(--color-line); padding: 20px;"},
           kids=[tag("div", text=parts[0].get_text(strip=True)), copy(parts[1]), copy(parts[2])])
aside = tag("aside", {"class": "post-toc"}, kids=[tag("div", text=toc.select_one(".eyebrow").get_text(strip=True)), nav, card])

# --- the body
body = tag("div", {"class": "post-body"})
BTN = "display: inline-flex; align-items: center; justify-content: center; height: 48px; padding: 0 26px; "
for el in [x for x in s.select_one(".article__body").children if isinstance(x, Tag)]:
    cls = el.get("class") or []
    if el.name in ("p", "h2", "h3", "ul", "ol") or (el.name == "table" and "spec-table" in cls):
        body.append(copy(el))
    elif el.name == "figure" and "figure" in cls:
        body.append(tag("div", {"style": "position: relative; margin: 36px 0;"}, kids=[photo(el.find("img"))]))
    elif el.name == "div" and "grid--2" in cls:
        cards = []
        for c in el.find_all("div", class_="card", recursive=False):
            kids = [x for x in c.children if isinstance(x, Tag)]
            if [x.name for x in kids] != ["ul"]:
                raise SystemExit(f"grid card: {[x.name for x in kids]}")
            ul = copy(kids[0]); ul["style"] = "margin: 0;"
            cards.append(tag("div", {"class": "factor-card"}, kids=[ul]))
        body.append(tag("div", {"class": "grid-2"}, kids=cards))
    elif el.name == "div" and "callout" in cls:
        body.append(tag("div", {"style": "border: 1px solid var(--color-line); padding: 26px 28px; margin: 8px 0 34px;"},
                        kids=[copy(x) for x in el.children if isinstance(x, Tag)]))
    elif el.name == "div" and "article__actions" in cls:
        row = tag("div", {"style": "display: flex; gap: 14px; flex-wrap: wrap; margin: 40px 0 8px;"})
        for a in el.find_all("a", recursive=False):
            b = copy(a); primary = "btn--primary" in (a.get("class") or [])
            b["style"] = BTN + ("background: var(--color-accent-strong); color: #fff;" if primary
                                else "border: 1px solid var(--color-ink); color: var(--color-ink);")
            del b["class"]
            row.append(b)
        body.append(row)
    elif el.name == "div" and "share" in cls:
        body.append(tag("div", {"style": "border-top: 1px solid var(--color-line); display: flex;"},
                        kids=[copy(a) for a in el.find_all("a")]))
    else:
        raise SystemExit(f"unhandled body element <{el.name} class={cls}>")
main.append(tag("article", kids=[hero, tag("div", {"class": "post-shell"}, kids=[aside, body])]))

# --- after the article: Keep reading (convert.py draws the latest posts), then the CTA band
if s.select_one("section.section--alt h2").get_text(strip=True) != "More from the blog.":
    raise SystemExit("no Keep reading section")
main.append(tag("section", kids=[tag("h2", text="More from the blog.")]))
cta = s.select_one("section.section--dark .cta")
main.append(tag("section", kids=[tag("div", kids=[
    tag("div", text=cta.select_one(".eyebrow").get_text(strip=True)),
    tag("h2", text=cta.find("h2").get_text(strip=True)), copy(cta.find("p")),
    tag("div", kids=[copy(a) for a in cta.select(".cta__actions a")])])]))

open(f"{OUT}/{slug}.html", "w").write(str(out))
print(f"{OUT}/{slug}.html")
