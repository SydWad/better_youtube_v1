// list_manager.js
// Single source of truth for all storage, formatting, and entry parsing logic.
// Used by popup.js and options.js (loaded via script tag in their HTML).
// content.js has its own inlined copy due to MV3 content script scope isolation —
// any changes here must be mirrored there manually.
//
// Entry format stored in chrome.storage.local:
//   "Video Title <%CHANNEL%> ChannelName"
//
// Export .txt format:
//   <%CATEGORY%> A
//   Video Title <%CHANNEL%> ChannelName
//
// Options panel display:
//   CATEGORY: A
//   Title   Channel: ChannelName  (green)

// ─── Storage keys ─────────────────────────────────────────────────────────────
// Add new list types here as the extension grows.

const YT_HIDER_KEYS = {
  NOT_INTERESTED: 'YT_HIDER_NOT_INTERESTED',
  REMOVED_COUNT:  'YT_HIDER_REMOVED_COUNT'
};

const YT_HIDER_SETTINGS_KEY = 'YT_HIDER_SETTINGS';

// ─── Separators ───────────────────────────────────────────────────────────────
// Defined once here. Any future parser or importer references these constants.

const CHANNEL_SEP  = ' <%CHANNEL%> ';
const CATEGORY_TAG = '<%CATEGORY%>';

// ─── Entry parsing ────────────────────────────────────────────────────────────

function getTitlePart(entry) {
  var sep = entry.indexOf(CHANNEL_SEP);
  return sep !== -1 ? entry.substring(0, sep).trim() : entry.trim();
}

function getChannelPart(entry) {
  var sep = entry.indexOf(CHANNEL_SEP);
  return sep !== -1 ? entry.substring(sep + CHANNEL_SEP.length).trim() : null;
}

// ─── Category logic ───────────────────────────────────────────────────────────

function getCategory(entry) {
  var first = getTitlePart(entry).charAt(0);
  if (/[^a-zA-Z0-9]/.test(first)) return 'Special';
  if (/[0-9]/.test(first))        return 'Numerical';
  return first.toUpperCase();
}

function getCategories() {
  return ['Special', 'Numerical', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
}

// ─── Binary search ────────────────────────────────────────────────────────────
// The list is kept sorted by title part (case-insensitive, locale-aware).
// Both functions below operate in O(log n) — about 20 comparisons at 1M entries.

// Returns the index where a given title key would be inserted to maintain sort order.
// Used by both the duplicate check and the insert operation.
function binarySearchPosition(list, titleKey) {
  var lo = 0;
  var hi = list.length;
  while (lo < hi) {
    var mid = (lo + hi) >>> 1;
    if (getTitlePart(list[mid]).toLowerCase().localeCompare(titleKey) < 0) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

// Returns true if the title part of entry already exists in the list.
function entryExists(list, entry) {
  var titleKey = getTitlePart(entry).toLowerCase();
  var pos      = binarySearchPosition(list, titleKey);
  // Check pos and neighbours — localeCompare can have ties across different entries
  for (var i = pos; i < list.length; i++) {
    var candidate = getTitlePart(list[i]).toLowerCase();
    if (candidate.localeCompare(titleKey) > 0) break;
    if (candidate === titleKey) return true;
  }
  return false;
}

// Inserts entry into its correct sorted position.
function insertEntry(list, entry) {
  var trimmed  = entry.trim();
  var titleKey = getTitlePart(trimmed).toLowerCase();
  var pos      = binarySearchPosition(list, titleKey);
  list.splice(pos, 0, trimmed);
  return list;
}



function readList(key, callback) {
  chrome.storage.local.get([key], function(result) {
    var data = result[key];
    if (Array.isArray(data)) {
      callback(data);
    } else {
      // Corrupted, missing, or null — initialise fresh
      chrome.storage.local.set({ [key]: [] }, function() { callback([]); });
    }
  });
}

// ─── Format for export ────────────────────────────────────────────────────────
// Builds the full .txt content from a raw title array.
// Category headers use CATEGORY_TAG. Entry lines kept as-is with CHANNEL_SEP.

function formatList(list) {
  var groups = {};
  list.forEach(function(entry) {
    var cat = getCategory(entry);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(entry);
  });

  var cats  = getCategories().filter(function(c) { return groups[c]; });
  var lines = [];
  cats.forEach(function(cat, i) {
    if (i > 0) lines.push('');
    lines.push(CATEGORY_TAG + ' ' + cat);
    groups[cat].forEach(function(e) { lines.push(e); });
  });

  return lines.join('\n');
}

// ─── Export to .txt file ──────────────────────────────────────────────────────

function exportList(key, filename) {
  readList(key, function(list) {
    if (list.length === 0) return;
    var content = formatList(list);
    var blob    = new Blob([content], { type: 'text/plain' });
    var url     = URL.createObjectURL(blob);
    chrome.downloads.download(
      { url: url, filename: filename, saveAs: false },
      function() { URL.revokeObjectURL(url); }
    );
  });
}

// ─── Remove a single entry by index ──────────────────────────────────────────

function removeEntry(key, index, callback) {
  readList(key, function(list) {
    if (index < 0 || index >= list.length) { if (callback) callback(); return; }
    list.splice(index, 1);
    chrome.storage.local.set({ [key]: list }, function() { if (callback) callback(); });
  });
}
