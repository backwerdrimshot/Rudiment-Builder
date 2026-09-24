/* Rudiment Room — offline service worker.

   One build, one cache. On install it stores every file a visit needs — the
   page, its scripts, the fonts, all 40 notation cards and the marching snare —
   in a cache named for the build, and from then on answers those requests from
   that cache, so the app opens and plays with no connection. A practice room
   with bad wifi is the case this exists for.

   Everything served comes from one build's cache, never a mix: the file names
   do not change between builds, so answering the page from one build and a
   script from another would run code the page was not written for. A new
   deploy changes this file (the build number below), the browser installs the
   new worker beside the old one, it stores the new build in full and only then
   takes over and deletes the old cache. A tab already open keeps the page and
   scripts it loaded, but anything it fetches after that (a card, the snare)
   comes from the new build — which is why the page asks for a reload once a
   new build takes over. If storing any file fails, the install fails and the
   old worker keeps serving.

   Only same-origin GETs for files on the list are answered; everything else —
   the analytics beacon, the visit counter, capabilities.json — goes to the
   network untouched. A page load at the root, with or without a share link's
   query string, is answered with the stored page.

   The block between the markers is written by build.mjs from the build stamp
   and the files it ships. Served straight from the repo root for development,
   this copy has no build and an empty list, so it stores nothing and passes
   every request through.

   To retire the worker, ship one whose install stores nothing and whose
   activate deletes every "rudimentroom-" cache and calls
   self.registration.unregister(). */
"use strict";

// BUILD MANIFEST — written by build.mjs; do not edit in dist.
var BUILD = "dev";
var ASSETS = [];
// END BUILD MANIFEST

var PREFIX = "rudimentroom-";
var CACHE = PREFIX + BUILD;

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        // cache: "reload" skips the HTTP cache, so a build is stored as served.
        return cache.addAll(ASSETS.map(function (url) { return new Request(url, { cache: "reload" }); }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          if (key.indexOf(PREFIX) === 0 && key !== CACHE) return caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

var ROOT = new URL("./", self.location).pathname;

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET" || ASSETS.length === 0) return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  var key;
  if (req.mode === "navigate") {
    if (url.pathname !== ROOT && url.pathname !== ROOT + "index.html") return;
    key = "./"; // the page, whatever drill the query string carries
  } else {
    key = req;
  }
  event.respondWith(
    caches.open(CACHE)
      .then(function (cache) { return cache.match(key, { ignoreSearch: req.mode === "navigate" }); })
      .then(function (hit) { return hit || fetch(req); })
  );
});
