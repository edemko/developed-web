'use strict';
const dialog = document.querySelector('.lightbox');
if (dialog && typeof dialog.showModal === 'function') {
  let opener;
  for (const button of document.querySelectorAll('[data-zoom]')) {
    button.addEventListener('click', () => {
      opener = button;
      const source = button.querySelector('img');
      const image = dialog.querySelector('img');
      image.src = source.src;
      image.alt = source.alt;
      dialog.querySelector('.lightbox-head p').textContent = source.alt;
      dialog.showModal();
      document.documentElement.classList.add('no-scroll');
    });
  }
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('no-scroll');
    opener?.focus();
  });
}
