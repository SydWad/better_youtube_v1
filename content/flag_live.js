// content/flag_live.js

function ythIsLive(renderer) {
  if (renderer.getAttribute && renderer.getAttribute('data-is-live') === 'true') return true;
  var overlay = renderer.querySelector('ytd-thumbnail-overlay-time-status-renderer');
  if (overlay && overlay.getAttribute('overlay-style') === 'LIVE') return true;
  var badges = renderer.querySelectorAll('.yt-badge-shape__text, .ytBadgeShapeText');
  for (var i = 0; i < badges.length; i++) {
    if (badges[i].textContent.trim() === 'LIVE') return true;
  }
  return false;
}

function ythFlagLive(renderer) {
  if (!ythSettings.hide_live || !ythIsShortPlaylistFilteredPage()) return;
  if (ythIsLive(renderer)) ythMarkRenderer(renderer, 'live');
}
