/* Blog — the things the platform filter behaviour leaves to the page.
 *
 * `filter` already hides the cards, rewrites the count from its template and
 * reveals the empty message, so none of that is repeated here. What it has no
 * concept of is wording, or of pages: the handoff retitles the results heading
 * to the topic that is showing ("Parts posts"), pluralises the count
 * ("1 article"), and — because the grid is one page of nine — the count under
 * "All" is the whole blog's, which the Blog pager carries as
 * `data-bz-posts-total`. With a topic chip pressed it is the cards showing on
 * this page, since the chips filter this page.
 *
 * All of it is read off the `bz:filter` event the behaviour dispatches at the
 * end of every pass, so this listens to it rather than binding the chips a
 * second time, and it runs once on load for the state before any chip is
 * pressed. The markup is already correct before this runs — nine cards,
 * "Latest posts" — which is what the Design canvas draws.
 */
(function () {
  'use strict';

  var section = document.querySelector('[data-bz-node="bl-posts"]');
  if (!section) return;

  var title = section.querySelector('[data-bz-node="pr-head-h"] h2');
  var count = section.querySelector('[data-bz-part~="count"]');
  var pager = document.querySelector('[data-bz-posts-total]');
  var total = pager ? parseInt(pager.getAttribute('data-bz-posts-total'), 10) : NaN;

  function activeLabel() {
    // The chip carries the topic in the casing the dealer typed; the event's
    // state is lowercased for matching, so it is the wrong thing to print.
    var active = section.querySelector('[data-bz-part~="control"][aria-pressed="true"]');
    var label = active ? active.textContent.trim() : '';
    return !label || label.toLowerCase() === 'all' ? '' : label;
  }

  function update(shown) {
    var label = activeLabel();
    var n = !label && !isNaN(total) ? total : shown;
    if (count) count.textContent = n + (n === 1 ? ' article' : ' articles');
    if (title) title.textContent = label ? label + ' posts' : 'Latest posts';
  }

  update(section.querySelectorAll('[data-bz-part~="item"]:not([hidden])').length);

  section.addEventListener('bz:filter', function (event) {
    update((event.detail && event.detail.shown) || 0);
  });
})();
