export function mountGallery(viewer) {
  const stage = viewer.querySelector('.image-viewer__stage');
  const image = stage.querySelector('img');
  const caption = viewer.querySelector('[data-gallery-caption]');
  const openButton = viewer.querySelector('[data-gallery-open]');
  const choices = [...viewer.querySelectorAll('[data-gallery-choice]')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  caption.setAttribute('aria-live', 'polite');
  caption.setAttribute('aria-atomic', 'true');

  let current = 0;

  function applyChoice(choice, index) {
    current = index;
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
  }

  for (const [index, choice] of choices.entries()) {
    choice.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      applyChoice(choice, index);
    });
  }

  // ---- просмотр во весь экран с увеличением ----
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', 'Просмотр фотографии');
  lightbox.hidden = true;
  lightbox.innerHTML = [
    '<img class="lightbox__image" alt="">',
    '<p class="lightbox__caption"></p>',
    '<button class="lightbox__close" type="button" aria-label="Закрыть просмотр">×</button>',
    '<button class="lightbox__prev" type="button" aria-label="Предыдущее фото">←</button>',
    '<button class="lightbox__next" type="button" aria-label="Следующее фото">→</button>',
  ].join('');
  document.body.append(lightbox);

  const lightboxImage = lightbox.querySelector('.lightbox__image');
  const lightboxCaption = lightbox.querySelector('.lightbox__caption');
  const lightboxClose = lightbox.querySelector('.lightbox__close');
  const lightboxPrev = lightbox.querySelector('.lightbox__prev');
  const lightboxNext = lightbox.querySelector('.lightbox__next');
  let lastFocused = null;

  function showLightbox(index) {
    const choice = choices[index];
    if (!choice) return;
    applyChoice(choice, index);
    lightboxImage.src = choice.dataset.imageSrc;
    lightboxImage.alt = choice.dataset.imageAlt;
    lightboxCaption.textContent = choice.dataset.imageCaption;
    lightbox.hidden = false;
    lightbox.classList.remove('is-zoomed');
    document.documentElement.style.overflow = 'hidden';
    lastFocused = document.activeElement;
    lightboxClose.focus();
  }

  function hideLightbox() {
    lightbox.hidden = true;
    lightbox.classList.remove('is-zoomed');
    document.documentElement.style.overflow = '';
    lastFocused?.focus?.();
  }

  function step(delta) {
    if (!choices.length) return;
    showLightbox((current + delta + choices.length) % choices.length);
  }

  openButton?.addEventListener('click', () => showLightbox(current));
  lightboxClose.addEventListener('click', hideLightbox);
  lightboxPrev.addEventListener('click', () => step(-1));
  lightboxNext.addEventListener('click', () => step(1));
  lightbox.addEventListener('click', event => {
    if (event.target === lightbox) hideLightbox();
  });
  // клик по самой фотографии в просмотре — переключение «влезает / 1:1»
  lightboxImage.addEventListener('click', () => lightbox.classList.toggle('is-zoomed'));
  document.addEventListener('keydown', event => {
    if (lightbox.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); hideLightbox(); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
  });
}
