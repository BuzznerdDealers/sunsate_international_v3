# Blog sync — one record per blog

```bash
npm run blog:sync          # refill the Blog page's cards from the post records
npm run blog:sync-check    # fail if a card has drifted (runs inside npm run check)
npm run blog:sync-test     # the specs
node tools/blog-sync/sync.mjs --all   # show every published post, newest first
```

## The bug this ends

A blog was two records. `site/blog/posts/<slug>.json` held the post — its title,
date, topic, description, featured image and body — and the Blog page's
`post-cards` node held a **second** copy of the same five fields, typed out per
card and kept level by hand.

Nothing connected them, so they drifted the moment either was edited. Setting a
thumbnail on a card changed the card and nothing else: `/blog/posts/<slug>` reads
the record, and the record still held whatever image it was imported with. Open
the card, click **Read more**, and the page showed a different picture — one
nobody had chosen for it.

## The shape now

A card carries one authored value, its **`slug`**, which says *which* post it
shows. Every field it draws — topic, date, title, link, excerpt, featured image —
is projected from that post's record by `sync.mjs`. A card is a view of a post,
never a copy of one, so:

- the featured image on **Posts → (post)** is the image the card and the post's
  own page both draw, and it belongs to that post alone;
- changing one post cannot reach another post's card or page;
- **Read more** is built from the record's slug, so it always opens the record
  the card came from;
- the post page shows the record's body **in full** — there is no excerpt-only
  version of a post and no "read the full article" link off to somewhere else.

The same rule holds inside a record: a post page's category line is projected
from the record's `topic`, so retopicking a post on Posts moves its chip, its
card and its page together.

## What stays yours

**Which** posts the Blog page shows, and in what order. That is the page's
decision — the four cards there now are a subset chosen for content review — and
sync never adds or removes a card. `--all` hands that decision to the archive
when you want every published post, newest first.

## Drift is a build failure

`npm run check` runs `--check`. A card edited away from its post — by hand, or on
the canvas — fails the build with the file and the fix, instead of shipping a page
whose card and post disagree. `--check` also refuses a card naming a post that
does not exist, or one that is still a draft (its page is not built, so the card
would link nowhere).

## Not the dashboard's rule yet

Sync runs in the repo. The dashboard's canvas will still let somebody type over a
card's title or drop an image on it, and nothing there re-derives it from the
post until this runs again. Making a card's fields read-only — or giving
`postsList` the topic parts, the "read more" label and the archive length this
grid needs — is platform work; see the note in `IMPLEMENTATION.md` §7.
