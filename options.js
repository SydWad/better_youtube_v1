// options.js
// Depends on list_manager.js being loaded first via options.html script tag.

const toggleDev        = document.getElementById('toggle-dev');
const toggleWLDisabled = document.getElementById('toggle-wl-disabled');
const toggleBlacklist  = document.getElementById('toggle-blacklist');
const blacklistWords   = document.getElementById('blacklist-words-options');
const savedMsg         = document.getElementById('saved-msg');
const expandBtn        = document.getElementById('expand-watch-list');
const expandArrow      = document.getElementById('expand-arrow');
const watchListPanel   = document.getElementById('watch-list-panel');
const watchListInner   = document.getElementById('watch-list-inner');

let listLoaded = false;
let panelOpen  = false;

// ─── Settings ─────────────────────────────────────────────────────────────────

var devVideoWrap = document.getElementById('dev-video-wrap');
var devVideo     = document.getElementById('dev-video');

function isDesktop() {
  return window.innerWidth >= 1000 && !navigator.maxTouchPoints;
}

function updateDevVideo(enabled) {
  if (!isDesktop()) {
    devVideoWrap.classList.remove('visible');
    devVideo.pause();
    return;
  }
  if (enabled) {
    devVideoWrap.classList.add('visible');
    devVideo.play();
  } else {
    devVideoWrap.classList.remove('visible');
    devVideo.pause();
  }
}

function loadSettings() {
  chrome.storage.local.get([YT_HIDER_SETTINGS_KEY], function(result) {
    var settings = result[YT_HIDER_SETTINGS_KEY] || {};
    toggleDev.checked        = !!settings.dev_tools_enabled;
    toggleWLDisabled.checked = !!settings.wl_disabled;
    toggleBlacklist.checked  = !!settings.blacklist_enabled;
    blacklistWords.value     = settings.blacklist_words !== undefined ? settings.blacklist_words : 'MineCraft, Roblox';
    updateDevVideo(!!settings.dev_tools_enabled);
  });
}

function saveSettings() {
  chrome.storage.local.get([YT_HIDER_SETTINGS_KEY], function(result) {
    var settings = result[YT_HIDER_SETTINGS_KEY] || {};
    settings.dev_tools_enabled = toggleDev.checked;
    settings.wl_disabled       = toggleWLDisabled.checked;
    settings.blacklist_enabled = toggleBlacklist.checked;
    settings.blacklist_words   = blacklistWords.value;
    chrome.storage.local.set({ [YT_HIDER_SETTINGS_KEY]: settings }, function() {
      savedMsg.textContent = 'Saved.';
      setTimeout(function() { savedMsg.textContent = ''; }, 1500);
    });
  });
}

toggleDev.addEventListener('change', function() {
  updateDevVideo(toggleDev.checked);
  saveSettings();
});
toggleBlacklist.addEventListener('change', saveSettings);

var blacklistDebounce = null;
blacklistWords.addEventListener('input', function() {
  clearTimeout(blacklistDebounce);
  blacklistDebounce = setTimeout(saveSettings, 600);
});

// ─── Disable WL modal ─────────────────────────────────────────────────────────

var modalOverlay   = document.getElementById('modal-overlay');
var modalBtnDisable = document.getElementById('modal-btn-disable');
var modalBtnCancel  = document.getElementById('modal-btn-cancel');
var modalBtnDelete  = document.getElementById('modal-btn-delete');
var confirmOverlay  = null; // removed — using native confirm() instead

function showModal() {
  modalOverlay.classList.add('visible');
}
function hideModal() {
  modalOverlay.classList.remove('visible');
}

toggleWLDisabled.addEventListener('change', function() {
  if (toggleWLDisabled.checked) {
    // Intercept — revert toggle, show modal instead
    toggleWLDisabled.checked = false;
    showModal();
  } else {
    // Re-enabling — just save
    saveSettings();
  }
});

// "Just Disable History" — disable without deleting
modalBtnDisable.addEventListener('click', function() {
  hideModal();
  toggleWLDisabled.checked = true;
  saveSettings();
});

