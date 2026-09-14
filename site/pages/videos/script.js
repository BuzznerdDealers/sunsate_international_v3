/* Upgrade each video card's link into a lazy embed.
 *
 * The node model has no iframe block — <iframe> is stripped from coded widgets
 * and from customHtml — so the page ships real links to YouTube and Vimeo and
 * this script replaces them with players where scripts run. The un-enhanced
 * state is a working link, which is what the Design canvas shows and what a
 * visitor without JS gets, so nothing here is required for the page to work.
 *
 * Scoped to this page's own library and featured nodes; nothing else is touched.
 */
(function () {
  var EMBED = [
    [/youtube\.com\/watch\?v=([\w-]+)/, 'https://www.youtube-nocookie.com/embed/$1'],
    [/youtu\.be\/([\w-]+)/, 'https://www.youtube-nocookie.com/embed/$1'],
    [/vimeo\.com\/(\d+)/, 'https://player.vimeo.com/video/$1?dnt=1'],
  ];

  function embedSrc(href) {
    for (var i = 0; i < EMBED.length; i++) {
      var m = String(href || '').match(EMBED[i][0]);
      if (m) return EMBED[i][1].replace('$1', m[1]);
    }
    return null;
  }

  function upgrade(link, title) {
    var src = embedSrc(link.getAttribute('href'));
    if (!src) return;
    var frame = document.createElement('iframe');
    frame.src = src;
    frame.title = title || link.textContent.trim();
    frame.loading = 'lazy';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allow = 'accelerometer; clipboard-write; encrypted-media; picture-in-picture';
    frame.allowFullscreen = true;
    var box = document.createElement('div');
    box.className = 'ss-embed';
    box.appendChild(frame);
    var host = link.closest('.bz-col') || link.parentNode;
    host.insertBefore(box, host.firstChild);
    // The link was the un-enhanced state; once the player is in, it is a
    // duplicate of it, so it is marked rather than removed and the page's own
    // Custom code decides whether to keep showing it.
    var block = link.closest('.bz-block');
    if (block) block.classList.add('ss-embed-replaced');
  }

  ['videos-library', 'videos-featured'].forEach(function (id) {
    var root = document.querySelector('[data-bz-node="' + id + '"]');
    if (!root) return;
    root.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"], a[href*="vimeo.com"]').forEach(function (a) {
      upgrade(a, a.textContent.trim());
    });
  });
})();
