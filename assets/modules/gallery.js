export function mountGallery(viewer) {
  const image = viewer.querySelector('.image-viewer__stage > img');
  const caption = viewer.querySelector('[data-gallery-caption]');
  const choices = [...viewer.querySelectorAll('[data-gallery-choice]')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  caption.setAttribute('aria-live', 'polite');
  caption.setAttribute('aria-atomic', 'true');

  for (const choice of choices) {
    choice.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      image.src = choice.dataset.imageSrc;
      // srcset задаёт, какую версию покажет браузер: без его обновления
      // смена src игнорируется и остаётся предыдущее фото
      const nextSrcset = choice.dataset.imageSrcset;
      if (nextSrcset) {
        image.srcset = nextSrcset;
        image.sizes = choice.dataset.imageSizes || image.sizes;
      } else {
        image.removeAttribute('srcset');
        image.removeAttribute('sizes');
      }
      image.alt = choice.dataset.imageAlt;
      image.dataset.fit = choice.dataset.imageFit;
      caption.textContent = choice.dataset.imageCaption;
      for (const candidate of choices) {
        if (candidate === choice) candidate.setAttribute('aria-current', 'true');
        else candidate.removeAttribute('aria-current');
      }
      if (!reducedMotion.matches) image.animate?.([{ opacity: .55 }, { opacity: 1 }], { duration: 240 });
    });
  }
}
