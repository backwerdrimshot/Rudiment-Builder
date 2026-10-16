// The shop's layout standard, as Rudiment Room holds it: the header's Help, Feedback and About nav
// with the monogram last, the footer's social icons and links, the About dialog's "More apps", and
// the settings bar that becomes a column at 1700px. A static check on index.html and its scripts,
// because the browser layout is checked by hand at 375px, 1280px and 1700px. Node-only.
//
//     node --test tests/workspace-chrome.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const read = (name) => readFileSync(join(ROOT, name), "utf8");
const html = read("index.html");
const css = read("workspace-layout.css");
const info = read("workspace-info.js");

// The text from the first `start` up to the next `end` after it, both included.
function between(text, start, end) {
  const a = text.indexOf(start);
  assert.ok(a >= 0, `missing ${start}`);
  const b = text.indexOf(end, a + start.length);
  assert.ok(b > a, `missing ${end} after ${start}`);
  return text.slice(a, b + end.length);
}
const header = between(html, '<header class="brand">', "</header>");
const footer = between(html, '<footer class="foot">', "</footer>");
const helpDialog = between(html, '<dialog id="workspace-help"', "</dialog>");
const feedbackDialog = between(html, '<dialog id="workspace-feedback"', "</dialog>");
const aboutDialog = between(html, '<dialog id="workspace-about"', "</dialog>");
const COPYRIGHT = "© 2026 Backwerd Rimshot, LLC. All rights reserved.";
const GUIDE = "https://guides.backwerdrhythmshop.com/rudiment-builder/";

test("the header nav holds Help, Feedback and About, in that order, each named, titled and iconed", () => {
  const nav = between(header, '<nav class="workspace-actions" aria-label="Help and app information">', "</nav>");
  const buttons = [...nav.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attrs, body]) => ({ attrs, body }));
  assert.deepEqual(buttons.map((b) => /aria-label="([^"]+)"/.exec(b.attrs)?.[1]), ["Help", "Feedback", "About"]);
  for (const b of buttons) {
    assert.match(b.attrs, /title="[^"]+"/, "each action has a title");
    assert.match(b.body, /^<svg\b[^>]*aria-hidden="true"/, "each action leads with its icon");
    assert.match(b.body, /<span class="ws-label">[^<]+<\/span>/, "each action keeps its name as a label");
    const target = /data-dialog-open="([^"]+)"/.exec(b.attrs)?.[1];
    assert.ok(target && html.includes(`<dialog id="${target}"`), `the action opens a dialog that exists: ${target}`);
  }
});

