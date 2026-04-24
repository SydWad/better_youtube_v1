// content/flag_shorts.js
// Flags individual short renderers and hides shorts UI elements and shelves.

function ythIsShort(renderer) {
  if (renderer.querySelector('ytm-shorts-lockup-view-model')) return true;
  if (renderer.querySelector('a[href^="/shorts/"]')) return true;
  var overlay = renderer.querySelector('ytd-thumbnail-overlay-time-status-renderer');
  if (overlay && overlay.getAttribute('overlay-style') === 'SHORTS') return true;
  var badges = renderer.querySelectorAll('.yt-badge-shape__text, .ytBadgeShapeText');
  for (var i = 0; i < badges.length; i++) {
    if (badges[i].textContent.trim() === 'SHORTS') return true;
  }
  return false;
}

function ythFlagShorts(renderer) {
  if (!ythSettings.hide_shorts || !ythIsShortPlaylistFilteredPage()) return;
  if (ythIsShort(renderer)) ythMarkRenderer(renderer, 'short');
}

// ─── Shorts UI elements (nav sidebar, channel tab) ────────────────────────────

function ythHideShortsUI() {
  var devMode = ythSettings.dev_tools_enabled;
  document.querySelectorAll('ytd-guide-entry-renderer').forEach(function(el) {
    var a = el.querySelector('a#endpoint[title="Shorts"]');
    if (a && !el.dataset.ythShelfHidden) {
      el.dataset.ythShelfHidden = 'shorts-nav';
      if (devMode) {
        el.style.setProperty('outline', '2px solid #ff4444', 'important');
      } else {
        el.style.setProperty('display', 'none', 'important');
        ythIncrementRemovedCount();
      }
    }
  });
  document.querySelectorAll('ytd-mini-guide-entry-renderer').forEach(function(el) {
    var a = el.querySelector('a#endpoint[href="/shorts/"]');
    if (a && !el.dataset.ythShelfHidden) {
      el.dataset.ythShelfHidden = 'shorts-nav';
      if (devMode) {
        el.style.setProperty('outline', '2px solid #ff4444', 'important');
      } else {
        el.style.setProperty('display', 'none', 'important');
        ythIncrementRemovedCount();
      }
    }
  });
  document.querySelectorAll('yt-tab-shape[tab-title="Shorts"]').forEach(function(el) {
    if (!el.dataset.ythShelfHidden) {
      el.dataset.ythShelfHidden = 'shorts-tab';
      if (devMode) {
        el.style.setProperty('outline', '2px solid #ff4444', 'important');
      } else {
        el.style.setProperty('display', 'none', 'important');
        ythIncrementRemovedCount();
      }
    }
  });
}

// ─── Shelf hiding ─────────────────────────────────────────────────────────────

function ythHideShelfEl(el) {
  if (el.dataset.ythShelfHidden) return;
  el.dataset.ythShelfHidden = 'short-shelf';
  if (ythSettings.dev_tools_enabled) {
    el.style.setProperty('outline', '2px solid #ff8800', 'important');
  } else {
    el.style.setProperty('display', 'none', 'important');
    ythIncrementRemovedCount();
  }
}

function ythHideShortsShelves() {
  if (!ythIsShortPlaylistFilteredPage()) return;
  document.querySelectorAll('ytd-rich-section-renderer').forEach(function(section) {
    if (section.querySelector('ytd-rich-shelf-renderer[is-shorts]')) ythHideShelfEl(section);
  });
  document.querySelectorAll('grid-shelf-view-model').forEach(function(shelf) {
    if (shelf.querySelector('ytm-shorts-lockup-view-model, a[href^="/shorts/"]')) ythHideShelfEl(shelf);
  });
  document.querySelectorAll('ytd-reel-shelf-renderer').forEach(function(shelf) {
    ythHideShelfEl(shelf);
  });
}

// Called from the MutationObserver for dynamically added nodes
function ythMaybeHideShelfNode(node, tag) {
  if (!ythSettings.hide_shorts || !ythIsShortPlaylistFilteredPage()) return;
  if (tag === 'ytd-rich-section-renderer' ||
      (node.querySelector && node.querySelector('ytd-rich-section-renderer'))) {
    var sections = tag === 'ytd-rich-section-renderer'
      ? [node] : node.querySelectorAll('ytd-rich-section-renderer');
    sections.forEach(function(s) {
      if (s.querySelector('ytd-rich-shelf-renderer[is-shorts]')) ythHideShelfEl(s);
    });
  }
  if (tag === 'grid-shelf-view-model' ||
      (node.querySelector && node.querySelector('grid-shelf-view-model'))) {
    var shelves = tag === 'grid-shelf-view-model'
      ? [node] : node.querySelectorAll('grid-shelf-view-model');
    shelves.forEach(function(shelf) {
      if (shelf.querySelector('ytm-shorts-lockup-view-model, a[href^="/shorts/"]')) ythHideShelfEl(shelf);
    });
  }
  if (tag === 'ytd-reel-shelf-renderer' ||
      (node.querySelector && node.querySelector('ytd-reel-shelf-renderer'))) {
    var reelShelves = tag === 'ytd-reel-shelf-renderer'
      ? [node] : node.querySelectorAll('ytd-reel-shelf-renderer');
    reelShelves.forEach(function(shelf) { ythHideShelfEl(shelf); });
  }
}
