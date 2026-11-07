var CACHE = 'nextalk-v29-5'; // v29: NexTalk re-brand + new theme + new intro (cache name bumped so every phone gets the new design)
var META  = 'cp-meta';         // v18: small separate cache where the SW remembers its user-id
var SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './intro.mp4', './ringtone.mp3'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    // Never delete the META cache - it holds this device's user-id
    return Promise.all(keys.map(function (k) { if (k !== CACHE && k !== META) return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

/* v18: after login the page sends us its user-id and we store it in the
   META cache. This way push_peek finds the right user's personal messages
   even on devices with an OLD service worker registration. */
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.t === 'cp-uid') {
    /* v27: the backend now requires a session token on every call, so the
       worker has to keep one too - otherwise the push_peek fallback would
       come back with "session expired" and no notification text. */
    var pr = caches.open(META).then(function (c) {
      return Promise.all([
        c.put('./cp-uid', new Response(String(d.uid || ''))),
        c.put('./cp-token', new Response(String(d.token || '')))
      ]);
    }).catch(function () {});
    if (e.waitUntil) e.waitUntil(pr);
  }
});
function getUid_() {
  if (UID) return Promise.resolve(UID); // if the registration URL gave us one, that is the most reliable
  return caches.open(META).then(function (c) { return c.match('./cp-uid'); })
    .then(function (r) { return r ? r.text() : ''; })
    .catch(function () { return ''; });
}
function getToken_() {
  return caches.open(META).then(function (c) { return c.match('./cp-token'); })
    .then(function (r) { return r ? r.text() : ''; })
    .catch(function () { return ''; });
}

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  // API calls (Apps Script) always go to the network
  if (url.hostname.indexOf('script.google') > -1 || url.hostname.indexOf('googleusercontent') > -1 || e.request.method !== 'GET') return;
  // App shell: network-first, cache when offline
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (m) { return m || caches.match('./index.html'); });
    })
  );
});

/* Tap on a notification -> focus the app, or open a new window if it is closed */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var d = (e.notification && e.notification.data) || {};
  /* v29.3: "Decline" button on the incoming-call notification -> tell the
     caller right away (no need to open the app) */
  if (e.action === 'decline' && d.call && API) {
    e.waitUntil(Promise.all([getUid_(), getToken_()]).then(function (pair) {
      return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'sig_send', userId: pair[0], token: pair[1], to: d.call.from,
          sig: JSON.stringify({ type: 'decline', room: d.call.room }) }) });
    }).catch(function () {}));
    return;
  }
  var target = d.call ? './?call=1' : './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if ('focus' in c) { try { c.postMessage({ t: 'cp-open', call: !!d.call }); } catch (x) {} return c.focus(); }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

/* ================================================================
   REAL PUSH - the push service (FCM/Mozilla) wakes this worker up
   even when the app is CLOSED. We fetch the latest message from the
   backend and show the sender's name + text in the notification.
   The API URL arrives in the ?u= query param at registration time.
   ================================================================ */
var API = '', UID = '';
try {
  var _sp = new URL(self.location.href).searchParams;
  API = _sp.get('u') || '';
  UID = _sp.get('uid') || ''; // v16: this device's user - personal DMs are targeted at them
} catch (e) {}

/* v19: on iOS/Safari it is MANDATORY to show a notification for EVERY push -
   if you do not, Safari REVOKES the subscription after 2-3 of them
   ("silent push" policy). That is why on Apple devices the notification is
   shown even while the app is open. */
var IS_APPLE = /iPhone|iPad|iPod|Macintosh/i.test((self.navigator && self.navigator.userAgent) || '');

/* v28: remember the last few push ids we already showed. Apple's push
   service can deliver the SAME push more than once (and a stale second
   subscription used to cause a literal duplicate). If we have shown this
   id already, we still must show SOMETHING on iOS (userVisibleOnly), but
   we make it a silent, self-closing one so the user only really sees ONE. */
/* v29.2: the seen-list now lives in the META cache, not only in memory -
   iOS kills the worker between two pushes, so an in-memory list forgot
   everything and the SAME push id was shown again as a new card. */
var _seenIds = null;
function seenLoad_() {
  if (_seenIds) return Promise.resolve(_seenIds);
  return caches.open(META).then(function (c) { return c.match('./cp-seen'); })
    .then(function (r) { return r ? r.json() : []; })
    .then(function (a) { _seenIds = Array.isArray(a) ? a : []; return _seenIds; })
    .catch(function () { _seenIds = []; return _seenIds; });
}
function seenMark_(id) {
  return seenLoad_().then(function (a) {
    if (a.indexOf(id) > -1) return true;
    a.push(id); if (a.length > 60) a.splice(0, a.length - 60);
    return caches.open(META).then(function (c) { return c.put('./cp-seen', new Response(JSON.stringify(a))); })
      .catch(function () {}).then(function () { return false; });
  });
}