// Cancel — do nothing
modalBtnCancel.addEventListener('click', function() {
  hideModal();
});

// "DELETE HISTORY" — close modal, show native browser confirm
modalBtnDelete.addEventListener('click', function() {
  hideModal();
  if (confirm('Wipe all Watch History? This cannot be undone.')) {
    chrome.storage.local.set({ [YT_HIDER_KEYS.NOT_INTERESTED]: [] }, function() {
      toggleWLDisabled.checked = true;
      saveSettings();
      var countEl = document.getElementById('wh-count');
      if (countEl) countEl.textContent = '0 entries';
      listLoaded = false;
      if (panelOpen) buildWatchList();
    });
  }
});

// Click outside modal to cancel
modalOverlay.addEventListener('click', function(e) {
  if (e.target === modalOverlay) hideModal();
});

// ─── Export button (options page) ────────────────────────────────────────────

document.getElementById('btn-export-options').addEventListener('click', function() {
  exportList(YT_HIDER_KEYS.NOT_INTERESTED, 'Watched_Videos.txt');
});

// ─── Watch list panel — only loads when expanded ──────────────────────────────

expandBtn.addEventListener('click', () => {
  panelOpen = !panelOpen;
  watchListPanel.style.display = panelOpen ? 'block' : 'none';
  expandArrow.classList.toggle('open', panelOpen);
  if (panelOpen && !listLoaded) {
    listLoaded = true;
    buildWatchList();
  }
});

// Search filter
document.getElementById('watch-list-search').addEventListener('input', function() {
  var q = this.value.trim().toLowerCase();
  watchListInner.querySelectorAll('.entry-row').forEach(function(row) {
    var text = row.querySelector('.entry-text') ? row.querySelector('.entry-text').textContent.toLowerCase() : '';
    row.style.display = (!q || text.includes(q)) ? '' : 'none';
  });
  // Show/hide category headers based on whether any entries in them are visible
  watchListInner.querySelectorAll('.cat-header').forEach(function(header) {
    var next = header.nextElementSibling;
    var anyVisible = false;
    while (next && !next.classList.contains('cat-header')) {
      if (next.style.display !== 'none') anyVisible = true;
      next = next.nextElementSibling;
    }
    header.style.display = anyVisible ? '' : 'none';
  });
});

function buildWatchList() {
  readList(YT_HIDER_KEYS.NOT_INTERESTED, function(list) {
    watchListInner.innerHTML = '';

    if (list.length === 0) {
      watchListInner.innerHTML = '<div class="list-empty">No entries recorded yet.</div>';
      return;
    }

    // Group by category
    const groups = {};
    list.forEach((entry, index) => {
      const cat = getCategory(entry);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ entry, index });
    });

    getCategories().filter(c => groups[c]).forEach((cat) => {
      const header = document.createElement('div');
      header.className = 'cat-header';
      header.textContent = 'CATEGORY: ' + cat;
      watchListInner.appendChild(header);

      groups[cat].forEach(({ entry, index }) => {
        const title   = getTitlePart(entry);
        const channel = getChannelPart(entry);

        const row = document.createElement('div');
        row.className = 'entry-row';
        row.dataset.index = index;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Remove from list';
        removeBtn.addEventListener('click', () => onRemove(index, row));

        const text = document.createElement('div');
        text.className = 'entry-text';
        text.textContent = title;
        if (channel) {
          const ch = document.createElement('span');
          ch.className = 'entry-channel';
          ch.textContent = '  Channel: ' + channel;
          text.appendChild(ch);
        }

        row.appendChild(removeBtn);
        row.appendChild(text);
        watchListInner.appendChild(row);
      });
    });
  });
}

function onRemove(index, rowEl) {
  removeEntry(YT_HIDER_KEYS.NOT_INTERESTED, index, function() {
    rowEl.remove();
    listLoaded = false;
    buildWatchList();
    listLoaded = true;
    // Update header count
    readList(YT_HIDER_KEYS.NOT_INTERESTED, function(list) {
      var countEl = document.getElementById('wh-count');
      if (countEl) countEl.textContent = list.length + ' entr' + (list.length === 1 ? 'y' : 'ies');
    });
  });
}

