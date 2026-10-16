/* Where a learner or teacher sends a problem or a feature request.

   Both are the shop's Google Forms, shared by every app. Each has an "App"
   question, so one form serves every app. A link opens its form with the app's
   name and the page pre-filled. Until a form is usable, the link is the shop's
   email address instead.

   Classic script (works over file://). The page loads it, and the Node tests
   load it through the same export as rudiment-core.js. No DOM. */
(function (root) {
  "use strict";

  var SHOP_FORMS = {
    support: {
      url: "https://docs.google.com/forms/d/e/1FAIpQLSeZeT_J2QIag3TsO-NxrCNPxVBxSIz_mHzKgZWuZQ-i_UmcCg/viewform",
      appField: "entry.588933919",
      setupField: "entry.1893079260"
    },
    feedback: {
      url: "https://docs.google.com/forms/d/e/1FAIpQLSfP29vqlwt3UX1rbguiLEsR7t5ONZbEpuWoix0_7aDF2eMXDg/viewform",
      appField: "entry.2020831353",
      setupField: "entry.1906602408"
    }
  };

  var EMAIL = {
    support: "support@backwerdrhythmshop.com",
    feedback: "feedback@backwerdrhythmshop.com"
  };

  var SUBJECT = { support: "problem report", feedback: "feature request" };

  var FORM_ADDRESS = /^https:\/\/docs\.google\.com\/forms\//;
  var ENTRY_FIELD = /^entry\.\d+$/;

  /* Only a Google Forms address and entry fields may be pre-filled. */
  function usable(form) {
    return !!form && FORM_ADDRESS.test(form.url)
      && ENTRY_FIELD.test(form.appField) && ENTRY_FIELD.test(form.setupField);
  }

  /* The form with the app and the setup filled in, or null when the form is not usable. */
  function formLink(form, app, setup) {
    if (!usable(form)) return null;
    var params = new URLSearchParams({ usp: "pp_url" });
    params.set(form.appField, app);
    params.set(form.setupField, setup);
    return form.url + "?" + params.toString();
  }

  /* Whether the kind's link opens a form in a new tab, rather than the email fallback. */
  function opensForm(kind, forms) {
    return usable((forms || SHOP_FORMS)[kind]);
  }

  /* The address a feedback link shows before it is followed: the plain form, or the email address. */
  function feedbackBase(kind, forms) {
    var form = (forms || SHOP_FORMS)[kind];
    return usable(form) ? form.url : "mailto:" + EMAIL[kind];
  }

  /* The email link for a kind of message: the shop's address, with a subject naming the app, and no body.
     It never depends on a form. */
  function emailHref(kind, app) {
    return "mailto:" + EMAIL[kind] + "?subject=" + encodeURIComponent(app + " — " + SUBJECT[kind]);
  }

  /* Where a feedback link goes once followed: the pre-filled form, or the email link. */
  function feedbackHref(kind, app, setup, forms) {
    var form = (forms || SHOP_FORMS)[kind];
    return (usable(form) ? formLink(form, app, setup) : null) || emailHref(kind, app);
  }

  var FeedbackLinks = {
    SHOP_FORMS: SHOP_FORMS,
    formLink: formLink,
    opensForm: opensForm,
    feedbackBase: feedbackBase,
    feedbackHref: feedbackHref,
    emailHref: emailHref
  };

  if (typeof module !== "undefined" && module.exports) module.exports = FeedbackLinks;
  else root.FeedbackLinks = FeedbackLinks;
})(typeof self !== "undefined" ? self : this);
