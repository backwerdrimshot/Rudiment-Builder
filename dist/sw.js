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
var BUILD = "2026-09-24.4";
var ASSETS = [
  "./",
  "apple-touch-icon.png",
  "assets/audio/marching-snare.js",
  "assets/brand/design-tokens.css",
  "assets/fonts/barlow-condensed-400-latin.woff2",
  "assets/fonts/barlow-condensed-600-latin.woff2",
  "assets/fonts/barlow-condensed-700-latin.woff2",
  "assets/fonts/big-shoulders-display-800-latin.woff2",
  "assets/notation/rudiments/rudiment-01-single-stroke-roll.svg",
  "assets/notation/rudiments/rudiment-02-single-stroke-four.svg",
  "assets/notation/rudiments/rudiment-03-single-stroke-seven.svg",
  "assets/notation/rudiments/rudiment-04-multiple-bounce-roll.svg",
  "assets/notation/rudiments/rudiment-05-triple-stroke-roll.svg",
  "assets/notation/rudiments/rudiment-06-double-stroke-open-roll.svg",
  "assets/notation/rudiments/rudiment-07-five-stroke-roll.svg",
  "assets/notation/rudiments/rudiment-08-six-stroke-roll.svg",
  "assets/notation/rudiments/rudiment-09-seven-stroke-roll.svg",
  "assets/notation/rudiments/rudiment-10-nine-stroke-roll.svg",
  "assets/notation/rudiments/rudiment-11-ten-stroke-roll.svg",
  "assets/notation/rudiments/rudiment-12-eleven-stroke-roll.svg",
  "assets/notation/rudiments/rudiment-13-thirteen-stroke-roll.svg",
  "assets/notation/rudiments/rudiment-14-fifteen-stroke-roll.svg",
  "assets/notation/rudiments/rudiment-15-seventeen-stroke-roll.svg",
  "assets/notation/rudiments/rudiment-16-single-paradiddle.svg",
  "assets/notation/rudiments/rudiment-17-double-paradiddle.svg",
  "assets/notation/rudiments/rudiment-18-triple-paradiddle.svg",
  "assets/notation/rudiments/rudiment-19-single-paradiddle-diddle.svg",
  "assets/notation/rudiments/rudiment-20-flam.svg",
  "assets/notation/rudiments/rudiment-21-flam-accent.svg",
  "assets/notation/rudiments/rudiment-22-flam-tap.svg",
  "assets/notation/rudiments/rudiment-23-flamacue.svg",
  "assets/notation/rudiments/rudiment-24-flam-paradiddle.svg",
  "assets/notation/rudiments/rudiment-25-single-flammed-mill.svg",
  "assets/notation/rudiments/rudiment-26-flam-paradiddle-diddle.svg",
  "assets/notation/rudiments/rudiment-27-pataflafla.svg",
  "assets/notation/rudiments/rudiment-28-swiss-army-triplet.svg",
  "assets/notation/rudiments/rudiment-29-inverted-flam-tap.svg",
  "assets/notation/rudiments/rudiment-30-flam-drag.svg",
  "assets/notation/rudiments/rudiment-31-drag.svg",
  "assets/notation/rudiments/rudiment-32-single-drag-tap.svg",
  "assets/notation/rudiments/rudiment-33-double-drag-tap.svg",
  "assets/notation/rudiments/rudiment-34-lesson-25.svg",
  "assets/notation/rudiments/rudiment-35-single-dragadiddle.svg",
  "assets/notation/rudiments/rudiment-36-drag-paradiddle-1.svg",
  "assets/notation/rudiments/rudiment-37-drag-paradiddle-2.svg",
  "assets/notation/rudiments/rudiment-38-single-ratamacue.svg",
  "assets/notation/rudiments/rudiment-39-double-ratamacue.svg",
  "assets/notation/rudiments/rudiment-40-triple-ratamacue.svg",
  "favicon.svg",
  "icon-192.png",
  "icon-512.png",
  "js/rudiment-app.js",
  "js/rudiment-core.js",
  "js/rudiment-data.js",
  "manifest.webmanifest"
];
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
