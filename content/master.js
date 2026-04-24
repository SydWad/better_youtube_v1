// content/master.js
// Orchestrator: init, scan loop, mutation observer, history scraping, popup port.
// Depends on shared.js, actor.js, and all flag_*.js files being loaded first.

var ythPaused      = false;
var ythIsHistoryPage = ythGetPageType() === 'history';

// ─── Process a single renderer ────────────────────────────────────────────────
// Two-phase: all flaggers run first (accumulating data-yth-flags), then actor acts.

function ythProcessRenderer(renderer, list) {
  if (!ythSettings.ext_enabled) return;
  if (renderer.dataset.ythHidden) return;
  delete renderer.dataset.ythFlags; // clear any stale flags from a prior partial run

  ythFlagShorts(renderer);
  ythFlagPlaylists(renderer);
  ythFlagMembers(renderer);
  ythFlagLive(renderer);
  ythFlagAutodub(renderer);
  ythFlagWatched(renderer);
  ythFlagLength(renderer);
  ythFlagViewCount(renderer);
  ythFlagHistory(renderer, list);
  ythFlagBlacklist(renderer);

  ythActOnFlagged(renderer);
}

// ─── Scan all renderers ───────────────────────────────────────────────────────

function ythScanAll() {
  if (ythPaused) return;
  if (window.location.pathname.startsWith('/feed/history')) return;
  if (ythCachedList === null) ythInitialScanDue = true;

  if (ythSettings.hide_shorts) {
    ythHideShortsUI();
    ythHideShortsShelves();
  }

  ythRefreshCache(function(list) {
    document.querySelectorAll(YTH_RENDERER_SELECTOR).forEach(function(r) {
      // Skip yt-lockup-view-model nested inside ytd-rich-item-renderer
      if (r.tagName.toLowerCase() === 'yt-lockup-view-model') {
        var parent = r.parentElement;
        while (parent) {
          var ptag = parent.tagName ? parent.tagName.toLowerCase() : '';
          if (ptag === 'ytd-rich-item-renderer' || ptag === 'ytd-video-renderer') return;
          parent = parent.parentElement;
        }
      }
      ythProcessRenderer(r, list);
    });
  });
}

// ─── History page scraping ────────────────────────────────────────────────────

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
  document.querySelectorAll('yt-lockup-view-model').forEach(function(el) {
    if (ythIsTopLevelLockup(el)) ythScrapeHistoryRenderer(el);
  });
}

function ythScrapeHistoryWithRetry(attempts) {
  var found = 0;
  document.querySelectorAll('yt-lockup-view-model').forEach(function(el) {
    if (ythIsTopLevelLockup(el)) found++;
  });
  if (found > 0) {
    ythScrapeHistoryPage();
    setInterval(ythScrapeHistoryPage, 500);
  } else if (attempts > 0) {
    setTimeout(function() { ythScrapeHistoryWithRetry(attempts - 1); }, 500);
  }
}

// ─── Three-dot menu — capture pending entry ───────────────────────────────────

var pendingEntry = null;