// ─── Import Watch History ─────────────────────────────────────────────────────

var btnUpload  = document.getElementById('btn-upload');
var uploadZone = document.getElementById('upload-zone');
var fileInput  = document.getElementById('file-input');
var toast      = document.getElementById('toast');
var toastTitle = document.getElementById('toast-title');
var toastSub   = document.getElementById('toast-sub');
var toastTimer = null;

function showToast(type, title, sub) {
  if (toastTimer) clearTimeout(toastTimer);
  toast.className = type;
  toastTitle.textContent = title;
  toastSub.textContent   = sub || '';
  // Force reflow so transition fires even if toast was already visible
  toast.classList.remove('visible');
  void toast.offsetWidth;
  toast.classList.add('visible');
  toastTimer = setTimeout(function() {
    toast.classList.remove('visible');
  }, 4000);
}

btnUpload.addEventListener('click', function(e) {
  e.stopPropagation();
  fileInput.value = '';
  fileInput.click();
});

uploadZone.addEventListener('click', function() {
  fileInput.value = '';
  fileInput.click();
});

fileInput.addEventListener('change', function() {
  var file = fileInput.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onerror = function() { showToast('error', 'Upload Failed!', ''); };
  reader.onload = function(e) {
    try {
      var parsed = parseWatchedFile(e.target.result);
      if (parsed === null) { showToast('error', 'Upload Failed!', ''); return; }
      importEntries(parsed);
    } catch (err) {
      showToast('error', 'Upload Failed!', '');
    }
  };
  reader.readAsText(file);
});

// Parse a Watched_Videos.txt file into an array of raw entry strings
function parseWatchedFile(text) {
  if (!text || text.trim().length === 0) return null;
  var lines   = text.split(/\r?\n/);
  var entries = [];
  var valid   = false;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.length === 0) continue;
    if (line.startsWith('<%CATEGORY%>') || line.startsWith('CATEGORY:')) {
      valid = true;
      continue;
    }
    entries.push(line);
  }
  if (!valid) return null;
  return entries;
}

// Merge parsed entries into existing storage list
function importEntries(entries) {
  if (!entries || entries.length === 0) { showToast('error', 'Upload Failed!', ''); return; }
  readList(YT_HIDER_KEYS.NOT_INTERESTED, function(existing) {
    var added = 0;
    entries.forEach(function(entry) {
      var titleKey = getTitlePart(entry).toLowerCase();
      if (!titleKey) return;
      var isDupe = existing.some(function(e) {
        return getTitlePart(e).toLowerCase() === titleKey;
      });
      if (isDupe) return;
      var trimmed = entry.trim();
      var i = 0;
      while (i < existing.length &&
        getTitlePart(trimmed).toLowerCase().localeCompare(getTitlePart(existing[i]).toLowerCase()) > 0) i++;
      existing.splice(i, 0, trimmed);
      added++;
    });
    chrome.storage.local.set({ [YT_HIDER_KEYS.NOT_INTERESTED]: existing }, function() {
      showToast('success', 'Watch History Uploaded!', 'New history added to current history!');
      readList(YT_HIDER_KEYS.NOT_INTERESTED, function(list) {
        var countEl = document.getElementById('wh-count');
        if (countEl) countEl.textContent = list.length + ' entr' + (list.length === 1 ? 'y' : 'ies');
      });
      listLoaded = false;
      if (panelOpen) buildWatchList();
    });
  });
}



// Load entry count for header
readList(YT_HIDER_KEYS.NOT_INTERESTED, function(list) {
  var countEl = document.getElementById('wh-count');
  if (countEl) countEl.textContent = list.length + ' entr' + (list.length === 1 ? 'y' : 'ies');
});

// Pause video when tab loses focus, resume when it returns
document.addEventListener('visibilitychange', function() {
  if (!devVideoWrap.classList.contains('visible')) return;
  if (document.hidden) {
    devVideo.pause();
  } else {
    devVideo.play();
  }
});

loadSettings();
