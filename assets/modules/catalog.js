export function normalizeProjectName(value) {
  return value.normalize('NFKC').toLocaleLowerCase('ru-RU')
    .replaceAll('ё', 'е').replaceAll('kds', 'кдс').replaceAll('kd', 'кд')
    .replaceAll('бл', 'bl').replace(/[\s\p{P}]/gu, '');
}

export function mountCatalog(root) {
  const form = root.querySelector('[data-catalog-controls]');
  const grid = root.querySelector('.catalog-grid');
  const items = [...grid.querySelectorAll('[data-house]')];
  const query = form.elements.namedItem('q');
  const category = form.elements.namedItem('kind');
  const sorting = form.elements.namedItem('sort');
  const extra = form.querySelector('[data-catalog-extra]');
  const output = root.querySelector('[data-catalog-count]');
  const empty = root.querySelector('[data-catalog-empty]');
  const compact = matchMedia('(max-width: 700px)');
  const categories = new Set([...category.options].map(option => option.value));
  const sorts = new Set([...sorting.options].map(option => option.value));
  const originals = new Map(items.map((item, index) => [item, index]));
  const names = new Map(items.map(item => [item, normalizeProjectName(item.dataset.search)]));

  function render() {
    const needle = normalizeProjectName(query.value.trim());
    const ordered = [...items].sort((left, right) => {
      const diff = Number(left.dataset.cost) - Number(right.dataset.cost);
      if (sorting.value === 'price-up') return diff || originals.get(left) - originals.get(right);
      if (sorting.value === 'price-down') return -diff || originals.get(left) - originals.get(right);
      return originals.get(left) - originals.get(right);
    });
    let shown = 0;
    for (const item of ordered) {
      const matches = (category.value === 'all' || item.dataset.category === category.value)
        && names.get(item).includes(needle);
      item.hidden = !matches;
      if (matches) shown += 1;
    }
    grid.append(...ordered);
    grid.dataset.count = String(shown);
    output.textContent = `Показано домов: ${shown} из ${items.length}`;
    empty.hidden = shown !== 0;
  }

  function remember() {
    const address = new URL(window.location.href);
    const state = { q: query.value.trim(), kind: category.value, sort: sorting.value };
    for (const [key, value] of Object.entries(state)) {
      if (!value || (key === 'kind' && value === 'all') || (key === 'sort' && value === 'default')) {
        address.searchParams.delete(key);
      } else {
        address.searchParams.set(key, value);
      }
    }
    history.replaceState(history.state, '', address);
  }

  function restore() {
    const params = new URLSearchParams(window.location.search);
    query.value = (params.get('q') ?? '').slice(0, 100);
    category.value = categories.has(params.get('kind')) ? params.get('kind') : 'all';
    sorting.value = sorts.has(params.get('sort')) ? params.get('sort') : 'default';
    extra.open = !compact.matches || Boolean(query.value) || sorting.value !== 'default';
    render();
  }

  function reset() {
    query.value = '';
    category.value = 'all';
    sorting.value = 'default';
    render();
    remember();
    extra.open = true;
    query.focus();
  }

  form.addEventListener('input', event => { if (event.target === query) { render(); remember(); } });
  form.addEventListener('change', event => { if (event.target !== query) { render(); remember(); } });
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('reset', event => { event.preventDefault(); reset(); });
  root.querySelector('[data-catalog-reset]').addEventListener('click', reset);
  compact.addEventListener('change', () => { extra.open = !compact.matches || Boolean(query.value) || sorting.value !== 'default'; });
  window.addEventListener('pageshow', restore);
  window.addEventListener('popstate', restore);
  restore();
  form.hidden = false;
  root.querySelector('[data-catalog-status]').hidden = false;
}
