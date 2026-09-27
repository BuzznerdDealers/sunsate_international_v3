/* Swipe for the "Choose a brand to explore" coverflow on a phone.
 *
 * The type-rail component stages the cards and wires its own arrows; on a
 * phone a swipe should do what the arrows do, so a horizontal swipe presses
 * the matching arrow. Phone widths only — desktop and tablet are untouched.
 */
(function () {
  var band = document.querySelector('[data-bz-node="home-types"]');
  if (!band || !window.matchMedia) return;
  var phone = window.matchMedia('(max-width: 640px)');
  var rail = band.querySelector('[data-bz-node="tr-rail"]');
  if (!rail) return;

  function press(nodeId) {
    var control = band.querySelector('[data-bz-node="' + nodeId + '"] a, [data-bz-node="' + nodeId + '"] button');
    if (control) control.click();
  }

  var startX = null, startY = null;
  rail.addEventListener('touchstart', function (event) {
    if (!phone.matches || event.touches.length !== 1) return;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
  }, { passive: true });
  rail.addEventListener('touchend', function (event) {
    if (startX === null) return;
    var dx = event.changedTouches[0].clientX - startX;
    var dy = event.changedTouches[0].clientY - startY;
    startX = startY = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    press(dx < 0 ? 'tr-next' : 'tr-prev');
  }, { passive: true });
})();

/* Open the brand coverflow on its first card — International — rather than
 * the middle one the type-rail component centres by default. The component's
 * script has already staged the rail by now (component scripts run before page
 * scripts), and clicking a card is how it brings that card to the centre, so
 * this asks it to do exactly that, with the easing held off for the first
 * paint. Reorder the brands on the Components screen and whichever is first
 * leads. Every screen size.
 */
(function () {
  var rail = document.querySelector('[data-bz-node="home-types"] [data-bz-node="tr-rail"]');
  if (!rail || !rail.classList.contains('is-staged')) return;
  var first = rail.querySelector('[data-bz-node^="tr-slide-"][data-pos]');
  if (!first || first.getAttribute('data-pos') === '0') return;
  var slides = rail.querySelectorAll('[data-bz-node^="tr-slide-"][data-pos]');
  slides.forEach(function (slide) { slide.style.transition = 'none'; });
  first.click();
  void rail.offsetWidth;
  slides.forEach(function (slide) { slide.style.transition = ''; });
})();
