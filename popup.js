// popup.js
// Depends on list_manager.js being loaded first.

var countEl          = document.getElementById('count-watched');
var countRemoved     = document.getElementById('count-removed');
var btnExport        = document.getElementById('btn-export');
var btnWipe          = document.getElementById('btn-wipe');
var devSection       = document.getElementById('dev-section');
var settingsBtn      = document.getElementById('settings-btn');
var settingsIconImg  = document.getElementById('settings-icon-img');
var settingsFallback = document.getElementById('settings-icon-fallback');
var wlDisabledNotice = document.getElementById('wl-disabled-notice');
var rwhBox           = document.getElementById('rwh-box');
var btnReload        = document.getElementById('btn-reload');
var extToggleBtn     = document.getElementById('ext-toggle-btn');
var extToggleLabel   = document.getElementById('ext-toggle-label');

var togglePW         = document.getElementById('toggle-pw');
var sliderPW         = document.getElementById('slider-pw');
var sliderPct        = document.getElementById('slider-pct');
var toggleLength     = null; // removed — blank=∞ replaces toggle
var lengthMin        = document.getElementById('length-min');
var lengthMax        = document.getElementById('length-max');
var viewCountMin     = document.getElementById('viewcount-min');
var toggleShorts     = document.getElementById('toggle-shorts');
var togglePlaylists  = document.getElementById('toggle-playlists');
var toggleMembers    = document.getElementById('toggle-members');
var toggleLive       = document.getElementById('toggle-live');
var filterHome       = document.getElementById('filter-home');
var filterSubs       = document.getElementById('filter-subs');
var filterChannel    = document.getElementById('filter-channel');
var filterSearch     = document.getElementById('filter-search');
var filterSidebar    = document.getElementById('filter-sidebar');
var toggleRWH        = document.getElementById('toggle-rwh');
var toggleDebug          = document.getElementById('toggle-debug');
var toggleBlacklist  = document.getElementById('toggle-blacklist');
var blacklistWords   = document.getElementById('blacklist-words');

// ─── Settings icon ────────────────────────────────────────────────────────────

function loadSettingsIcon() {
  var candidates = ['icons/settings.png', 'icons/settings.ico', 'settings.png', 'settings.ico'];
  var index = 0;
  function tryNext() {
    if (index >= candidates.length) {
      settingsIconImg.style.display  = 'none';
      settingsFallback.style.display = '';
      return;
    }
    var url = chrome.runtime.getURL(candidates[index]);
    settingsIconImg.src = url;
    settingsIconImg.onload = function() {
      settingsIconImg.style.display  = 'block';
      settingsFallback.style.display = 'none';
    };
    settingsIconImg.onerror = function() { index++; tryNext(); };
  }
  tryNext();
}

settingsBtn.addEventListener('click', function() { chrome.runtime.openOptionsPage(); });

// ─── Enable/disable button ────────────────────────────────────────────────────

function updateExtToggleUI(enabled) {
  if (enabled) {
    extToggleBtn.classList.remove('disabled');
    extToggleLabel.textContent = 'ENABLED';
  } else {
    extToggleBtn.classList.add('disabled');
    extToggleLabel.textContent = 'DISABLED';
  }
}

extToggleBtn.addEventListener('click', function() {
  chrome.storage.local.get([YT_HIDER_SETTINGS_KEY], function(result) {
    var s = result[YT_HIDER_SETTINGS_KEY] || {};
    s.ext_enabled = !s.ext_enabled;
    if (s.ext_enabled === undefined) s.ext_enabled = false;
    chrome.storage.local.set({ [YT_HIDER_SETTINGS_KEY]: s }, function() {
      updateExtToggleUI(s.ext_enabled);
    });
  });
});

// ─── Entry count ──────────────────────────────────────────────────────────────

function loadCount() {
  readList(YT_HIDER_KEYS.NOT_INTERESTED, function(list) {
    var count = list.length;
    countEl.textContent = count + ' entr' + (count === 1 ? 'y' : 'ies');
    btnExport.disabled  = count === 0;
  });
  // Removed count comes from the content script session via port — starts at 0
  countRemoved.textContent = '0 items';
}

