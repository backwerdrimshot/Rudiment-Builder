/* Shared Backwerd workspace chrome. Vanilla apps keep their existing nodes and
   event listeners; only supplementary information moves into native dialogs. */
(() => {
  'use strict';
  const body = document.body;
  const header = document.querySelector('header');
  const footer = document.querySelector('footer');
  if (!header || !footer) return;
  const name = body.dataset.workspaceName;
  const nav = document.createElement('nav');
  nav.className = 'workspace-actions';
  nav.setAttribute('aria-label', 'Help and app information');
  function panel(label, content) {
    const dialog = document.createElement('dialog');
    dialog.className = 'workspace-dialog';
    const heading = document.createElement('div');
    heading.className = 'workspace-dialog-heading';
    const title = document.createElement('h2');
    title.id = `workspace-${label.toLowerCase()}-title`;
    title.textContent = `${label === 'Help' ? 'How to use' : label} ${name}`;
    dialog.setAttribute('aria-labelledby', title.id);
    const close = document.createElement('button');
    close.type = 'button'; close.textContent = 'Close';
    close.setAttribute('aria-label', `Close ${label.toLowerCase()}`);
    close.addEventListener('click', () => dialog.close());
    heading.append(title, close); dialog.append(heading, ...content);
    document.body.append(dialog);
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label;
    button.addEventListener('click', () => dialog.showModal());
    nav.append(button);
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    });
    // Legacy support panels are normal overlays. Close this top-layer dialog
    // before their existing click handler opens one, so the panel is reachable.
    dialog.addEventListener('click', event => {
      if (event.target.closest('a[href^="mailto:"]')) dialog.close();
    }, true);
    return dialog;
  }
  const take = value => (value ?? '').split('|').filter(Boolean).flatMap(selector => [...document.querySelectorAll(selector)]);
  const settings = take(body.dataset.workspaceSettings);
  if (settings.length) panel('Settings', settings);
  const intro = document.createElement('p');
  intro.textContent = body.dataset.workspaceIntro ?? 'Choose your settings, then use the practice controls. Your work stays in this browser.';
  const helpContent = [intro, ...take(body.dataset.workspaceHelp)];
  const guide = footer.querySelector('a[href*="guides.backwerdrhythmshop.com"]');
  if (guide) { const link = guide.cloneNode(true); link.textContent = 'Read the full guide ↗'; helpContent.push(link); }
  panel('Help', helpContent);
  panel('About', [footer]);
  const oldHelp = document.getElementById('helpMore');
  if (oldHelp) oldHelp.hidden = true;
  const home = header.querySelector('.brs-home');
  if (home) home.parentElement.insertBefore(nav, home);
  else header.append(nav);
  // A dialog's controls must not also trigger the app's global play/reset keys.
  window.addEventListener('keydown', event => {
    if (document.querySelector('.workspace-dialog[open]')) event.stopImmediatePropagation();
  }, true);
  if (body.dataset.workspaceName === 'Percussion Atlas') {
    const main = document.querySelector('main');
    const list = document.getElementById('list');
    const views = document.getElementById('views');
    const tabs = document.createElement('nav');
    tabs.className = 'workspace-catalog-nav';
    tabs.setAttribute('aria-label', 'Reference view');
    for (const [text, target] of [['Instrument catalog', list], ['Compare & ranges', views]]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.setAttribute('aria-controls', target.id);
      button.addEventListener('click', () => {
        list.hidden = target !== list; views.hidden = target !== views;
        for (const other of tabs.children) other.setAttribute('aria-pressed', String(other === button));
      });
      tabs.append(button);
    }
    main.prepend(tabs); tabs.firstElementChild.click();
    // The empty-search message follows the filter, rather than creating a new grid row.
    document.querySelector('.controls').append(document.getElementById('empty'));
  }
})();
