export function mountNavigation(drawer) {
  const trigger = drawer.querySelector('summary');
  const desktop = matchMedia('(min-width: 1001px)');
  const background = [...document.querySelectorAll('[data-menu-background]')];

  function sync() {
    const opened = drawer.open && !desktop.matches;
    document.body.toggleAttribute('data-navigation-open', opened);
    trigger.setAttribute('aria-expanded', String(opened));
    trigger.setAttribute('aria-label', opened ? 'Закрыть меню' : 'Открыть меню');
    for (const region of background) region.inert = opened;
  }

  function dismiss(returnFocus = false) {
    drawer.open = false;
    sync();
    if (returnFocus) trigger.focus();
  }

  drawer.addEventListener('toggle', sync);
  drawer.addEventListener('click', event => {
    if (event.target.closest('nav a')) dismiss();
  });
  document.addEventListener('keydown', event => {
    if (!drawer.open || desktop.matches) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss(true);
    }
    if (event.key !== 'Tab') return;
    const stops = [trigger, ...drawer.querySelectorAll('nav a[href]')];
    const current = stops.indexOf(document.activeElement);
    const wrapBack = event.shiftKey && current <= 0;
    const wrapForward = !event.shiftKey && (current === stops.length - 1 || current < 0);
    if (wrapBack || wrapForward) {
      event.preventDefault();
      stops[wrapBack ? stops.length - 1 : 0].focus();
    }
  });
  desktop.addEventListener('change', () => { if (desktop.matches) dismiss(); });
  window.addEventListener('pagehide', () => dismiss());
  sync();
}
