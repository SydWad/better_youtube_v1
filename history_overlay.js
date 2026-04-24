// history_overlay.js
// Loaded on /feed/history as a permanent content script.
// Only activates when YTH_RETRIEVE_PENDING flag is set in storage.
// Kept fully separate from content.js to avoid any interference.

var YTH_LIST_KEY = 'YT_HIDER_NOT_INTERESTED';
var CHANNEL_SEP  = ' <%CHANNEL%> ';

chrome.storage.local.get(['YTH_RETRIEVE_PENDING'], function(r) {
  if (!r.YTH_RETRIEVE_PENDING) return;
  chrome.storage.local.remove('YTH_RETRIEVE_PENDING', function() {
    setTimeout(initOverlay, 1200);
  });
});

function initOverlay() {
  // ─── State ────────────────────────────────────────────────────────────────────
  var running    = false;
  var startTime  = null;
  var elapsedMs  = 0;
  var addedCount = 0;
  var timerHandle  = null;
  var scrapeHandle = null;
  var stallHandle  = null;
  var saveQueue  = [];
  var saveTimer  = null;
  var scrapedSet = new Set();
  var storedSet  = new Set();
  var storedSetReady = false;
  var domObserver = null;
  var lastScrollY = -1;
  var stallSeconds = 0;

  // ─── Build UI ─────────────────────────────────────────────────────────────────
  var overlay = document.createElement('div');
  overlay.id  = '__yth_overlay';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'background:rgba(0,0,0,0.85)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif'
  ].join(';');

  overlay.innerHTML = [
    '<div id="__yth_box" style="',
      'background:#111;border:1px solid #333;border-radius:12px;',
      'padding:42px 48px;width:630px;text-align:center;color:#fff;',
    '">',
      '<div id="__yth_icon_wrap" style="margin-bottom:24px;">',
        '<img id="__yth_icon" src="" style="width:108px;height:108px;object-fit:contain;display:block;margin:0 auto;">',
        '<div id="__yth_icon_fb" style="display:none;font-size:78px;font-weight:700;color:#ff4444;line-height:1;">!</div>',
      '</div>',
      '<div id="__yth_msg" style="font-size:21px;line-height:1.6;color:#e0e0e0;margin-bottom:33px;">',
        'Would you like to load your entire YouTube history right now?',
        '<br><span style="font-size:18px;color:#888;">This may take several minutes to an hour.</span>',
      '</div>',
      '<div id="__yth_timer_row" style="display:none;margin-bottom:24px;">',
        '<span style="font-size:19px;color:#aaa;">Time elapsed: </span>',
        '<span id="__yth_timer" style="font-size:19px;font-weight:700;color:#fff;">0:00</span>',
        '<span style="font-size:19px;color:#aaa;margin-left:30px;">Added: </span>',
        '<span id="__yth_count" style="font-size:19px;font-weight:700;color:#4a9;">0</span>',
      '</div>',
      '<div id="__yth_btn_row" style="display:flex;gap:15px;justify-content:center;flex-wrap:wrap;">',
        '<button id="__yth_yes" style="',
          'padding:15px 48px;background:#44aa44;border:none;border-radius:6px;',
          'color:#fff;font-size:19px;font-weight:700;cursor:pointer;font-family:inherit;',
        '">Yes</button>',
        '<button id="__yth_later" style="',
          'padding:15px 48px;background:#2a2a2a;border:1px solid #555;border-radius:6px;',
          'color:#ccc;font-size:19px;font-weight:600;cursor:pointer;font-family:inherit;',
        '">Maybe Later</button>',
      '</div>',
      '<div id="__yth_stall" style="display:none;margin-top:14px;font-size:13px;color:#882222;">',
        'Page not loading — end of history or network problems?',
      '</div>',
    '</div>'
  ].join('');

  document.body.appendChild(overlay);

  // Set icon src via JS so chrome.runtime.getURL works correctly
  var iconEl = document.getElementById('__yth_icon');
  var iconFb = document.getElementById('__yth_icon_fb');
  iconEl.onerror = function() {
    iconEl.style.display = 'none';
    iconFb.style.display = 'block';
  };
  iconEl.src = chrome.runtime.getURL('icons/icon128.png');

  // ─── Element refs ─────────────────────────────────────────────────────────────
  var msgEl      = document.getElementById('__yth_msg');
  var timerRowEl = document.getElementById('__yth_timer_row');
  var timerEl    = document.getElementById('__yth_timer');
  var countEl    = document.getElementById('__yth_count');
  var btnRowEl   = document.getElementById('__yth_btn_row');
  var stallWarning = document.getElementById('__yth_stall');

  document.getElementById('__yth_yes').addEventListener('click', startRunning);
  document.getElementById('__yth_later').addEventListener('click', function() {
    stopAll(); window.close();
  });

  // ─── DOM element cleaner ──────────────────────────────────────────────────────
  var REMOVE_SEL = [
    'a.yt-lockup-view-model__content-image',
    'yt-thumbnail-overlay-progress-bar-view-model',
    'yt-thumbnail-badge-view-model',
    'yt-thumbnail-view-model',
    'ytd-thumbnail',
    'yt-thumbnail-bottom-overlay-view-model'
  ];

  function cleanEl(root) {
    REMOVE_SEL.forEach(function(s) {
      (root.querySelectorAll ? root.querySelectorAll(s) : [])
        .forEach(function(el) { el.remove(); });
    });
  }

  function startDomCleaner() {
    cleanEl(document);
    domObserver = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (node.nodeType === Node.ELEMENT_NODE) cleanEl(node);
        });
      });
    });
    domObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopDomCleaner() {
    if (domObserver) { domObserver.disconnect(); domObserver = null; }
  }

  // ─── Stall detection ─────────────────────────────────────────────────────────
  function startStallDetector() {
    lastScrollY  = window.scrollY;
    stallSeconds = 0;
    stallWarning.style.display = 'none';
    if (stallHandle) clearInterval(stallHandle);
    stallHandle = setInterval(function() {
      if (!running) return;
      var currentY = window.scrollY;
      if (currentY === lastScrollY) {
        stallSeconds++;
        if (stallSeconds >= 10) stallWarning.style.display = 'block';
      } else {
        stallSeconds = 0;
        lastScrollY  = currentY;
        stallWarning.style.display = 'none';
      }
    }, 1000);
  }

  function stopStallDetector() {
    if (stallHandle) { clearInterval(stallHandle); stallHandle = null; }
    stallWarning.style.display = 'none';
  }
  function startRunning() {
    running   = true;
    startTime = Date.now() - elapsedMs;

    chrome.runtime.sendMessage({ action: 'yth_enable_blocker' });
    startDomCleaner();

    msgEl.style.display      = 'none';
    timerRowEl.style.display = 'block';
    btnRowEl.innerHTML =
      '<button id="__yth_stop" style="' +
        'width:100%;padding:15px;background:#cc3333;border:none;border-radius:6px;' +
        'color:#fff;font-size:21px;font-weight:700;cursor:pointer;font-family:inherit;' +
        'letter-spacing:0.05em;">Stop</button>';
    document.getElementById('__yth_stop').addEventListener('click', pauseRunning);

    chrome.runtime.sendMessage({ action: 'yth_scroll_start' });
    timerHandle  = setInterval(tickTimer, 500);
    scrapeHandle = setInterval(function() { if (running) scrapeVisible(); }, 200);
    startStallDetector();
  }

  function pauseRunning() {
    running   = false;
    elapsedMs = Date.now() - startTime;
    chrome.runtime.sendMessage({ action: 'yth_scroll_stop' });
    stopDomCleaner();
    stopStallDetector();
    clearInterval(timerHandle);
    clearInterval(scrapeHandle);

    btnRowEl.innerHTML =
      '<button id="__yth_continue" style="' +
        'flex:1;padding:15px 30px;background:#44aa44;border:none;border-radius:6px;' +
        'color:#fff;font-size:19px;font-weight:700;cursor:pointer;font-family:inherit;' +
      '">Continue</button>' +
      '<button id="__yth_quit" style="' +
        'flex:1;padding:15px 30px;background:#cc3333;border:none;border-radius:6px;' +
        'color:#fff;font-size:19px;font-weight:700;cursor:pointer;font-family:inherit;' +
      '">Quit</button>';
    document.getElementById('__yth_continue').addEventListener('click', startRunning);
    document.getElementById('__yth_quit').addEventListener('click', function() {
      stopAll(); window.close();
    });
  }

  function stopAll() {
    running = false;
    chrome.runtime.sendMessage({ action: 'yth_scroll_stop' });
    chrome.runtime.sendMessage({ action: 'yth_disable_blocker' });
    stopDomCleaner();
    stopStallDetector();
    clearInterval(timerHandle);
    clearInterval(scrapeHandle);
    flushQueue();
  }

  // ─── Timer ────────────────────────────────────────────────────────────────────
  function tickTimer() {
    var ms  = Date.now() - startTime;
    var s   = Math.floor(ms / 1000);
    timerEl.textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  // ─── Scraping ─────────────────────────────────────────────────────────────────
  function scrapeVisible() {
    document.querySelectorAll('yt-lockup-view-model').forEach(function(el) {
      // Skip nested lockups (home feed)
      var p = el.parentElement;
      while (p) {
        if (p.tagName && p.tagName.toLowerCase() === 'ytd-rich-item-renderer') return;
        p = p.parentElement;
      }
      var h3 = el.querySelector(
        'h3.yt-lockup-metadata-view-model__heading-reset, h3.ytLockupMetadataViewModelHeadingReset'
      );
      var title = h3 ? h3.getAttribute('title') : null;
      if (!title || scrapedSet.has(title)) return;
      scrapedSet.add(title);

      var channel = null;
      var chLink = el.querySelector(
        '.yt-lockup-metadata-view-model__text-container a[href^="/@"], ' +
        '.ytLockupMetadataViewModelTextContainer a[href^="/@"]'
      );
      if (chLink) {
        channel = chLink.textContent.trim();
      } else {
        var metaRow = el.querySelector(
          '.yt-content-metadata-view-model__metadata-row, .ytContentMetadataViewModelMetadataRow'
        );
        if (metaRow) {
          var span = metaRow.querySelector('span.yt-core-attributed-string, span.ytCoreAttributedString');
          if (span) channel = span.textContent.trim();
        }
      }

      queueEntry(channel ? (title + CHANNEL_SEP + channel) : title);
    });
  }

  // ─── Batch save — O(log n) binary search, Set-based dedup ────────────────────
  function getTitlePart(entry) {
    var sep = entry.indexOf(CHANNEL_SEP);
    return sep !== -1 ? entry.substring(0, sep).trim() : entry.trim();
  }

  function binInsert(list, entry) {
    var key = getTitlePart(entry).toLowerCase();
    var lo = 0, hi = list.length;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (getTitlePart(list[mid]).toLowerCase().localeCompare(key) < 0) lo = mid + 1;
      else hi = mid;
    }
    list.splice(lo, 0, entry);
  }

  function queueEntry(entry) {
    saveQueue.push(entry);
    if (!saveTimer) saveTimer = setTimeout(flushQueue, 300);
  }

  function flushQueue() {
    saveTimer = null;
    if (saveQueue.length === 0) return;
    var toSave = saveQueue.slice(); saveQueue = [];

    chrome.storage.local.get([YTH_LIST_KEY], function(r) {
      var list = Array.isArray(r[YTH_LIST_KEY]) ? r[YTH_LIST_KEY] : [];

      // Build stored set on first flush for O(1) dedup
      if (!storedSetReady) {
        list.forEach(function(e) { storedSet.add(getTitlePart(e).toLowerCase()); });
        storedSetReady = true;
      }

      var added = 0;
      toSave.forEach(function(entry) {
        var key = getTitlePart(entry).toLowerCase();
        if (storedSet.has(key)) return;
        storedSet.add(key);
        binInsert(list, entry);
        added++;
      });

      if (added === 0) return;
      chrome.storage.local.set({ [YTH_LIST_KEY]: list }, function() {
        addedCount += added;
        countEl.textContent = addedCount;
      });
    });
  }
}
