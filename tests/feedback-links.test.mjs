import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { SHOP_FORMS, emailHref, feedbackBase, feedbackHref, formLink, opensForm } = require("../js/feedback-links.js");

const APP = "Rudiment Room";
const SETUP = "https://rudiment-builder.backwerdrhythmshop.com/#rudiment=paradiddle · build 2026-10-16";
const UNSET = { support: null, feedback: null };
// Google Forms' public viewer addresses. A pasted edit URL (…/edit) would send a
// person to the form owner's screen instead.
const FORM_VIEWER = /^https:\/\/docs\.google\.com\/forms\/d\/e\/[A-Za-z0-9_-]+\/viewform$/;

test("the shop's two forms are Google Forms viewers, each with its App and Setup entry fields", () => {
  assert.deepEqual(SHOP_FORMS.support, {
    url: "https://docs.google.com/forms/d/e/1FAIpQLSeZeT_J2QIag3TsO-NxrCNPxVBxSIz_mHzKgZWuZQ-i_UmcCg/viewform",
    appField: "entry.588933919",
    setupField: "entry.1893079260",
  });
  assert.deepEqual(SHOP_FORMS.feedback, {
    url: "https://docs.google.com/forms/d/e/1FAIpQLSfP29vqlwt3UX1rbguiLEsR7t5ONZbEpuWoix0_7aDF2eMXDg/viewform",
    appField: "entry.2020831353",
    setupField: "entry.1906602408",
  });
  for (const form of [SHOP_FORMS.support, SHOP_FORMS.feedback]) assert.match(form.url, FORM_VIEWER);
});

test("a link before it is followed is the plain form, so it works without JavaScript", () => {
  assert.equal(feedbackBase("support"), SHOP_FORMS.support.url);
  assert.equal(feedbackBase("feedback"), SHOP_FORMS.feedback.url);
  assert.equal(opensForm("support"), true);
  assert.equal(opensForm("feedback"), true);
});

test("a followed link opens the form with usp, the app and the setup in their entry fields", () => {
  for (const kind of ["support", "feedback"]) {
    const form = SHOP_FORMS[kind];
    const url = new URL(feedbackHref(kind, APP, SETUP));
    assert.equal(url.origin + url.pathname, form.url);
    assert.deepEqual([...url.searchParams.keys()], ["usp", form.appField, form.setupField]);
    assert.equal(url.searchParams.get("usp"), "pp_url");
    assert.equal(url.searchParams.get(form.appField), APP);
    assert.equal(url.searchParams.get(form.setupField), SETUP, "the setup survives its & and = intact");
  }
});

test("a form that is not a Google Forms address or does not name entry fields is refused", () => {
  const support = SHOP_FORMS.support;
  const bad = [
    { ...support, url: "https://example.com/forms/x" },
    { ...support, url: "javascript:alert(1)" },
    { ...support, appField: "name" },
    { ...support, setupField: "entry.1&usp=x" },
  ];
  for (const form of bad) {
    assert.equal(formLink(form, APP, SETUP), null);
    assert.equal(opensForm("support", { ...UNSET, support: form }), false);
    assert.equal(feedbackBase("support", { ...UNSET, support: form }), "mailto:support@backwerdrhythmshop.com");
  }
});

test("an unset form falls back to the shop's email, with its subject and no body", () => {
  assert.equal(feedbackBase("support", UNSET), "mailto:support@backwerdrhythmshop.com");
  assert.equal(feedbackBase("feedback", UNSET), "mailto:feedback@backwerdrhythmshop.com");
  assert.equal(opensForm("support", UNSET), false);

  const support = new URL(feedbackHref("support", APP, SETUP, UNSET));
  assert.equal(support.protocol, "mailto:");
  assert.equal(support.pathname, "support@backwerdrhythmshop.com");
  assert.equal(support.searchParams.get("subject"), "Rudiment Room — problem report");
  assert.equal(support.searchParams.has("body"), false);

  const feedback = new URL(feedbackHref("feedback", APP, SETUP, UNSET));
  assert.equal(feedback.pathname, "feedback@backwerdrhythmshop.com");
  assert.equal(feedback.searchParams.get("subject"), "Rudiment Room — feature request");
  assert.equal(feedback.searchParams.has("body"), false);
});

test("the email links are the shop's addresses, with a subject naming the app and no body", () => {
  assert.equal(emailHref("support", APP), "mailto:support@backwerdrhythmshop.com?subject=Rudiment%20Room%20%E2%80%94%20problem%20report");
  assert.equal(emailHref("feedback", APP), "mailto:feedback@backwerdrhythmshop.com?subject=Rudiment%20Room%20%E2%80%94%20feature%20request");
  for (const kind of ["support", "feedback"]) {
    assert.equal(new URL(emailHref(kind, APP)).searchParams.has("body"), false);
  }
});

test("the email links do not depend on the forms: they are the same whether the forms are set or unset", () => {
  assert.ok(!emailHref("support", APP).includes("docs.google.com"));
  for (const kind of ["support", "feedback"]) {
    assert.equal(feedbackHref(kind, APP, SETUP, UNSET), emailHref(kind, APP));
    assert.notEqual(feedbackHref(kind, APP, SETUP), emailHref(kind, APP));
  }
});

test("the page's feedback links start at the forms the module names, and the module loads first", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const [kind, form] of Object.entries(SHOP_FORMS)) {
    const tag = html.match(new RegExp(`<a [^>]*data-feedback="${kind}"[^>]*>`))?.[0] ?? "";
    assert.ok(tag, `the footer has the ${kind} link`);
    assert.ok(tag.includes(`href="${form.url}"`), `the ${kind} link's static href is its form`);
    assert.ok(tag.includes('target="_blank"') && tag.includes('rel="noreferrer"'), `the ${kind} link opens in a new tab`);
  }
  // The email links sit beside the form links, with plain mailto hrefs and no form binding:
  // the page's script only rewrites a[data-feedback], so they cannot change a form link.
  const emails = [
    ["Email support", emailHref("support", APP)],
    ["Email feedback", emailHref("feedback", APP)],
  ];
  for (const [label, href] of emails) {
    const tag = html.match(new RegExp(`<a [^>]*href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>${label}</a>`))?.[0] ?? "";
    assert.ok(tag, `the footer has the ${label} link at ${href}`);
    assert.ok(!tag.includes("data-feedback") && !tag.includes("target="), `${label} is a plain link`);
  }
  assert.ok(html.indexOf("Email support") > html.indexOf('data-feedback="feedback"'), "the email links follow the form links");
  const moduleAt = html.indexOf('src="js/feedback-links.js"');
  assert.ok(moduleAt > 0, "the page loads js/feedback-links.js");
  assert.ok(moduleAt < html.indexOf("window.FeedbackLinks"), "the module loads before the script that uses it");
});