// ─── Developer + wl_disabled section ─────────────────────────────────────────

function loadDevSetting() {
  chrome.storage.local.get([YT_HIDER_SETTINGS_KEY], function(result) {
    var s = result[YT_HIDER_SETTINGS_KEY] || {};
    if (s.dev_tools_enabled) devSection.style.display = 'block';
    if (s.wl_disabled) {
      wlDisabledNotice.style.display = 'block';
      btnExport.style.display        = 'none';
      countEl.style.display          = 'none';
      rwhBox.style.display           = 'none';
    }
  });
}

// ─── Load all settings ────────────────────────────────────────────────────────

function loadSettings() {
  chrome.storage.local.get([YT_HIDER_SETTINGS_KEY], function(result) {
    var s = result[YT_HIDER_SETTINGS_KEY] || {};

    updateExtToggleUI(s.ext_enabled !== false);

    togglePW.checked      = !!s.pw_enabled;
    sliderPW.value        = typeof s.pw_threshold === 'number' ? s.pw_threshold : 50;
    sliderPct.textContent = sliderPW.value + '%';

    lengthMin.value = s.length_min !== undefined ? s.length_min : '';
    lengthMax.value = s.length_max !== undefined ? s.length_max : '';

    viewCountMin.value = s.view_count_min ? formatViewCount(s.view_count_min) : '';

    toggleShorts.checked    = !!s.hide_shorts;
    togglePlaylists.checked = !!s.hide_playlists;
    toggleMembers.checked   = !!s.hide_members;
    toggleLive.checked      = !!s.hide_live;

    filterHome.checked    = s.filter_home    !== false;
    filterSubs.checked    = s.filter_subs    !== false;
    filterChannel.checked = s.filter_channel !== false;
    filterSearch.checked  = !!s.filter_search;
    filterSidebar.checked = s.filter_sidebar !== false;

    toggleRWH.checked          = s.rwh_enabled !== false;
    toggleDebug.checked        = !!s.debug_enabled;
    toggleBlacklist.checked = !!s.blacklist_enabled;
    blacklistWords.value    = s.blacklist_words !== undefined ? s.blacklist_words : 'MineCraft, Roblox';
  });
}

// ─── Save and notify ─────────────────────────────────────────────────────────

function saveSettings() {
  chrome.storage.local.get([YT_HIDER_SETTINGS_KEY], function(result) {
    var s = result[YT_HIDER_SETTINGS_KEY] || {};

    s.pw_enabled        = togglePW.checked;
    s.pw_threshold      = parseInt(sliderPW.value);
    s.length_min        = lengthMin.value.trim() || '';
    s.length_max        = lengthMax.value.trim() || '';
    s.length_enabled    = !!(s.length_min || s.length_max);
    s.view_count_min    = parseViewCountInput(viewCountMin.value);
    s.view_count_enabled = s.view_count_min > 0;
    s.hide_shorts       = toggleShorts.checked;
    s.hide_playlists    = togglePlaylists.checked;
    s.hide_members      = toggleMembers.checked;
    s.hide_live         = toggleLive.checked;
    s.filter_home       = filterHome.checked;
    s.filter_subs       = filterSubs.checked;
    s.filter_channel    = filterChannel.checked;
    s.filter_search     = filterSearch.checked;
    s.filter_sidebar    = filterSidebar.checked;
    s.rwh_enabled       = toggleRWH.checked;
    s.debug_enabled     = toggleDebug.checked;
    s.blacklist_enabled = toggleBlacklist.checked;
    s.blacklist_words   = blacklistWords.value;

    chrome.storage.local.set({ [YT_HIDER_SETTINGS_KEY]: s });
  });
}

// ─── Duration auto-format ─────────────────────────────────────────────────────