test("the labels show from 600px and are screen-reader text below it", () => {
  assert.match(css, /@media \(max-width:599px\)[\s\S]*?\.workspace-actions \.ws-label \{ position:absolute;/);
  assert.match(css, /\.workspace-actions \.ws-label \{ white-space:nowrap; \}/);
  assert.doesNotMatch(css, /\.workspace-actions button span \{ display:none; \}/, "no display:none label, which a screen reader would lose");
});

test("the app's name links to the app's own page, and the monogram is the last item in the header", () => {
  assert.match(header, /<h1><a href="\.\/">Rudiment <span>Room<\/span><\/a><\/h1>/);
  const home = '<a class="brs-home" href="https://backwerdrhythmshop.com/" aria-label="Backwerd Rhythm Shop home"><img src="./brs-monogram.svg" alt="" width="28" height="28"></a>';
  assert.ok(header.includes(home), "the monogram link matches the shop's markup");
  assert.ok(header.indexOf(home) > header.indexOf("</nav>"), "the monogram comes after the nav");
  assert.ok(header.replace(/\s*<\/header>$/, "").trimEnd().endsWith(home), "the monogram is the header's last item");
  assert.equal([...header.matchAll(/<button\b/g)].length, 3, "the header's buttons are the three nav actions and nothing else");
  assert.equal([...header.matchAll(/<a\b/g)].length, 2, "the header's links are the app's name and the monogram");
  assert.ok(existsSync(join(ROOT, "brs-monogram.svg")), "brs-monogram.svg ships with the app");
});

test("no gear appears in any shipped page or script", () => {
  for (const name of ["index.html", "workspace-info.js", "workspace-layout.css", ...readdirSync(join(ROOT, "js")).map((f) => `js/${f}`)]) {
    if (!/\.(html|js|css)$/.test(name)) continue;
    assert.doesNotMatch(read(name), /\bgear\b/i, `${name} mentions a gear`);
  }
});

test("the footer carries the social icons in order, then the forms, email, Guide and All free apps", () => {
  const social = between(footer, '<nav class="foot-social"', "</nav>");
  assert.deepEqual([...social.matchAll(/aria-label="Backwerd Rhythm Shop on (\w+)"/g)].map((m) => m[1]), ["Facebook", "Instagram", "YouTube"]);
  assert.ok(footer.indexOf('<nav class="foot-social"') < footer.indexOf('<nav class="foot-links"'), "icons come before the text links");
  const links = [...between(footer, '<nav class="foot-links"', "</nav>").matchAll(/<a\b[^>]*>([^<]*)<\/a>/g)].map((m) => m[1].trim());
  assert.deepEqual(links, ["Report a problem", "Request a feature", "Email support", "Email feedback", "Guide", "All free apps"]);
});

test("the social icons are Mallet Board's glyphs, drawn at 16px", () => {
  for (const path of [
    'd="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9',               // Facebook
    'x="3.2" y="3.2" width="17.6" height="17.6" rx="5"', // Instagram
    'd="M21.6 7.2a2.5 2.5 0 0 0-1.75-1.77C18.3 5',      // YouTube
  ]) {
    assert.ok(footer.includes(path), `the footer carries the glyph ${path.slice(0, 30)}`);
  }
  assert.match(css + html, /\.foot-social svg\{width:16px;height:16px;/);
});

test("the footer ends with the copyright line and the build stamp", () => {
  assert.ok(footer.indexOf(COPYRIGHT) > footer.indexOf('<nav class="foot-links"'));
  assert.match(footer, /<div class="build-stamp">Build <span data-build><\/span><\/div>\s*<\/footer>$/);
});

test("the footer is on the page, not moved into a dialog", () => {
  for (const dialog of [helpDialog, feedbackDialog, aboutDialog]) {
    assert.doesNotMatch(dialog, /<footer\b/, "no dialog holds the footer");
  }
  assert.doesNotMatch(info, /querySelector\(['"]footer|append\(\s*footer|\bfooter\s*\]/, "the workspace script never moves the footer");
});

test("the forms and the email links are in the footer and in the Feedback dialog, and nowhere in the header", () => {
  for (const [name, block] of [["footer", footer], ["Feedback dialog", feedbackDialog]]) {
    assert.equal([...block.matchAll(/data-feedback="support"/g)].length, 1, `${name} has the problem form`);
    assert.equal([...block.matchAll(/data-feedback="feedback"/g)].length, 1, `${name} has the feature form`);
    assert.equal([...block.matchAll(/href="mailto:support@backwerdrhythmshop\.com\?subject=Rudiment%20Room%20%E2%80%94%20problem%20report"/g)].length, 1, `${name} has the support email`);
    assert.equal([...block.matchAll(/href="mailto:feedback@backwerdrhythmshop\.com\?subject=Rudiment%20Room%20%E2%80%94%20feature%20request"/g)].length, 1, `${name} has the feedback email`);
  }
  assert.doesNotMatch(header, /data-feedback|mailto:/);
});

test("About holds the app name, the build, More apps, the guide and the copyright", () => {
  assert.match(aboutDialog, /About Rudiment Room/);
  assert.match(aboutDialog, /<span data-build><\/span>/);
  assert.match(aboutDialog, /<a href="https:\/\/apps\.backwerdrhythmshop\.com\/">More apps<\/a>/);
  assert.match(aboutDialog, new RegExp(`<a href="${GUIDE}">Guide<\\/a>`));
  assert.ok(aboutDialog.includes(COPYRIGHT));
  assert.equal(html.split(">More apps<").length - 1, 1, '"More apps" appears once, in About');
});

test("Help holds the app's help text, the guide link, and the About section moved in by the script", () => {
  assert.match(helpDialog, /Read the full guide/);
  assert.match(helpDialog, new RegExp(`href="${GUIDE}"`));
  assert.match(helpDialog, /data-help-slot/, "the existing help section moves into the slot");
  assert.match(html, /<body data-workspace-name="Rudiment Room" data-workspace-help="\.area-about">/);
  assert.match(info, /querySelectorAll\(hint\)/, "the help section is moved by the selector the body names");
});

test("the Full screen control is in the docked bar, not the header", () => {
  assert.match(html, /<button class="btn ghost" id="btnFull"/);
  assert.doesNotMatch(header, /btnFull/);
});

test("the settings bar is at least 48px tall, has a chevron, and is hidden from 1700px where the column shows", () => {
  const toggle = between(html, '<button type="button" class="setup-toggle settings-toggle" id="settingsToggle"', "</button>");
  assert.match(toggle, /<svg class="settings-caret"/);
  assert.match(css + html, /\.setup-toggle \{ *display:flex;[^}]*min-height:52px;|\.setup-toggle\{display:flex;[^}]*min-height:52px;/);
  assert.match(html, /@media\(min-width:1700px\)\{[\s\S]*?\.settings-toggle\{display:none\}/);
  assert.match(html, /@media\(min-width:1700px\)\{[\s\S]*?grid-template-columns:minmax\(0,2\.2fr\) minmax\(0,1fr\) 340px/);
  assert.match(html, /@media\(min-width:1700px\)\{[\s\S]*?\.settings-card\{grid-area:settings/);
});

test("the workspace script wires the header's dialogs and the dialogs' close buttons", () => {
  assert.match(info, /\[data-dialog-open\]/);
  assert.match(info, /\[data-close-dialog\]/);
  assert.match(info, /\[data-help-slot\]|data-help-slot/);
  assert.doesNotMatch(info, /createElement\(['"]dialog['"]\)/, "the dialogs are markup, not built by the script");
});

test("the build stamp is written into every [data-build], so the About dialog and footer agree", () => {
  assert.match(read("index.html"), /document\.querySelectorAll\("\[data-build\]"\)\.forEach/);
});