self.addEventListener('push', function (e) {
  /* v19: the encrypted payload (name + text) now travels INSIDE the push.
     This makes the push deliverable on iOS AND lets any device show the
     notification in 0 seconds with no network round trip. */
  var data = null;
  try { if (e.data) data = e.data.json(); } catch (err) { data = null; }
  if (data && data.i) {
    /* v29.2: a push id we have ALREADY shown -> re-show the SAME notification
       (same tag, renotify:false). The OS replaces the existing card in place:
       no second card, no second buzz - and the "every push shows a
       notification" rule for iOS/Chrome is still satisfied. */
    e.waitUntil(seenMark_(String(data.i)).then(function (dup) {
      if (dup) return showFromPayload_(data, false, true);
      return handlePush_(data);
    }));
    return;
  }
  e.waitUntil(handlePush_(data));
});

/* Notification straight from the payload - no backend call needed */
function showFromPayload_(m, quiet, dup) {
  /* v27: every message gets its OWN notification.
     Previously every chat push used the fixed tag 'cp-live', so message #2
     silently REPLACED message #1 on the lock screen - which looked exactly
     like "only some messages notify me". m.i is a unique id the server now
     stamps on each push. */
  var uniq = m.i ? String(m.i) : String(Date.now());
  if (m.t === 'CALL') {
    /* v29.3: WhatsApp-style incoming call card - caller NAME + NUMBER,
       Answer / Decline buttons, stays on screen until handled, strong
       vibration. Only the person being called receives this push. */
    return self.registration.showNotification(
      (m.k === 'video' ? '\ud83d\udcf9 Incoming video call' : '\ud83d\udcde Incoming voice call'),
      {
        body: (m.n || 'NexTalk') + (m.c ? '\n\ud83d\udcf1 ' + m.c : '') + '\nNexTalk \u2022 tap to answer',
        tag: 'cp-call', renotify: true, requireInteraction: true,
        icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
        vibrate: [500, 300, 500, 300, 500, 300, 500],
        actions: [{ action: 'answer', title: '\u2705 Answer' }, { action: 'decline', title: '\u274c Decline' }],
        data: { url: './?call=1', call: { from: m.f || '', room: m.r || '', name: m.n || '', kind: m.k || 'voice' } }
      }
    );
  }
  if (m.t === 'DM')   return showMsg_('\ud83d\udcac ' + (m.n || 'Message'), String(m.x || ''), 'cp-dm-' + uniq, quiet, dup);
  if (m.t === 'SHOT') return showMsg_('\ud83d\udcf8 ' + (m.n || ''), 'Uploaded a screenshot' + (m.f ? ': ' + m.f : ''), 'cp-up-' + uniq, quiet, dup);
  if (m.t === 'FILE') return showMsg_('\ud83d\udcce ' + (m.n || ''), 'Uploaded a file' + (m.f ? ': ' + m.f : ''), 'cp-up-' + uniq, quiet, dup);
  if (m.t === 'TEST') return showMsg_('\ud83d\udd14 NexTalk', 'Test push successful \u2713 \u2014 this device is receiving pushes', 'cp-test-' + uniq, quiet, dup);
  if (m.t === 'MSG')  return showMsg_('\ud83d\udcac ' + (m.n || 'NexTalk'), String(m.x || ''), 'cp-msg-' + uniq, quiet, dup);
  return showMsg_('\ud83d\udcac NexTalk', 'New activity', 'cp-msg-' + uniq, quiet, dup);
}

function showMsg_(title, body, tag, quiet, dup) {
  var opts = {
    body: body, tag: tag || ('cp-msg-' + Date.now()),
    renotify: !dup,                       // a duplicate replaces the card silently
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
    vibrate: (quiet || dup) ? [0] : [180, 60, 180],
    silent: !!(quiet || dup),
    data: { url: './' }
  };
  return self.registration.showNotification(title, opts).then(function () {
    /* App already open and focused -> the notification satisfies the
       userVisibleOnly contract, then clears itself after 4 seconds so the
       user is not spammed while they are literally reading the chat. */
    if (!quiet) return;
    return new Promise(function (r) { setTimeout(r, 4000); }).then(function () {
      return self.registration.getNotifications({ tag: opts.tag }).then(function (ns) {
        for (var i = 0; i < ns.length; i++) ns[i].close();
      }).catch(function () {});
    });
  });
}

