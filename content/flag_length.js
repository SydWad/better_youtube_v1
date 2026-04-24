// content/flag_length.js

function ythFlagLength(renderer) {
  if (!ythSettings.length_enabled || !ythIsFilteredPage()) return;
  var dur = ythExtractDuration(renderer);
  if (dur === null) return;
  var minMins  = ythParseFilterTime(ythSettings.length_min);
  var maxMins  = ythParseFilterTime(ythSettings.length_max);
  if ((minMins !== null && dur < minMins) || (maxMins !== null && dur > maxMins)) {
    ythLog('[YT Hider] flagging by length (' + dur.toFixed(1) + 'min):', ythExtractTitle(renderer));
    ythMarkRenderer(renderer, 'length');
  }
}
