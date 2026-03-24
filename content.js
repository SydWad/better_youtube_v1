// content.js
// Handles: Not Interested capture, history page scraping, partially watched
// detection, and hiding based on watch history, length, shorts, playlists,
// members only, live streams, and page-type filters.
// NOTE: Storage functions inlined due to MV3 content script scope isolation.

// ─── Constants ────────────────────────────────────────────────────────────────

var YT_HIDER_NOT_INTERESTED = 'YT_HIDER_NOT_INTERESTED';
var YT_HIDER_SETTINGS_KEY   = 'YT_HIDER_SETTINGS';
var CHANNEL_SEP = ' <%CHANNEL%> ';

// ─── Debug logging ────────────────────────────────────────────────────────────
// Controlled by debug_enabled in settings. Off by default.

function ythLog() {
  if (!ythSettings.debug_enabled) return;
  console.log.apply(console, arguments);
}



var ythSettings = {
  ext_enabled:       true,
  pw_enabled:        false,
  pw_threshold:      50,
  length_enabled:    false,
  length_min:        '',
  length_max:        '',
  hide_shorts:       false,
  hide_playlists:    false,
  hide_members:      false,
  hide_live:         false,
  hide_autodub:      false,
  filter_home:       true,
  filter_subs:       true,
  filter_channel:    true,
  filter_search:     false,
  filter_sidebar:    true,
  rwh_enabled:       true,
  wl_disabled:       false,
  debug_enabled:     false,
  blacklist_enabled: false,
  blacklist_words:   'MineCraft, Roblox',
  view_count_enabled: false,
  view_count_min:     0
};

// ─── Page type detection ──────────────────────────────────────────────────────

function ythGetPageType() {
  var path = window.location.pathname;
  if (path === '/')                            return 'home';
  if (path.startsWith('/feed/subscriptions')) return 'subs';
  if (path.startsWith('/feed/history'))        return 'history';
  if (path.startsWith('/results'))             return 'search';
  if (path.startsWith('/watch'))               return 'sidebar';
  if (path.startsWith('/@') || path.startsWith('/channel') || path.startsWith('/c/')) return 'channel';
  return 'other';
}

// General filter check for hiding — history page is always excluded from hiding
function ythIsFilteredPage() {
  var page = ythGetPageType();
  if (page === 'history')  return false; // never hide on history page
  if (page === 'home'    && !ythSettings.filter_home)    return false;
  if (page === 'subs'    && !ythSettings.filter_subs)    return false;
  if (page === 'search'  && !ythSettings.filter_search)  return false;
  if (page === 'sidebar' && !ythSettings.filter_sidebar) return false;
  if (page === 'channel' && !ythSettings.filter_channel) return false;
  return true;
}

// Shorts/playlist/members/live page check — only respects channel and subs toggles
function ythIsShortPlaylistFilteredPage() {
  var page = ythGetPageType();
  if (page === 'history')  return false;
  if (page === 'subs'    && !ythSettings.filter_subs)    return false;
  if (page === 'channel' && !ythSettings.filter_channel) return false;
  return true;
}

// ─── Duration parsing ─────────────────────────────────────────────────────────
// Filter input: H:MM (hours:minutes) → total minutes
//   e.g. "0:20" = 20 minutes, "1:30" = 90 minutes
// YouTube badge: M:SS or H:MM:SS → total minutes (decimal)
//   e.g. "20:06" = 20.1 minutes, "1:02:30" = 62.5 minutes
// Both sides produce total minutes for direct comparison.

function ythParseFilterTime(str) {
  if (!str || str.trim() === '' || str.trim() === '∞') return null;
  var parts = str.trim().split(':');
  if (parts.length === 2) return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
  return null;
}

function ythParseBadgeDuration(str) {
  if (!str) return null;
  str = str.trim();
  var parts = str.split(':');
  if (parts.length === 2) return (parseInt(parts[0]) || 0) + (parseInt(parts[1]) || 0) / 60;
  if (parts.length === 3) return (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0) + (parseInt(parts[2]) || 0) / 60;
  return null;
}

function ythExtractDuration(renderer) {
  var badges = renderer.querySelectorAll('.yt-badge-shape__text');
  for (var i = 0; i < badges.length; i++) {
    var txt = badges[i].textContent.trim();
    // Only parse if it starts with a digit (time format), skip SHORTS/LIVE/Members etc.
    if (/^\d/.test(txt)) {
      var dur = ythParseBadgeDuration(txt);
      if (dur !== null) return dur;
    }
  }
  return null;
}

