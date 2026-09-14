/* Frame International's configurator under the "open in a new tab" button.
 *
 * There is no iframe block in the node model and <iframe> is stripped from both
 * coded widgets and customHtml, so the embed has to be script-installed. The
 * un-enhanced state is a working link to the same application — that is what the
 * Design canvas draws, since it runs no site JS, and what a visitor without
 * scripts gets. Scoped to this page's build band only.
 */
(function () {
  var band = document.querySelector('[data-bz-node="tcf-build"]');
  if (!band) return;
  var link = band.querySelector('a[href*="navconfig.com"]');
  if (!link) return;

  var box = document.createElement('div');
  box.className = 'ss-frame';
  var frame = document.createElement('iframe');
  frame.src = link.getAttribute('href');
  frame.title = 'International truck configurator';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allowFullscreen = true;
  box.appendChild(frame);

  var host = link.closest('.bz-block') || link.parentNode;
  host.parentNode.insertBefore(box, host.nextSibling);
})();
