// content/flag_autodub.js

function ythIsAutoDub(renderer) {
  var badges = renderer.querySelectorAll('.yt-badge-shape__text, .ytBadgeShapeText');
  for (var i = 0; i < badges.length; i++) {
    if (badges[i].textContent.trim().toLowerCase() === 'auto-dubbed') return true;
  }
  return false;
}

function ythFlagAutodub(renderer) {
  if (!ythSettings.hide_autodub || !ythIsShortPlaylistFilteredPage()) return;
  if (ythIsAutoDub(renderer)) ythMarkRenderer(renderer, 'autodub');
}