// Parse YouTube's view count format: "123", "1.2K", "45.6M", "1.2B" → number
function ythParseViewCount(str) {
  if (!str) return null;
  str = str.trim().replace(/,/g, '');
  if (!str) return null;
  var multipliers = { 'k': 1e3, 'm': 1e6, 'b': 1e9 };
  var last = str[str.length - 1].toLowerCase();
  if (multipliers[last]) {
    return parseFloat(str.slice(0, -1)) * multipliers[last];
  }
  var n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function ythExtractViewCount(renderer) {
  // View count is a metadata-text span that follows a leading-icon span
  // (the play-button icon svg). We find all leading-icon + value pairs.
  var rows = renderer.querySelectorAll('.yt-content-metadata-view-model__metadata-row');
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var icons = row.querySelectorAll('.yt-content-metadata-view-model__leading-icon');
    for (var j = 0; j < icons.length; j++) {
      // The span immediately after a leading-icon contains the view count
      var next = icons[j].nextElementSibling;
      while (next) {
        if (next.classList && next.classList.contains('yt-content-metadata-view-model__metadata-text')) {
          var txt = next.textContent.trim();
          // Must look like a number with optional K/M/B suffix, no other words
          if (/^[\d,.]+[KMBkmb]?$/.test(txt)) {
            var count = ythParseViewCount(txt);
            if (count !== null) return count;
          }
          break;
        }
        // Skip delimiter spans
        if (!next.classList.contains('yt-content-metadata-view-model__delimiter')) break;
        next = next.nextElementSibling;
      }
    }
  }
  return null;
}



function ythReadList(callback) {
  chrome.storage.local.get([YT_HIDER_NOT_INTERESTED], function(result) {
    var data = result[YT_HIDER_NOT_INTERESTED];
    if (Array.isArray(data)) {
      callback(data);
    } else {
      chrome.storage.local.set({ [YT_HIDER_NOT_INTERESTED]: [] }, function() { callback([]); });
    }
  });
}

function ythGetTitlePart(entry) {
  var sep = entry.indexOf(CHANNEL_SEP);
  return sep !== -1 ? entry.substring(0, sep).trim() : entry.trim();
}

