// content/flag_members.js

function ythIsMembersOnly(renderer) {
  var badges = renderer.querySelectorAll('badge-shape');
  for (var i = 0; i < badges.length; i++) {
    var b = badges[i];
    if (b.classList && (
      b.classList.contains('yt-badge-shape--commerce') ||
      b.classList.contains('ytBadgeShapeCommerce')
    )) {
      var txt = b.querySelector(
        '.yt-badge-shape__text, .ytBadgeShapeText, .ytBadgeShapeTextHasMultipleBadgesInRow'
      );
      if (txt && txt.textContent.trim().toLowerCase().indexOf('members') !== -1) return true;
    }
    if (b.getAttribute('aria-label') === 'Members only') return true;
  }
  return false;
}

function ythFlagMembers(renderer) {
  if (!ythSettings.hide_members || !ythIsShortPlaylistFilteredPage()) return;
  if (ythIsMembersOnly(renderer)) ythMarkRenderer(renderer, 'members');
}
