/* What Rudiment Room publishes about itself, derived rather than typed.

   THIS ADDS NO PLACE TO EDIT. The build identifier already lives in README.md
   and in the build-stamp block in index.html. A committed capabilities.json
   would have made it three — the exact shape of the problem it exists to
   solve. On 2026-09-04 four guide build stamps across the shop were found
   naming builds their apps had moved past, every one a hand-kept copy of
   somebody else's value.

   So the version is READ OUT OF index.html at build time. It cannot disagree
   with the page, because it is the page's own string.

   dist/ is tracked here, so the generated file is committed along with the
   rest of the artifact — which is this repository's convention, not a lapse.
   The guarantee is the build overwriting it from the page on every run, plus
   the test that compares the two, rather than the file's absence from git.

   WHY PUBLISH IT AT ALL. The shop site audits whether each guide still names
   the build its app is serving, and it can only ask an app that answers. An
   app that publishes nothing sits in that audit's uncovered list, where a
   stale stamp waits for somebody to notice by hand — which is how Drum Map's
   was found. */

/** The build identifier the footer actually renders.
 *
 * Anchored on the whole assignment rather than a loose date pattern: the page
 * carries other ISO dates, and a reader that matched the first one it saw
 * would publish a number nobody chose. */
export function buildStamp(html) {
  const match = /var build = \(window\.__BUILD__ && String\(window\.__BUILD__\)\) \|\| "([^"]+)";/.exec(html);
  if (!match) throw new Error("no build-stamp block found in index.html");
  return match[1];
}

/** Identity, version, and where to reach the app and its guide — no more.
 *
 * The app is Rudiment Room; the repository, the slug and the guide URL are
 * still rudiment-builder, which is the rename this shop has not finished. The
 * name a reader sees is the title; the slug stays what every existing link
 * already points at.
 *
 * Some siblings' manifests also carry a `privacy` block. This one does not:
 * those fields are a CLAIM, and publishing one that has not been checked
 * against what the app actually does is worse than leaving it out. */
export const capabilities = (version) => ({
  schemaVersion: "praxis-capabilities/v1",
  app: "rudiment-builder",
  title: "Rudiment Room",
  version,
  launchUrl: "https://rudiment-builder.backwerdrhythmshop.com/",
  guideUrl: "https://guides.backwerdrhythmshop.com/rudiment-builder/",
});
