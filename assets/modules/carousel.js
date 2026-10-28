export function mountCarousel(root) {
  const rail = root.querySelector('.project-rail');
  const panels = [...rail.children];
  const controls = root.querySelector('.rail-controls');
  const back = controls.querySelector('[data-rail-step="-1"]');
  const next = controls.querySelector('[data-rail-step="1"]');
  const counter = controls.querySelector('[data-rail-status]');
  const compact = matchMedia('(max-width: 700px)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function currentIndex() {
    const left = rail.getBoundingClientRect().left;
    let closest = 0;
    let distance = Infinity;
    panels.forEach((panel, index) => {
      const delta = Math.abs(panel.getBoundingClientRect().left - left);
      if (delta < distance) { distance = delta; closest = index; }
    });
    return closest;
  }

  function refresh() {
    const index = currentIndex();
    counter.textContent = `${index + 1} из ${panels.length}`;
    back.disabled = index === 0;
    next.disabled = index === panels.length - 1;
    controls.hidden = !compact.matches;
  }

  function advance(direction) {
    const target = Math.max(0, Math.min(panels.length - 1, currentIndex() + direction));
    const left = panels[target].getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft;
    rail.scrollTo({ left, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }

  back.addEventListener('click', () => advance(-1));
  next.addEventListener('click', () => advance(1));
  rail.addEventListener('scroll', refresh, { passive: true });
  compact.addEventListener('change', refresh);
  new ResizeObserver(refresh).observe(rail);
  refresh();
}
