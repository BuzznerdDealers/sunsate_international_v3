/* Blog — the two things the platform filter behaviour leaves to the page.
 *
 * `filter` already hides the cards, rewrites the count from its template and
 * reveals the empty message, so none of that is repeated here. What it has no
 * concept of is wording: the handoff retitles the results heading to the topic
 * that is showing ("Parts posts") and pluralises the count ("1 article"). Both
 * are read off the `bz:filter` event the behaviour dispatches at the end of
 * every pass, so this listens to it rather than binding the chips a second
 * time. The markup is already correct before this runs — nine cards, "Latest
 * posts", "9 articles" — which is what the Design canvas draws.
 */
(function () {
  'use strict';

  var section = document.querySelector('[data-bz-node="bl-posts"]');
  if (!section) return;

  var title = section.querySelector('[data-bz-node="bp-head-h"] h2');
  var count = section.querySelector('[data-bz-part~="count"]');

  section.addEventListener('bz:filter', function (event) {
    var shown = (event.detail && event.detail.shown) || 0;

    if (count) count.textContent = shown + (shown === 1 ? ' article' : ' articles');

    if (title) {
      // The chip carries the topic in the casing the dealer typed; the event's
      // state is lowercased for matching, so it is the wrong thing to print.
      var active = section.querySelector('[data-bz-part~="control"][aria-pressed="true"]');
      var label = active ? active.textContent.trim() : '';
      title.textContent = !label || label.toLowerCase() === 'all' ? 'Latest posts' : label + ' posts';
    }
  });
})();
