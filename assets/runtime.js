import { mountNavigation } from './modules/navigation.js?v=464d10bcaa4d';
import { mountCatalog } from './modules/catalog.js?v=464d10bcaa4d';
import { mountGallery } from './modules/gallery.js?v=464d10bcaa4d';
import { mountCarousel } from './modules/carousel.js?v=464d10bcaa4d';

// Each feature owns its own DOM and can be absent on any page.
document.querySelectorAll('[data-navigation]').forEach(mountNavigation);
document.querySelectorAll('[data-catalog]').forEach(mountCatalog);
document.querySelectorAll('[data-gallery]').forEach(mountGallery);
document.querySelectorAll('[data-carousel]').forEach(mountCarousel);

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
if (!reducedMotion.matches) {
  for (const item of document.querySelectorAll('.welcome h1, .welcome__lead')) {
    item.animate?.([{ opacity: 0.5, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], {
      duration: 450,
      easing: 'ease-out',
    });
  }
}