/* v18: REPLACE the placeholder with the real notification (by closing it) */
function closeLive_() {
  return self.registration.getNotifications({ tag: 'cp-live' }).then(function (ns) {
    for (var i = 0; i < ns.length; i++) ns[i].close();
  }).catch(function () {});
}

function handlePush_(data) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    /* ============================================================
       v27 - THE BUG THAT KILLED PUSH ON ANDROID
       ------------------------------------------------------------
       We used to return here WITHOUT showing a notification whenever
       the app happened to be focused. But a push subscription is made
       with userVisibleOnly:true, which is a promise to the browser
       that EVERY push produces a visible notification. Chrome counts
       the broken promises: after a handful it shows its own
       "site updated in the background" message and then starts
       DROPPING pushes for the origin entirely. That is exactly why
       notifications "worked for a while and then stopped".
       So now: every push shows something, always. When the app is
       already open and focused we show a quiet, self-closing one so
       it is not annoying - but it is still a real notification.
       ============================================================ */
    var focused = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].visibilityState === 'visible' && list[i].focused) { focused = true; break; }
    }
    if (focused && !IS_APPLE && data && data.t) {
      return showFromPayload_(data, true);
    }
    // v19 FAST PATH: the payload came inside the push -> show it at once, zero network
    if (data && data.t) return showFromPayload_(data);
    /* v18 GUARANTEE: show a notification within 0 seconds of the push arriving
       and fill in the details afterwards. We used to ask the backend first and
       show it later - an Apps Script cold start can take 5-15 seconds, and when
       a notification is late or missing Chrome treats it as a "silent push" and
       THROTTLES/BLOCKS later pushes. Now the notification always appears
       instantly, even if the backend is asleep. */
    var instant = showMsg_('\ud83d\udcac NexTalk', 'New message\u2026', 'cp-live');
    if (!API) return instant;
    // Fetch the latest event -> drop the placeholder and show the name + text version
    return instant.then(function () {
      return Promise.all([getUid_(), getToken_()]);
    }).then(function (pair) {
      var uid = pair[0], tk = pair[1];
      return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'push_peek', userId: uid, token: tk })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok && j.msg && j.msg.name) {
          var m = j.msg;
          var swap = closeLive_(); // close the placeholder - the real notification follows
          // v17: INCOMING CALL -> a WhatsApp-style "Incoming call" notification.
          // requireInteraction = the notification does not disappear on its own,
          // long vibration + a separate tag (so it does not clear message notifications).
          if (m.type === 'CALL') {
            return swap.then(function(){ return self.registration.showNotification(
              (m.kind === 'video' ? '\ud83d\udcf9 ' : '\ud83d\udcde ') + m.name,
              {
                body: (m.kind === 'video' ? 'Incoming video call' : 'Incoming voice call') + ' \u2014 tap to answer in NexTalk',
                tag: 'cp-call', renotify: true, requireInteraction: true,
                icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
                vibrate: [300, 120, 300, 120, 300], data: { url: './' }
              }
            ); });
          }
          // v16: PERSONAL message -> "sender name" + text (separate tag, so that
          // group and personal notifications do not clear each other)
          if (m.type === 'DM') {
            var dt = String(m.text || '');
            if (dt.length > 140) dt = dt.slice(0, 137) + '\u2026';
            return swap.then(function(){ return showMsg_('\ud83d\udcac ' + m.name, dt, 'cp-dm-' + m.ts); });
          }
          // SCREENSHOT upload -> "Name" / "Uploaded a screenshot: xyz.png"
          if (m.type === 'SCREENSHOT') {
            return swap.then(function(){ return showMsg_('\ud83d\udcf8 ' + m.name, 'Uploaded a screenshot' + (m.file ? ': ' + m.file : ''), 'cp-up-' + m.ts); });
          }
          // FILE upload -> "Name" / "Uploaded a file: report.pdf"
          if (m.type === 'FILE') {
            return swap.then(function(){ return showMsg_('\ud83d\udcce ' + m.name, 'Uploaded a file' + (m.file ? ': ' + m.file : ''), 'cp-up-' + m.ts); });
          }
          // Normal chat message -> "Name" / message text
          var t = String(m.text || '');
          if (t.length > 140) t = t.slice(0, 137) + '\u2026';
          return swap.then(function(){ return showMsg_('\ud83d\udcac ' + m.name, t, 'cp-msg-' + m.ts); });
        }
        return true; // no details available -> the placeholder is good enough
      })
      // Fetch failed (offline / cold start) -> the placeholder is already showing
      .catch(function () { return true; });
    });
  });
}
