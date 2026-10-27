/* Shared Backwerd workspace chrome. The Help, Feedback and About buttons in the header open
   their dialogs, which are static markup in index.html. This script wires them: the open and
   close buttons, the backdrop, a mail link closing the dialog that holds it, and the keyboard
   hint moving into Help. The footer stays on the page. Vanilla apps keep their existing nodes
   and listeners. */
(() => {
  'use strict';
  const help = document.getElementById('workspace-help');
  const slot = help && help.querySelector('[data-help-slot]');
  const hint = document.body.dataset.workspaceHelp;
  if (slot && hint) slot.append(...document.querySelectorAll(hint));

  for (const button of document.querySelectorAll('[data-dialog-open]')) {
    button.addEventListener('click', () => document.getElementById(button.dataset.dialogOpen)?.showModal());
  }
  for (const dialog of document.querySelectorAll('dialog.workspace-dialog')) {
    for (const close of dialog.querySelectorAll('[data-close-dialog]')) {
      close.addEventListener('click', () => dialog.close());
    }
    dialog.addEventListener('click', (event) => {
      // A mail link hands the message to the mail app, so the dialog holding it closes.
      if (event.target.closest?.('a[href^="mailto:"]')) { dialog.close(); return; }
      // A click on the backdrop, outside the box, closes the dialog.
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });
  }
  // A dialog's controls must not also trigger the app's global play and reset keys.
  window.addEventListener('keydown', (event) => {
    if (document.querySelector('.workspace-dialog[open]')) event.stopImmediatePropagation();
  }, true);
})();
