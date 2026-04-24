// content/actor.js
// Reads data-yth-flags accumulated by all flaggers and applies one action:
//   dev mode on  → red outline + label listing every reason
//   dev mode off → display:none

function ythActOnFlagged(renderer) {
  if (!renderer.dataset.ythFlags) return;
  if (renderer.dataset.ythHidden) return;
  renderer.dataset.ythHidden = renderer.dataset.ythFlags;

  if (ythSettings.dev_tools_enabled) {
    renderer.style.setProperty('outline', '2px solid #ff4444', 'important');
    renderer.style.setProperty('outline-offset', '-2px', 'important');
    if (!renderer.querySelector('.yth-dev-label')) {
      var label = document.createElement('div');
      label.className = 'yth-dev-label';
      label.textContent = renderer.dataset.ythFlags;
      label.style.cssText =
        'position:absolute;top:4px;left:4px;z-index:9999;' +
        'background:#ff4444;color:#fff;font-size:10px;font-weight:700;' +
        'padding:2px 5px;border-radius:2px;pointer-events:none;font-family:monospace;';
      var pos = window.getComputedStyle(renderer).position;
      if (pos === 'static') renderer.style.setProperty('position', 'relative', 'important');
      renderer.appendChild(label);
    }
  } else {
    renderer.style.setProperty('display', 'none', 'important');
    ythIncrementRemovedCount();
  }
}
