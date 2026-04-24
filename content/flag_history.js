// content/flag_history.js

function ythFlagHistory(renderer, list) {
  if (!ythSettings.rwh_enabled || ythSettings.wl_disabled || !list) return;
  if (!ythIsFilteredPage()) return;
  var title   = ythExtractTitle(renderer);
  var channel = ythExtractChannel(renderer);
  if (title && ythEntryInList(list, title, channel)) {
    ythLog('[YT Hider] flagging by history:', title, channel ? ('(' + channel + ')') : '');
    ythMarkRenderer(renderer, 'history');
  }
}