function ythBinarySearchPosition(list, titleKey) {
  var lo = 0, hi = list.length;
  while (lo < hi) {
    var mid = (lo + hi) >>> 1;
    if (ythGetTitlePart(list[mid]).toLowerCase().localeCompare(titleKey) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function ythEntryExists(list, entry) {
  var titleKey = ythGetTitlePart(entry).toLowerCase();
  var pos = ythBinarySearchPosition(list, titleKey);
  for (var i = pos; i < list.length; i++) {
    var c = ythGetTitlePart(list[i]).toLowerCase();
    if (c.localeCompare(titleKey) > 0) break;
    if (c === titleKey) return true;
  }
  return false;
}

function ythInsertEntry(list, entry) {
  var trimmed  = entry.trim();
  var titleKey = ythGetTitlePart(trimmed).toLowerCase();
  var pos = ythBinarySearchPosition(list, titleKey);
  list.splice(pos, 0, trimmed);
  return list;
}

// ─── Batch save queue ────────────────────────────────────────────────────────
// Instead of one storage read+write per entry, queue entries and flush
// in a single batch write. This prevents sequential blocking on the
// history page where hundreds of entries need saving at once.

var ythSaveQueue   = [];
var ythSavePending = false;

function ythFlushQueue() {
  if (ythSaveQueue.length === 0) { ythSavePending = false; return; }
  var toSave = ythSaveQueue.slice();
  ythSaveQueue = [];
  ythSavePending = false;

  ythReadList(function(list) {
    var added = 0;
    toSave.forEach(function(entry) {
      if (!ythEntryExists(list, entry)) {
        ythInsertEntry(list, entry);
        added++;
        ythLog('[YT Hider] queued save:', entry);
      }
    });
    if (added === 0) return;
    chrome.storage.local.set({ [YT_HIDER_NOT_INTERESTED]: list }, function() {
      ythLog('[YT Hider] batch saved', added, 'entries');
      ythListDirty = true;
    });
  });
}

function ythSaveEntry(entry) {
  ythSaveQueue.push(entry);
  if (!ythSavePending) {
    ythSavePending = true;
    // Collect entries for 300ms then flush in one batch
    setTimeout(ythFlushQueue, 300);
  }
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function ythFindRenderer(el) {
  var node = el;
  for (var i = 0; i < 25; i++) {
    if (!node) return null;
    if (node.tagName && node.tagName.toLowerCase() === 'ytd-rich-item-renderer') return node;
    node = node.parentElement;
  }
  return null;
}

// Extract title from both ytd-rich-item-renderer (home/subs) and
// ytd-video-renderer (search results)
function ythExtractTitle(renderer) {
  // Home/subs/channel lockup style
  var h3 = renderer.querySelector('h3.yt-lockup-metadata-view-model__heading-reset');
  if (h3 && h3.getAttribute('title')) return h3.getAttribute('title').trim();
  var anchor = renderer.querySelector('a.yt-lockup-metadata-view-model__title');
  if (anchor && anchor.getAttribute('title')) return anchor.getAttribute('title').trim();

  // Search results style (ytd-video-renderer)
  var titleLink = renderer.querySelector('a#video-title');
  if (titleLink && titleLink.getAttribute('title')) return titleLink.getAttribute('title').trim();

  // Rich grid media style
  var richLink = renderer.querySelector('a#video-title-link');
  if (richLink && richLink.getAttribute('title')) return richLink.getAttribute('title').trim();

  // Fallback: text content
  if (anchor) return anchor.textContent.trim();
  return null;
}

function ythExtractChannel(renderer) {
  // Home/subs lockup style — channel link with /@ href
  var link = renderer.querySelector('.yt-lockup-metadata-view-model__text-container a[href^="/@"]');
  if (link) return link.textContent.trim();
  // Search results style
  var chLink = renderer.querySelector('#channel-name a, ytd-channel-name a');
  if (chLink) return chLink.textContent.trim();
  // History page lockup — channel name is plain text in metadata row, no anchor
  // Structure: yt-content-metadata-view-model > .metadata-row > span (first span = channel)
  var metaRow = renderer.querySelector('.yt-content-metadata-view-model__metadata-row');
  if (metaRow) {
    var span = metaRow.querySelector('span.yt-core-attributed-string');
    if (span && span.textContent.trim()) return span.textContent.trim();
  }
  return null;
}

function ythIsShort(renderer) {
  // Home/subs feed shorts
  if (renderer.querySelector('ytm-shorts-lockup-view-model')) return true;
  // Any renderer with /shorts/ link
  if (renderer.querySelector('a[href^="/shorts/"]')) return true;
  // Search results: ytd-video-renderer with SHORTS badge
  var overlay = renderer.querySelector('ytd-thumbnail-overlay-time-status-renderer');
  if (overlay && overlay.getAttribute('overlay-style') === 'SHORTS') return true;
  var badge = renderer.querySelector('.yt-badge-shape__text');
  if (badge && badge.textContent.trim() === 'SHORTS') return true;
  return false;
}

function ythIsPlaylist(renderer) {
  // Never check for playlists on channel pages — causes false positives
  if (ythGetPageType() === 'channel') return false;
  if (renderer.querySelector('ytd-playlist-thumbnail')) return true;
  if (renderer.querySelector('ytd-thumbnail-overlay-side-panel-renderer')) return true;
  if (renderer.classList && renderer.classList.contains('yt-lockup-view-model--collection-stack-2')) return true;
  if (renderer.querySelector('yt-collection-thumbnail-view-model')) return true;
  var badges = renderer.querySelectorAll('.yt-badge-shape__text');
  for (var i = 0; i < badges.length; i++) {
    var t = badges[i].textContent.trim();
    if (t === 'Mix' || t === 'Playlist') return true;
  }
  return false;
}

function ythIsMembersOnly(renderer) {
  var badges = renderer.querySelectorAll('badge-shape');
  for (var i = 0; i < badges.length; i++) {
    var b = badges[i];
    // New style: yt-badge-shape--commerce class with "members" text
    if (b.classList && b.classList.contains('yt-badge-shape--commerce')) {
      var txt = b.querySelector('.yt-badge-shape__text');
      if (txt && txt.textContent.trim().toLowerCase().indexOf('members') !== -1) return true;
    }
    // Fallback: aria-label
    if (b.getAttribute('aria-label') === 'Members only') return true;
  }
  return false;
}


function ythIsLive(renderer) {
  var overlay = renderer.querySelector('ytd-thumbnail-overlay-time-status-renderer');
  if (overlay && overlay.getAttribute('overlay-style') === 'LIVE') return true;
  var badge = renderer.querySelector('.yt-badge-shape__text');
  if (badge && badge.textContent.trim() === 'LIVE') return true;
  return false;
}

function ythIsAutoDub(renderer) {
  var badges = renderer.querySelectorAll('.yt-badge-shape__text');
  for (var i = 0; i < badges.length; i++) {
    if (badges[i].textContent.trim().toLowerCase() === 'auto-dubbed') return true;
  }
  return false;
}

// ─── Hide / unhide ────────────────────────────────────────────────────────────

var ythSessionRemovedCount = 0;

function ythIncrementRemovedCount() {
  ythSessionRemovedCount++;
}

function ythHide(renderer, reason) {
  if (renderer.dataset.ythHidden) return;
  renderer.dataset.ythHidden = reason;
  if (ythSettings.dev_tools_enabled) {
    // Dev mode: outline red and show a reason label instead of hiding
    renderer.style.setProperty('outline', '2px solid #ff4444', 'important');
    renderer.style.setProperty('outline-offset', '-2px', 'important');
    if (!renderer.querySelector('.yth-dev-label')) {
      var label = document.createElement('div');
      label.className = 'yth-dev-label';
      label.textContent = reason;
      label.style.cssText = 'position:absolute;top:4px;left:4px;z-index:9999;' +
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

// Hide Shorts-related UI elements: sidebar nav entries, channel tab
function ythHideShortsUI() {
  var devMode = ythSettings.dev_tools_enabled;
  // Full sidebar: ytd-guide-entry-renderer with title="Shorts"
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
  // Mini sidebar: ytd-mini-guide-entry-renderer with href="/shorts/"
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
  // Channel page Shorts tab
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

function ythUnhideAll() {
  document.querySelectorAll('[data-yth-hidden]').forEach(function(el) {
    el.style.removeProperty('display');
    el.style.removeProperty('outline');
    el.style.removeProperty('outline-offset');
    var label = el.querySelector('.yth-dev-label');
    if (label) label.remove();
    delete el.dataset.ythHidden;
  });
  document.querySelectorAll('[data-yth-shelf-hidden]').forEach(function(el) {
    el.style.removeProperty('display');
    delete el.dataset.ythShelfHidden;
  });
}

// ─── List cache ───────────────────────────────────────────────────────────────

var ythCachedList     = null;
var ythListDirty      = true;
var ythInitialScanDue = false; // set true if ythScanAll ran before cache was ready

function ythRefreshCache(callback) {
  if (!ythListDirty && ythCachedList !== null) {
    callback(ythCachedList); return;
  }
  if (ythCachedList !== null) {
    // Stale — use immediately, refresh background
    callback(ythCachedList);
    ythReadList(function(list) {
      ythCachedList = list;
      ythListDirty  = false;
    });
    return;
  }
  // No cache yet — must wait for storage
  ythReadList(function(list) {
    ythCachedList = list;
    ythListDirty  = false;
    callback(list);
    // If ythScanAll ran before we had the list, re-run it now
    if (ythInitialScanDue) {
      ythInitialScanDue = false;
      ythScanAll();
    }
  });
}

function ythEntryInList(list, title, channel) {
  // Binary search to the title position
  var titleKey = title.toLowerCase();
  var pos = ythBinarySearchPosition(list, titleKey);
  for (var i = pos; i < list.length; i++) {
    var storedTitle = ythGetTitlePart(list[i]).toLowerCase();
    if (storedTitle.localeCompare(titleKey) > 0) break;
    if (storedTitle !== titleKey) continue;
    // Title matches — now check channel if both sides have it
    var storedChannel = null;
    var sep = list[i].indexOf(CHANNEL_SEP);
    if (sep !== -1) storedChannel = list[i].substring(sep + CHANNEL_SEP.length).trim().toLowerCase();
    // If both have a channel, they must match
    if (storedChannel && channel) {
      if (storedChannel === channel.toLowerCase()) return true;
      // Same title, different channel — not a match, keep scanning
      continue;
    }
    // One or both sides missing channel — title match is sufficient
    return true;
  }
  return false;
}

// ─── Process a single renderer ────────────────────────────────────────────────

function ythProcessRenderer(renderer, list) {
  // Extension disabled — do nothing
  if (!ythSettings.ext_enabled) return;

  // Shorts — shorts/playlist page filter only
  if (ythSettings.hide_shorts && ythIsShortPlaylistFilteredPage() && ythIsShort(renderer)) {
    ythLog('[YT Hider] hiding short:', ythExtractTitle(renderer));
    ythHide(renderer, 'short'); return;
  }
  // Playlists
  if (ythSettings.hide_playlists && ythIsShortPlaylistFilteredPage() && ythIsPlaylist(renderer)) {
    ythLog('[YT Hider] hiding playlist:', ythExtractTitle(renderer));
    ythHide(renderer, 'playlist'); return;
  }
  // Members only
  if (ythSettings.hide_members && ythIsShortPlaylistFilteredPage() && ythIsMembersOnly(renderer)) {
    ythLog('[YT Hider] hiding members-only:', ythExtractTitle(renderer));
    ythHide(renderer, 'members'); return;
  }
  // Live streams
  if (ythSettings.hide_live && ythIsShortPlaylistFilteredPage() && ythIsLive(renderer)) {
    ythLog('[YT Hider] hiding live:', ythExtractTitle(renderer));
    ythHide(renderer, 'live'); return;
  }
  // Auto-dubbed
  if (ythSettings.hide_autodub && ythIsShortPlaylistFilteredPage() && ythIsAutoDub(renderer)) {
    ythLog('[YT Hider] hiding auto-dubbed:', ythExtractTitle(renderer));
    ythHide(renderer, 'autodub'); return;
  }

  // Partially watched — always capture data, hide only on filtered pages
  if (ythSettings.pw_enabled) {
    var bar = renderer.querySelector('#progress') ||
              renderer.querySelector('.ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment');
    if (bar) {
      var pct = parseInt(bar.style.width) || 0;
      if (pct >= ythSettings.pw_threshold) {
        if (!ythSettings.wl_disabled) {
          var pwTitle   = ythExtractTitle(renderer);
          var pwChannel = ythExtractChannel(renderer);
          if (pwTitle) {
            ythLog('[YT Hider] partially watched (' + pct + '%):', pwTitle);
            ythSaveEntry(pwChannel ? (pwTitle + CHANNEL_SEP + pwChannel) : pwTitle);
          }
        }
        if (ythIsFilteredPage()) { ythHide(renderer, 'watched'); return; }
      }
    }
  }

  // Everything below only on filtered pages
  if (!ythIsFilteredPage()) return;

  // Length filter
  if (ythSettings.length_enabled) {
    var dur = ythExtractDuration(renderer);
    if (dur !== null) {
      var minMins  = ythParseFilterTime(ythSettings.length_min);
      var maxMins  = ythParseFilterTime(ythSettings.length_max);
      var belowMin = minMins !== null && dur < minMins;
      var aboveMax = maxMins !== null && dur > maxMins;
      if (belowMin || aboveMax) {
        ythLog('[YT Hider] hiding by length (' + dur.toFixed(1) + 'min):', ythExtractTitle(renderer));
        ythHide(renderer, 'length'); return;
      }
    }
  }

  // View count filter
  if (ythSettings.view_count_enabled && ythSettings.view_count_min > 0) {
    var views = ythExtractViewCount(renderer);
    if (views !== null && views < ythSettings.view_count_min) {
      ythLog('[YT Hider] hiding by view count (' + views + '):', ythExtractTitle(renderer));
      ythHide(renderer, 'views'); return;
    }
  }

  // Watch history list
  if (ythSettings.rwh_enabled && !ythSettings.wl_disabled && list) {
    var title   = ythExtractTitle(renderer);
    var channel = ythExtractChannel(renderer);
    if (title && ythEntryInList(list, title, channel)) {
      ythLog('[YT Hider] hiding by history:', title, channel ? ('(' + channel + ')') : '');
      ythHide(renderer, 'history'); return;
    }
  }

  // Blacklist — hide matching titles but never save to watch list
  if (ythSettings.blacklist_enabled && ythSettings.blacklist_words) {
    var blTitle = ythExtractTitle(renderer);
    if (blTitle) {
      var blLower = blTitle.toLowerCase();
      var words = ythSettings.blacklist_words.split(',');
      for (var w = 0; w < words.length; w++) {
        var word = words[w].trim().toLowerCase();
        if (word && blLower.indexOf(word) !== -1) {
          ythLog('[YT Hider] hiding by blacklist (' + word + '):', blTitle);
          ythHide(renderer, 'blacklist'); return;
        }
      }
    }
  }
}

// ─── Scan all renderers ───────────────────────────────────────────────────────

// All renderer tags we scan
// yt-lockup-view-model covers history page and sidebar video cards
var YTH_RENDERER_SELECTOR =
  'ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-video-renderer, yt-lockup-view-model';

function ythScanAll() {
  if (ythPaused) return;
  if (window.location.pathname.startsWith('/feed/history')) return; // history page: scrape only, never hide
  // Flag that a scan was requested — if cache isn't ready yet,
  // ythRefreshCache will re-run the scan once it loads
  if (ythCachedList === null) ythInitialScanDue = true;

  // Hide shorts UI elements when hide_shorts is enabled
  if (ythSettings.hide_shorts) {
    ythHideShortsUI();
  }
  // Hide shorts shelves — two container types:
  // 1. ytd-rich-section-renderer > ytd-rich-shelf-renderer[is-shorts] (home page)
  // 2. grid-shelf-view-model containing shorts (search results)
  if (ythSettings.hide_shorts && ythIsShortPlaylistFilteredPage()) {
    var devMode = ythSettings.dev_tools_enabled;
    document.querySelectorAll('ytd-rich-section-renderer').forEach(function(section) {
      if (section.dataset.ythShelfHidden) return;
      if (section.querySelector('ytd-rich-shelf-renderer[is-shorts]')) {
        section.dataset.ythShelfHidden = 'short-shelf';
        if (devMode) {
          section.style.setProperty('outline', '2px solid #ff8800', 'important');
        } else {
          section.style.setProperty('display', 'none', 'important');
          ythIncrementRemovedCount();
        }
      }
    });
    document.querySelectorAll('grid-shelf-view-model').forEach(function(shelf) {
      if (shelf.dataset.ythShelfHidden) return;
      if (shelf.querySelector('ytm-shorts-lockup-view-model, a[href^="/shorts/"]')) {
        shelf.dataset.ythShelfHidden = 'short-shelf';
        if (devMode) {
          shelf.style.setProperty('outline', '2px solid #ff8800', 'important');
        } else {
          shelf.style.setProperty('display', 'none', 'important');
          ythIncrementRemovedCount();
        }
      }
    });
  }

  ythRefreshCache(function(list) {
    document.querySelectorAll(YTH_RENDERER_SELECTOR).forEach(function(r) {
      // Skip yt-lockup-view-model elements that are nested inside ytd-rich-item-renderer
      // to avoid double-processing — only process top-level lockup-view-models
      if (r.tagName.toLowerCase() === 'yt-lockup-view-model') {
        var parent = r.parentElement;
        while (parent) {
          if (parent.tagName && (
            parent.tagName.toLowerCase() === 'ytd-rich-item-renderer' ||
            parent.tagName.toLowerCase() === 'ytd-video-renderer'
          )) return;
          parent = parent.parentElement;
        }
      }
      ythProcessRenderer(r, list);
    });
  });
}

// ─── History page scraping ────────────────────────────────────────────────────
// Aggressively adds every video on /feed/history to the watch list.
// Runs on load and as user scrolls. Never hides anything on this page.

function ythIsTopLevelLockup(el) {
  // Returns true if this yt-lockup-view-model is NOT nested inside ytd-rich-item-renderer
  var p = el.parentElement;
  while (p) {
    if (p.tagName && p.tagName.toLowerCase() === 'ytd-rich-item-renderer') return false;
    p = p.parentElement;
  }
  return true;
}

function ythScrapeHistoryRenderer(el) {
  if (el.dataset.ythHistoryScraped) return;
  el.dataset.ythHistoryScraped = '1';
  var title   = ythExtractTitle(el);
  var channel = ythExtractChannel(el);
  if (title && !ythSettings.wl_disabled) {
    ythLog('[YT Hider] history scrape:', title, '|', channel || 'no channel');
    ythSaveEntry(channel ? (title + CHANNEL_SEP + channel) : title);
  }
}

function ythScrapeHistoryPage() {
  // Only scrape top-level yt-lockup-view-model (history page video cards)
  document.querySelectorAll('yt-lockup-view-model').forEach(function(el) {
    if (ythIsTopLevelLockup(el)) ythScrapeHistoryRenderer(el);
  });
}

// Retry scraping with backoff in case DOM isn't ready on first call
function ythScrapeHistoryWithRetry(attempts) {
  var found = 0;
  document.querySelectorAll('yt-lockup-view-model').forEach(function(el) {
    if (ythIsTopLevelLockup(el)) found++;
  });
  if (found > 0) {
    ythScrapeHistoryPage();
    // Keep scanning periodically to catch new items loaded on scroll
    setInterval(ythScrapeHistoryPage, 500);
  } else if (attempts > 0) {
    setTimeout(function() { ythScrapeHistoryWithRetry(attempts - 1); }, 500);
  }
}

// ─── Step 1: Three-dot menu — store pending entry ─────────────────────────────

var pendingEntry = null;

document.addEventListener('click', function(e) {
  var menuBtn = e.target.closest('.yt-lockup-metadata-view-model__menu-button button');
  if (!menuBtn) return;
  var renderer = ythFindRenderer(menuBtn);
  if (!renderer) { console.error('[YT Hider] no renderer found'); return; }
  var title   = ythExtractTitle(renderer);
  var channel = ythExtractChannel(renderer);
  if (title) {
    pendingEntry = channel ? (title + CHANNEL_SEP + channel) : title;
    ythLog('[YT Hider] pendingEntry set:', pendingEntry);
  } else {
    console.error('[YT Hider] title extraction returned null');
  }
}, true);

// ─── Step 2: Watch dropdown for Not Interested ────────────────────────────────

function ythOnMenuOpen(dropdown) {
  dropdown.querySelectorAll('yt-list-item-view-model').forEach(function(item) {
    var span = item.querySelector('span.yt-list-item-view-model__title');
    if (!span) return;
    if (span.textContent.trim().toLowerCase() !== 'not interested') return;
    var btn = item.querySelector('button.ytButtonOrAnchorButton');
    if (!btn || btn.dataset.ythiderBound) return;
    btn.dataset.ythiderBound = '1';
    btn.addEventListener('click', function() {
      ythLog('[YT Hider] Not Interested clicked, pendingEntry:', pendingEntry);
      if (pendingEntry) {
        if (!ythSettings.wl_disabled) ythSaveEntry(pendingEntry);
        pendingEntry = null;
      } else {
        console.error('[YT Hider] pendingEntry was empty on click');
      }
    });
  });
}

function ythWatchDropdown(dropdown) {
  new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var mutation = mutations[i];
      if (mutation.type === 'attributes' &&
          mutation.attributeName === 'aria-hidden' &&
          dropdown.getAttribute('aria-hidden') === null) {
        ythOnMenuOpen(dropdown); return;
      }
      if (mutation.type === 'childList') {
        for (var j = 0; j < mutation.addedNodes.length; j++) {
          var node = mutation.addedNodes[j];
          if (node.nodeType === Node.ELEMENT_NODE &&
              node.tagName.toLowerCase() === 'yt-list-item-view-model') {
            ythOnMenuOpen(dropdown); return;
          }
        }
      }
    }
  }).observe(dropdown, { attributes: true, childList: true, subtree: true });
}

// ─── MutationObserver — watches for new content ───────────────────────────────

var ythIsHistoryPage = ythGetPageType() === 'history';

new MutationObserver(function(mutations) {
  for (var i = 0; i < mutations.length; i++) {
    var mutation = mutations[i];
    for (var j = 0; j < mutation.addedNodes.length; j++) {
      var node = mutation.addedNodes[j];
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      var tag = node.tagName.toLowerCase();

      // Watch for dropdown first appearance
      var dropdown = tag === 'tp-yt-iron-dropdown'
        ? node
        : (node.querySelector ? node.querySelector('tp-yt-iron-dropdown') : null);
      if (dropdown && !dropdown.dataset.ythWatching) {
        dropdown.dataset.ythWatching = '1';
        ythWatchDropdown(dropdown);
      }

      // History page: scrape new renderers as they load while scrolling
      if (ythIsHistoryPage) {
        // Direct yt-lockup-view-model addition
        if (tag === 'yt-lockup-view-model' && ythIsTopLevelLockup(node)) {
          ythScrapeHistoryRenderer(node);
        }
        // Batch additions — scan inside the added node for lockups
        if (node.querySelectorAll) {
          node.querySelectorAll('yt-lockup-view-model').forEach(function(el) {
            if (ythIsTopLevelLockup(el)) ythScrapeHistoryRenderer(el);
          });
        }
        continue; // Don't process hiding on history page
      }

      // Normal pages: process new renderers for hiding
      var isRenderer =
        tag === 'ytd-rich-item-renderer' ||
        tag === 'ytd-grid-video-renderer' ||
        tag === 'ytd-compact-video-renderer' ||
        tag === 'ytd-video-renderer';

      if (isRenderer) {
        ythRefreshCache(function(list) { ythProcessRenderer(node, list); });
      }

      // yt-lockup-view-model on non-history pages (sidebar etc)
      if (tag === 'yt-lockup-view-model') {
        var lParent = node.parentElement;
        var isNested = false;
        while (lParent) {
          var lTag = lParent.tagName ? lParent.tagName.toLowerCase() : '';
          if (lTag === 'ytd-rich-item-renderer' || lTag === 'ytd-video-renderer') { isNested = true; break; }
          lParent = lParent.parentElement;
        }
        if (!isNested) ythRefreshCache(function(list) { ythProcessRenderer(node, list); });
      }

      // Shorts shelves added dynamically — both types
      if (ythSettings.hide_shorts && ythIsShortPlaylistFilteredPage()) {
        var devMode = ythSettings.dev_tools_enabled;
        // Home page shorts shelf
        if (tag === 'ytd-rich-section-renderer' ||
            (node.querySelector && node.querySelector('ytd-rich-section-renderer'))) {
          var sections = tag === 'ytd-rich-section-renderer'
            ? [node]
            : node.querySelectorAll('ytd-rich-section-renderer');
          sections.forEach(function(section) {
            if (!section.dataset.ythShelfHidden &&
                section.querySelector('ytd-rich-shelf-renderer[is-shorts]')) {
              section.dataset.ythShelfHidden = 'short-shelf';
              if (devMode) {
                section.style.setProperty('outline', '2px solid #ff8800', 'important');
              } else {
                section.style.setProperty('display', 'none', 'important');
                ythIncrementRemovedCount();
              }
            }
          });
        }
        // Search results shorts shelf
        if (tag === 'grid-shelf-view-model' ||
            (node.querySelector && node.querySelector('grid-shelf-view-model'))) {
          var shelves = tag === 'grid-shelf-view-model'
            ? [node]
            : node.querySelectorAll('grid-shelf-view-model');
          shelves.forEach(function(shelf) {
            if (!shelf.dataset.ythShelfHidden &&
                shelf.querySelector('ytm-shorts-lockup-view-model, a[href^="/shorts/"]')) {
              shelf.dataset.ythShelfHidden = 'short-shelf';
              if (devMode) {
                shelf.style.setProperty('outline', '2px solid #ff8800', 'important');
              } else {
                shelf.style.setProperty('display', 'none', 'important');
                ythIncrementRemovedCount();
              }
            }
          });
        }
      }

    }
  }
}).observe(document.body, { childList: true, subtree: true });

// ─── Popup visibility pause ───────────────────────────────────────────────────
// Uses a long-lived port rather than messages — port.onDisconnect fires
// synchronously when the popup closes, unlike unload which kills async callbacks.

var ythPaused = false;

chrome.runtime.onConnect.addListener(function(port) {
  if (port.name !== 'YTH_POPUP') return;
  ythPaused = true;
  ythLog('[YT Hider] popup opened — pausing');

  // Send current session removed count to popup
  port.postMessage({ type: 'YTH_SESSION_COUNT', count: ythSessionRemovedCount });

  port.onDisconnect.addListener(function() {
    ythLog('[YT Hider] popup closed');
    var currentlyHistory = window.location.pathname.startsWith('/feed/history');
    if (currentlyHistory) {
      ythPaused = false;
      ythScrapeHistoryPage();
    } else {
      location.reload();
    }
  });
});

chrome.storage.local.get([YT_HIDER_SETTINGS_KEY], function(result) {
  var s = result[YT_HIDER_SETTINGS_KEY];
  if (s) {
    ythSettings = s;
    ythListDirty = true;
  } else {
    chrome.storage.local.set({ [YT_HIDER_SETTINGS_KEY]: ythSettings });
  }

  if (!ythSettings.ext_enabled) {
    ythUnhideAll();
    return;
  }

  if (ythIsHistoryPage) {
    ythScrapeHistoryWithRetry(10);
  } else {
    ythScanAll();
  }

  // Periodic check on all pages — catches lazily rendered elements
  // History page re-scrapes; all others re-scan for anything missed
  setInterval(function() {
    if (ythPaused) return;
    if (window.location.pathname.startsWith('/feed/history')) {
      ythScrapeHistoryPage();
    } else {
      ythScanAll();
    }
  }, 3000);
});

ythLog('[YT Hider] content script loaded, page:', ythGetPageType());

// ─── Watch page auto-save ─────────────────────────────────────────────────────
// If the user watches a video for 10+ seconds, save it to the watch history.

if (ythGetPageType() === 'sidebar' && !ythSettings.wl_disabled) {
  setTimeout(function() {
    // Extract title from the watch page — primary video title element
    var titleEl = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string') ||
                  document.querySelector('h1.style-scope.ytd-watch-metadata yt-formatted-string') ||
                  document.querySelector('#title h1 yt-formatted-string');
    var title = titleEl ? titleEl.textContent.trim() : null;

    // Extract channel name
    var channelEl = document.querySelector('#channel-name a, ytd-channel-name a, #owner #channel-name yt-formatted-string');
    var channel = channelEl ? channelEl.textContent.trim() : null;

    if (title) {
      var entry = channel ? (title + CHANNEL_SEP + channel) : title;
      ythLog('[YT Hider] auto-saving watch page video:', entry);
      ythSaveEntry(entry);
    }
  }, 10000);
}
