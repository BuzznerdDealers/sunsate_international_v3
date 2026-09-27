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