function ythFormatDuration(val) {
  var raw = val.replace(/[^0-9]/g, '');
  // Strip leading zeros
  raw = raw.replace(/^0+/, '') || '';
  if (raw === '') return ''; // blank = infinite
  // Cap to 4 significant digits (max 99:59)
  if (raw.length > 4) raw = raw.slice(-4);
  if (raw.length === 1) return '0:0' + raw;
  if (raw.length === 2) return '0:' + raw;
  if (raw.length === 3) return raw[0] + ':' + raw.slice(1);
  return raw.slice(0, 2) + ':' + raw.slice(2);
}

function ythAutoFormat(input) {
  var formatted = ythFormatDuration(input.value);
  input.value = formatted;
  saveSettings();
}

// ─── View count format / parse ────────────────────────────────────────────────

function parseViewCountInput(val) {
  if (!val || val.trim() === '') return 0;
  // Strip commas and whitespace, parse as integer
  var n = parseInt(val.replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

function formatViewCount(n) {
  if (!n || n === 0) return '';
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

viewCountMin.addEventListener('blur', function() {
  var n = parseViewCountInput(viewCountMin.value);
  viewCountMin.value = n > 0 ? formatViewCount(n) : '';
  saveSettings();
});
viewCountMin.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { viewCountMin.blur(); }
});


lengthMin.addEventListener('blur',    function() { ythAutoFormat(lengthMin); });
lengthMax.addEventListener('blur',    function() { ythAutoFormat(lengthMax); });
lengthMin.addEventListener('keydown', function(e) { if (e.key === 'Enter') { ythAutoFormat(lengthMin); lengthMin.blur(); } });
lengthMax.addEventListener('keydown', function(e) { if (e.key === 'Enter') { ythAutoFormat(lengthMax); lengthMax.blur(); } });

// ─── Slider live label ────────────────────────────────────────────────────────

sliderPW.addEventListener('input', function() { sliderPct.textContent = sliderPW.value + '%'; });

// ─── Attach save listeners ────────────────────────────────────────────────────

[togglePW, toggleShorts, togglePlaylists, toggleMembers, toggleLive,
 filterHome, filterSubs, filterChannel, filterSearch, filterSidebar,
 toggleRWH, toggleDebug, toggleBlacklist].forEach(function(el) {
  el.addEventListener('change', saveSettings);
});

sliderPW.addEventListener('change', saveSettings);

var blacklistDebounce = null;
blacklistWords.addEventListener('input', function() {
  clearTimeout(blacklistDebounce);
  blacklistDebounce = setTimeout(saveSettings, 600);
});

// ─── Export / Wipe ────────────────────────────────────────────────────────────

btnExport.addEventListener('click', function() {
  exportList(YT_HIDER_KEYS.NOT_INTERESTED, 'Watched_Videos.txt');
});

document.getElementById('btn-retrieve').addEventListener('click', function() {
  if (!confirm('You are about to be taken to the YouTube history page.')) return;
  // Set flag so history_overlay.js knows to show the overlay when it loads
  chrome.storage.local.set({ YTH_RETRIEVE_PENDING: true }, function() {
    chrome.tabs.create({ url: 'https://www.youtube.com/feed/history' });
  });
});

btnWipe.addEventListener('click', function() {
  if (!confirm('Wipe all Watch History? This cannot be undone.')) return;
  chrome.storage.local.set({ [YT_HIDER_KEYS.NOT_INTERESTED]: [] }, function() { loadCount(); });
});

btnReload.addEventListener('click', function() {
  chrome.runtime.reload();
});

// ─── Notify content script of popup open/close ───────────────────────────────
// Uses a long-lived port — onDisconnect fires synchronously when popup closes.

chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
  if (!tabs[0]) return;
  var port = chrome.tabs.connect(tabs[0].id, { name: 'YTH_POPUP' });
  port.onMessage.addListener(function(msg) {
    if (msg.type === 'YTH_SESSION_COUNT') {
      var n = msg.count || 0;
      countRemoved.textContent = n + ' item' + (n === 1 ? '' : 's');
    }
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

loadSettingsIcon();
loadCount();
loadDevSetting();
loadSettings();
