// content/flag_playlists.js

function ythIsPlaylist(renderer) {
  if (ythGetPageType() === 'channel') return false;
  if (renderer.querySelector('ytd-playlist-thumbnail')) return true;
  if (renderer.querySelector('ytd-thumbnail-overlay-side-panel-renderer')) return true;
  if (renderer.classList && renderer.classList.contains('yt-lockup-view-model--collection-stack-2')) return true;
  if (renderer.querySelector('yt-collection-thumbnail-view-model')) return true;
  var badges = renderer.querySelectorAll('.yt-badge-shape__text, .ytBadgeShapeText');
  for (var i = 0; i < badges.length; i++) {
    var t = badges[i].textContent.trim();
    if (t === 'Mix' || t === 'Playlist') return true;
  }
  return false;
}

function ythFlagPlaylists(renderer) {
  if (!ythSettings.hide_playlists || !ythIsShortPlaylistFilteredPage()) return;
  if (ythIsPlaylist(renderer)) ythMarkRenderer(renderer, 'playlist');
}
