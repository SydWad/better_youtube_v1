// content/flag_viewcount.js

function ythFlagViewCount(renderer) {
  if (!ythSettings.view_count_enabled || ythSettings.view_count_min <= 0) return;
  if (!ythIsFilteredPage()) return;
  var views = ythExtractViewCount(renderer);
  if (views !== null && views < ythSettings.view_count_min) {
    ythLog('[YT Hider] flagging by view count (' + views + '):', ythExtractTitle(renderer));
    ythMarkRenderer(renderer, 'views');
  }
}
