// content/flag_watched.js
// Partially watched detection. Always saves to history if threshold met.
// Only flags for hiding when on a filtered page.

function ythFlagWatched(renderer) {
  if (!ythSettings.pw_enabled) return;
  var bar = renderer.querySelector('#progress') ||
            renderer.querySelector('.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment');
  if (!bar) return;
  var pct = parseInt(bar.style.width) || 0;
  if (pct < ythSettings.pw_threshold) return;

  if (!ythSettings.wl_disabled) {
    var title   = ythExtractTitle(renderer);
    var channel = ythExtractChannel(renderer);
    if (title) {
      ythLog('[YT Hider] partially watched (' + pct + '%):', title);
      ythSaveEntry(channel ? (title + CHANNEL_SEP + channel) : title);
    }
  }
  if (ythIsFilteredPage()) ythMarkRenderer(renderer, 'watched');
}
