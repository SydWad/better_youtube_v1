// history_scroller.js
// Auto-scroller for the history page retrieve feature.
// Accelerates from slow to fast to chain YouTube's lazy-load batches.
// Controlled via chrome.runtime messages from history_overlay.js.

const YTH_SCROLL_INTERVAL_MS = 80;
const YTH_SCROLL_STEP_MIN    = 1200;
const YTH_SCROLL_STEP_MAX    = 7000;
const YTH_ACCEL_STEPS        = 40;

let ythScrollInterval = null;
let ythScrollTick     = 0;

function ythGetScrollStep() {
  var t = Math.min(ythScrollTick / YTH_ACCEL_STEPS, 1);
  return Math.round(YTH_SCROLL_STEP_MIN + t * (YTH_SCROLL_STEP_MAX - YTH_SCROLL_STEP_MIN));
}

function ythScrollerStart() {
  if (ythScrollInterval !== null) return;
  ythScrollInterval = setInterval(function() {
    var step = ythGetScrollStep();
    var el = document.querySelector('ytd-app') ||
             document.querySelector('#page-manager') ||
             document.documentElement;
    el.scrollTop += step;
    window.scrollBy(0, step);
    ythScrollTick++;
  }, YTH_SCROLL_INTERVAL_MS);
}

function ythScrollerStop() {
  if (ythScrollInterval === null) return;
  clearInterval(ythScrollInterval);
  ythScrollInterval = null;
  ythScrollTick = 0;
}

chrome.runtime.onMessage.addListener(function(msg) {
  if (msg.action === 'yth_scroll_start') ythScrollerStart();
  if (msg.action === 'yth_scroll_stop')  ythScrollerStop();
});