document.addEventListener('click', function(e) {
  var menuBtn = e.target.closest(
    '.yt-lockup-metadata-view-model__menu-button button, .ytLockupMetadataViewModelMenuButton button'
  );
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

// ─── Watch dropdown for Not Interested ───────────────────────────────────────

function ythOnMenuOpen(dropdown) {
  dropdown.querySelectorAll('yt-list-item-view-model').forEach(function(item) {
    var span = item.querySelector('span.yt-list-item-view-model__title');
    if (!span || span.textContent.trim().toLowerCase() !== 'not interested') return;
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
      var m = mutations[i];
      if (m.type === 'attributes' && m.attributeName === 'aria-hidden' &&
          dropdown.getAttribute('aria-hidden') === null) {
        ythOnMenuOpen(dropdown); return;
      }
      if (m.type === 'childList') {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var node = m.addedNodes[j];
          if (node.nodeType === Node.ELEMENT_NODE &&
              node.tagName.toLowerCase() === 'yt-list-item-view-model') {
            ythOnMenuOpen(dropdown); return;
          }
        }
      }
    }
  }).observe(dropdown, { attributes: true, childList: true, subtree: true });
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

new MutationObserver(function(mutations) {
  for (var i = 0; i < mutations.length; i++) {
    for (var j = 0; j < mutations[i].addedNodes.length; j++) {
      var node = mutations[i].addedNodes[j];
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      var tag = node.tagName.toLowerCase();

      // Dropdown
      var dropdown = tag === 'tp-yt-iron-dropdown'
        ? node
        : (node.querySelector ? node.querySelector('tp-yt-iron-dropdown') : null);
      if (dropdown && !dropdown.dataset.ythWatching) {
        dropdown.dataset.ythWatching = '1';
        ythWatchDropdown(dropdown);
      }

      // History page: scrape lockups as they load on scroll
      if (ythIsHistoryPage) {
        if (tag === 'yt-lockup-view-model' && ythIsTopLevelLockup(node)) {
          ythScrapeHistoryRenderer(node);
        }
        if (node.querySelectorAll) {
          node.querySelectorAll('yt-lockup-view-model').forEach(function(el) {
            if (ythIsTopLevelLockup(el)) ythScrapeHistoryRenderer(el);
          });
        }
        continue;
      }

      // Standard renderers
      if (tag === 'ytd-rich-item-renderer' || tag === 'ytd-grid-video-renderer' ||
          tag === 'ytd-compact-video-renderer' || tag === 'ytd-video-renderer') {
        ythRefreshCache(function(list) { ythProcessRenderer(node, list); });
      }

      // yt-lockup-view-model (sidebar, non-history)
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

      // End-screen videowall cards
      if (tag === 'a' && node.classList && node.classList.contains('ytp-modern-videowall-still')) {
        ythRefreshCache(function(list) { ythProcessRenderer(node, list); });
      }
      if (node.querySelectorAll) {
        node.querySelectorAll('a.ytp-modern-videowall-still').forEach(function(card) {
          ythRefreshCache(function(list) { ythProcessRenderer(card, list); });
        });
      }

      // Shorts shelves
      ythMaybeHideShelfNode(node, tag);
    }
  }
}).observe(document.body, { childList: true, subtree: true });

// ─── Popup port ───────────────────────────────────────────────────────────────

chrome.runtime.onConnect.addListener(function(port) {
  if (port.name !== 'YTH_POPUP') return;
  ythPaused = true;
  ythLog('[YT Hider] popup opened — pausing');
  port.postMessage({ type: 'YTH_SESSION_COUNT', count: ythSessionRemovedCount });
  port.onDisconnect.addListener(function() {
    ythLog('[YT Hider] popup closed');
    if (window.location.pathname.startsWith('/feed/history')) {
      ythPaused = false;
      ythScrapeHistoryPage();
    } else {
      location.reload();
    }
  });
});

// ─── Settings load + init ─────────────────────────────────────────────────────

chrome.storage.local.get([YT_HIDER_SETTINGS_KEY], function(result) {
  var s = result[YT_HIDER_SETTINGS_KEY];
  if (s) {
    ythSettings  = s;
    ythListDirty = true;
  } else {
    chrome.storage.local.set({ [YT_HIDER_SETTINGS_KEY]: ythSettings });
  }

  if (!ythSettings.ext_enabled) { ythUnhideAll(); return; }

  if (ythIsHistoryPage) {
    ythScrapeHistoryWithRetry(10);
  } else {
    ythScanAll();
  }

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
// If the user watches a video for 10+ seconds, save it to watch history.

if (ythGetPageType() === 'sidebar') {
  setTimeout(function() {
    if (ythSettings.wl_disabled) return;
    var titleEl =
      document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string') ||
      document.querySelector('h1.style-scope.ytd-watch-metadata yt-formatted-string') ||
      document.querySelector('#title h1 yt-formatted-string');
    var title = titleEl ? titleEl.textContent.trim() : null;
    var channelEl = document.querySelector(
      '#channel-name a, ytd-channel-name a, #owner #channel-name yt-formatted-string'
    );
    var channel = channelEl ? channelEl.textContent.trim() : null;
    if (title) {
      ythLog('[YT Hider] auto-saving watch page video:', title);
      ythSaveEntry(channel ? (title + CHANNEL_SEP + channel) : title);
    }
  }, 10000);
}
