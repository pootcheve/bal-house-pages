import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { canonicalUrl, structuredData, sitemap } from './seo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const styleVersion = createHash('sha256').update(await readFile(path.join(root, 'assets/theme.css'))).digest('hex').slice(0, 12);
const moduleDir = path.join(root, 'assets/modules');
const moduleFiles = (await readdir(moduleDir)).filter(file => file.endsWith('.js'));
const stripVersion = source => source.replace(/\?v=[a-f0-9]+/g, '');
const runtimeSource = stripVersion(await readFile(path.join(root, 'assets/runtime.js'), 'utf8'));
const scriptVersion = createHash('sha256')
  .update(runtimeSource + (await Promise.all(moduleFiles.map(async file => stripVersion(await readFile(path.join(moduleDir, file), 'utf8'))))).join(''))
  .digest('hex').slice(0, 12);
// проставляем версию в импорты модулей, иначе браузер до 10 минут держит старый JS
const runtimePath = path.join(root, 'assets/runtime.js');
const runtimeCurrent = await readFile(runtimePath, 'utf8');
const runtimeVersioned = runtimeCurrent.replace(/(\.\/modules\/[a-z0-9-]+\.js)(\?v=[a-f0-9]+)?(['"])/g, `$1?v=${scriptVersion}$3`);
if (runtimeVersioned !== runtimeCurrent) await writeFile(runtimePath, runtimeVersioned);
const site = JSON.parse(await readFile(path.join(root, 'content/site.json'), 'utf8'));
const company = site.company;
const projects = new Map(site.cards.map(card => [card.id, card]));
const order = ['bl-130', 'bl-154', 'kd-54', 'kds-54', 'ready-house'];
const menu = [
  ['index.html', 'Главная'], ['projects.html', 'Проекты'],
  ['directions.html', 'Направления'], ['objects.html', 'Наши объекты'],
  ['about.html', 'О компании'], ['contacts.html', 'Контакты'],
];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const availableAvif = new Set((await readdir(path.join(root, 'assets')))
  .filter(file => file.endsWith('.avif')).map(file => '/assets/' + file.replace(/\.avif$/, '.webp')));

const webpSize = async file => {
  const data = await readFile(file);
  if (data.toString('ascii', 0, 4) !== 'RIFF' || data.toString('ascii', 8, 12) !== 'WEBP') return [0, 0];
  const chunk = data.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [data.readUIntLE(24, 3) + 1, data.readUIntLE(27, 3) + 1];
  if (chunk === 'VP8 ') return [data.readUInt16LE(26) & 0x3fff, data.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') {
    const bits = data.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  return [0, 0];
};

const assetNames = new Set(await readdir(path.join(root, 'assets')));
const assetSizes = new Map();
const responsiveAssets = new Map();
for (const file of [...assetNames].filter(name => name.endsWith('.webp'))) {
  const base = file.replace(/\.webp$/, '');
  const candidates = [];
  for (const suffix of ['-small', '-medium', '-large', '']) {
    const name = base + suffix + '.webp';
    if (!assetNames.has(name)) continue;
    const [w, h] = await webpSize(path.join(root, 'assets', name));
    candidates.push({ src: '/assets/' + name, width: w, height: h });
  }
  if (candidates.length > 1) responsiveAssets.set('/assets/' + file, candidates);
  const full = candidates.find(candidate => candidate.src.endsWith('/' + file));
  if (full) assetSizes.set('/assets/' + file, [full.width, full.height]);
}

const sizeHints = {
  card: '(max-width: 700px) 95vw, (max-width: 1500px) 50vw, 706px',
  hero: '(max-width: 1000px) 95vw, (max-width: 1500px) 53vw, 760px',
  stage: '(max-width: 1000px) 95vw, 745px',
  band: '(max-width: 1000px) 95vw, 572px',
  thumb: '(max-width: 1000px) 18vw, 90px',
  photo: '(max-width: 700px) 95vw, 425px',
  full: '(max-width: 1000px) 95vw, 1216px',
};

function renderer(page) {
  const local = value => {
    if (!value.startsWith('/')) return value;
    if (page.type === '404') return value;
    const url = new URL(value, 'https://local.invalid');
    return (path.posix.relative(path.posix.dirname(page.path), url.pathname.slice(1)) || 'index.html') + url.search + url.hash;
  };
  const anchor = (label, href, className = '', extra = '') => `<a href="${esc(local(href))}"${className ? ` class="${className}"` : ''}${/^https?:/.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}${extra}>${esc(label)}</a>`;
  const rich = parts => parts.map(part => typeof part === 'string' ? esc(part) : anchor(part.label, part.href)).join('');
  const paragraphs = (items = [], className = '') => items.map(parts => `<p${className ? ` class="${className}"` : ''}>${rich(parts)}</p>`).join('\n');
  const image = (asset, {className = '', eager = false, picture = true, sizes: sizeHint = '', portrait = ''} = {}) => {
    const attrs = `src="${esc(local(asset.src))}" alt="${esc(asset.alt)}"${asset.width ? ` width="${asset.width}" height="${asset.height}"` : ''} loading="${eager ? 'eager' : 'lazy'}" decoding="async"${eager ? ' fetchpriority="high"' : ''}${className ? ` class="${className}"` : ''}`;
    const candidates = responsiveAssets.get(asset.src) || [];
    const sizesAttr = sizeHint ? ` sizes="${esc(sizeHint)}"` : '';
    const webpList = list => list.map(candidate => `${esc(local(candidate.src))} ${candidate.width}w`).join(', ');
    const avifList = list => list.map(candidate => `${esc(local(candidate.src.replace(/\.webp$/, '.avif')))} ${candidate.width}w`).join(', ');
    const portraitList = portrait ? (responsiveAssets.get(portrait) || []) : [];
    const portraitSource = portraitList.length > 1
      ? `<source media="(max-width: 700px)" type="image/avif" srcset="${avifList(portraitList)}"${sizesAttr}><source media="(max-width: 700px)" type="image/webp" srcset="${webpList(portraitList)}"${sizesAttr}>`
      : '';
    if (candidates.length < 2) {
      return picture && availableAvif.has(asset.src) ? `<picture>${portraitSource}<source type="image/avif" srcset="${esc(local(asset.src.replace(/\.webp$/, '.avif')))}"><img ${attrs}></picture>` : `<img ${attrs}>`;
    }
    const avifCandidates = candidates.filter(candidate => availableAvif.has(candidate.src));
    const avifSource = avifCandidates.length > 1 ? `<source type="image/avif" srcset="${avifList(avifCandidates)}"${sizesAttr}>` : '';
    const img = `<img ${attrs} srcset="${webpList(candidates)}"${sizesAttr}>`;
    return picture ? `<picture>${portraitSource}${avifSource}<source type="image/webp" srcset="${webpList(candidates)}"${sizesAttr}>${img}</picture>` : img;
  };
  // Сцена обрезает фото по object-fit: cover, поэтому браузеру нужна версия шире,
  // чем сам кадр — иначе он возьмёт мелкую и растянет её (фото выходит «замыленным»).
  const stageSizes = src => {
    const [w, h] = assetSizes.get(src) || [0, 0];
    if (!w || !h) return sizeHints.stage;
    const ratio = w / h;
    return `(max-width: 700px) ${Math.round(92 * Math.min(ratio, 1.6) / 1.6)}vw, ${Math.round(52 * Math.min(ratio, 1.6) / 1.6)}vw`;
  };
  const webpSrcset = src => {
    const candidates = responsiveAssets.get(src) || [];
    if (candidates.length < 2) return '';
    return candidates.map(candidate => `${esc(local(candidate.src))} ${candidate.width}w`).join(', ');
  };
  const button = (label, href, style = '') => anchor(label.replace(/^каталоге VK$/, 'Проект в VK').replace(/\s*[→↗]$/, ''), href, `action${style ? ' action--'+style : ''}`);
  const contactButtons = (message = 'Обсудить в VK', light = false) => `<div class="action-row">${button(message, company.message)}${button('Позвонить', company.phoneHref, light ? 'light' : 'outline')}</div>`;
  const nav = () => menu.map(([file,label]) => anchor(label, '/'+file, '', page.path === file ? ' aria-current="page"' : '')).join('\n');
  const logo = (variant = 'black') => `<a class="wordmark" href="${local('/index.html')}" aria-label="Bal House — главная"><img src="${local('/assets/logo-'+variant+'.svg')}" width="660" height="300" alt="Bal House" decoding="async"></a>`;
  const header = `<header class="masthead"><div class="wrap masthead__row"><div class="masthead__brand">${logo()}<span>Дома для жизни<br>Балаково и область</span></div>
    <nav class="nav-wide" aria-label="Основная навигация">${nav()}</nav>
    ${anchor(company.phone, company.phoneHref, 'masthead__phone', ' aria-label="Позвонить в Bal House: +7 (927) 125-09-01"')}
    ${button('Написать в VK', company.message, 'header')}
    <details class="nav-drawer" data-navigation><summary role="button" aria-label="Открыть меню" aria-controls="mobile-links"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></summary>
      <nav id="mobile-links" aria-label="Мобильная навигация">${nav()}${anchor('Позвонить в Bal House',company.phoneHref)}${anchor('Сообщество ВКонтакте',company.vk)}</nav></details>
  </div></header>`;
  const footer = `<footer class="page-footer" data-menu-background><div class="wrap"><div class="page-footer__heading"><span>ВАШ ДОМ НАЧИНАЕТСЯ С ИДЕИ</span>${anchor('Обсудим её вместе ↗',company.message)}</div><div class="page-footer__columns"><div>${logo('white')}<p>Строительство загородных домов в Балаково и Саратовской области.</p></div>
    <nav aria-label="Навигация внизу страницы">${nav()}</nav><address>${anchor(company.phone,company.phoneHref,'phone-link')}${anchor('Bal House во ВКонтакте',company.vk)}<p>${esc(company.address)}</p></address></div>
    <div class="page-footer__legal"><span>${esc(company.legalName)} · ИНН ${company.inn} · ОГРН ${company.ogrn}</span>${anchor('Политика обработки данных','/privacy.html')}</div></div></footer>`;
  const crumbs = () => `<nav class="trail" aria-label="Хлебные крошки"><ol>${page.crumbs.map(link => `<li>${anchor(link.label,link.href)}</li>`).join('')}<li aria-current="page">${esc(page.heading)}</li></ol></nav>`;
  const pageTitle = () => `<div class="wrap page-intro">${crumbs()}<p class="eyebrow">BAL HOUSE · ${esc({projects:'КАТАЛОГ ДОМОВ',directions:'СТРОИМ ДЛЯ ВАС',objects:'НА СТРОИТЕЛЬНОЙ ПЛОЩАДКЕ',object:'ЭТАПЫ СТРОИТЕЛЬСТВА',about:'О НАС',contacts:'БУДЕМ НА СВЯЗИ',privacy:'ДОКУМЕНТЫ'}[page.type]??'ЗАГОРОДНАЯ ЖИЗНЬ')}</p><h1>${esc(page.heading)}</h1>${paragraphs(page.lead,'muted')}${(page.sourceLinks??[]).map(a=>anchor(a.label,a.href,'text-action')).join('')}${page.type==='projects'?anchor('Сравнить проекты ↓','#compare','text-action'):''}</div>`;
  const section = (content, {id = '', pale = false, className = ''} = {}) => `<section${id ? ` id="${id}"` : ''} class="block${pale ? ' block--pale' : ''}${className ? ' '+className : ''}"><div class="wrap">${content}</div></section>`;
  const sectionTitle = (title, link, description = '') => `<div class="section-title"><div><h2>${esc(title)}</h2>${description ? `<p class="muted">${esc(description)}</p>` : ''}</div>${link ? anchor(link.label,link.href,'text-action') : ''}</div>`;
  const cta = () => page.cta.title ? `<section class="contact-band"><div class="wrap contact-band__row"><div class="contact-band__copy"><p class="eyebrow">СЛЕДУЮЩИЙ ШАГ — ВАШ</p><h2>${esc(page.cta.title)}</h2>${paragraphs(page.cta.paragraphs)}<div class="action-row">${page.cta.links.map((a,i)=>button(a.label,a.href,i?'light':'')).join('')}</div></div><figure class="contact-band__photo">${image({src:'/assets/bl154-hero.webp',alt:'Каменный дом Bal House среди сосен'},{sizes:sizeHints.band})}</figure></div></section>` : '';
  const card = (id, index = 0) => {
    const data = projects.get(id);
    return `<article class="home-card" data-house="${esc(id)}" data-category="${esc(data.kind)}" data-cost="${data.price}" data-search="${esc(data.search)}" data-order="${index}">
      <a class="home-card__media" href="${local('/'+data.path)}" aria-label="Посмотреть проект ${esc(data.name)}">${image(data.image,{sizes:sizeHints.card})}<span class="home-card__kind">${esc({stone:'Каменный дом',frame:'Каркасный дом',ready:'С отделкой'}[data.kind])}</span></a>
      <div class="home-card__body"><h3>${anchor(data.name,'/'+data.path)}</h3><p class="home-card__summary">${esc(data.summary)}</p><ul class="home-card__specs">${data.specs.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>
      <div class="home-card__price">${new Intl.NumberFormat('ru-RU').format(data.price)} ₽</div><p class="home-card__note">${esc(data.priceNote)}</p>${button(data.button,'/'+data.path)}</div></article>`;
  };
  const cards = (ids, className = '') => `<div class="house-grid${className ? ' '+className : ''}">${ids.map(card).join('\n')}</div>`;
  const directionCards = () => `<div class="service-list">${page.directions.map(item=>`<a class="service-tile" href="${local(item.href)}"><div class="service-tile__media">${image(item.image,{sizes:sizeHints.card})}${item.note?`<span>${esc(item.note)}</span>`:''}</div><div class="service-tile__copy"><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><span class="service-tile__more">Подробнее →</span></div></a>`).join('')}</div>`;
  const definitionTable = rows => `<table class="details-table"><tbody>${rows.map(([key,value])=>`<tr><th scope="row">${esc(key)}</th><td>${esc(value)}</td></tr>`).join('')}</tbody></table>`;
  const photoGrid = (photos, className = '') => `<div class="photo-grid ${className}">${photos.map(photo=>`<figure><a href="${local(photo.image.src)}" target="_blank" rel="noopener noreferrer" aria-label="Открыть фото: ${esc(photo.caption)}">${image(photo.image,{sizes:sizeHints.photo})}</a><figcaption>${esc(photo.caption)}</figcaption></figure>`).join('')}</div>`;
  const bulletList = values => `<ul class="question-list">${values.map(value=>`<li>${esc(value)}</li>`).join('')}</ul>`;

  function home() {
    const hero = `<section class="welcome"><div class="welcome__media">${image(page.hero.image,{className:'welcome__image',eager:true,sizes:'100vw',portrait:'/assets/bl154-hero-portrait.webp'})}</div><div class="welcome__overlay"></div>
      <div class="welcome__inner wrap"><p class="welcome__location eyebrow">${esc(page.hero.location)}</p><h1>${esc(site.seo.homeHeading[0])} <span>${esc(site.seo.homeHeading[1])}</span></h1><p class="welcome__lead">${esc(page.hero.lead)}</p><div class="action-row">${button('Выбрать проект','/projects.html')}${button('Обсудить в VK',company.message,'light')}</div><p class="welcome__signature">BAL HOUSE <span>СТРОИТЕЛЬСТВО ЗАГОРОДНЫХ ДОМОВ</span></p></div>
      <div class="welcome__badge">${anchor('BL-154 · 125 м² ↗','/projects/bl-154.html')}</div></section>
      <div class="welcome__facts-wrap wrap"><ul class="welcome__facts">${page.hero.facts.map((fact,i)=>`<li><span class="welcome__fact-number">0${i+1}</span><span>${esc(fact)}</span></li>`).join('')}</ul></div>`;
    const featured = `<div class="project-showcase" data-carousel>${cards(page.featured,'project-rail')}<div class="rail-controls" hidden><span>Листайте проекты</span><div><button type="button" data-rail-step="-1" aria-label="Предыдущий проект">←</button><output aria-live="polite" data-rail-status>1 из ${page.featured.length}</output><button type="button" data-rail-step="1" aria-label="Следующий проект">→</button></div></div></div>`;
    const construction = `<section class="construction-banner wrap"><div class="construction-banner__photos">${image({src:'/assets/bl130-walls.webp',alt:'Дом BL-130: возведение стен на участке'},{sizes:sizeHints.photo})}${image({src:'/assets/bl5-walls-2.webp',alt:'Возведение стен BL-5: кладка'},{sizes:sizeHints.photo})}</div><div class="construction-banner__copy"><p class="eyebrow">ИЗ ПРОЕКТА — В НАСТОЯЩИЙ ДОМ</p><h2>Строительство.<br>Шаг за шагом.</h2><p>Фундамент, армирование, заливка плиты и возведение стен. Фотографии реальных этапов из сообщества Bal House.</p>${button('Смотреть наши объекты','/objects.html')}</div></section>`;
    return hero +section(sectionTitle('Найдите свой дом',{label:'Весь каталог →',href:'/projects.html'},'Каменные и каркасные дома из каталога Bal House.')+featured+'<p class="fine-print">Цены приведены из каталога VK. Состав работ и актуальную стоимость уточняйте перед заключением договора.</p>',{className:'featured-section'})
      +section(sectionTitle('От фундамента до крыши',{label:'Все направления →',href:'/directions.html'},'Строительство дома целиком или отдельные этапы.')+directionCards(),{pale:true})
      +construction+section('<h2>С чего начать строительство</h2><ol class="process-list">'+page.steps.map((step,i)=>`<li><span>${String(i+1).padStart(2,'0')}</span><h3>${esc(step.title)}</h3><p>${esc(step.body)}</p></li>`).join('')+'</ol>')
      +section(sectionTitle('Перед началом строительства',{label:'Задать свой вопрос →',href:'/contacts.html'},'Ответы на вопросы, с которых удобно начать разговор о доме.')+`<div class="faq-list">${page.faq.map(q=>`<details><summary role="button">${esc(q.question)}</summary><div>${paragraphs(q.answer)}</div></details>`).join('')}</div>`,{id:'questions'});
  }

  function catalog() {
    const filters = `<form class="catalog-controls" data-catalog-controls hidden role="search" aria-label="Фильтры проектов"><label>Тип дома<select name="kind"><option value="all">Все варианты</option><option value="stone">Каменные дома</option><option value="frame">Каркасные дома</option><option value="ready">Готовый дом</option></select></label>
      <details class="catalog-controls__extra" data-catalog-extra open><summary role="button">Поиск и порядок</summary><div><label>Поиск по проектам<input type="search" name="q" maxlength="100" placeholder="Название или тип дома" autocomplete="off"></label><label>Порядок показа<select name="sort"><option value="default">Порядок каталога</option><option value="price-up">По цене: сначала дешевле</option><option value="price-down">По цене: сначала дороже</option></select></label></div></details>
      <button type="reset" class="text-button">Сбросить фильтры</button></form>`;
    const rows=page.comparison;
    const compare=`<p class="mobile-note">На телефоне таблицу можно пролистать вправо →</p><div class="comparison-scroll" tabindex="0" role="region" aria-label="Сравнение проектов"><table class="comparison-table"><caption class="visually-hidden">Основные параметры проектов Bal House</caption><thead><tr><th scope="col">${esc(rows[0][0])}</th>${order.slice(0,4).map(id=>`<th scope="col">${anchor(projects.get(id).name+' →','/'+projects.get(id).path)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((row,rowIndex)=>`<tr><th scope="row">${esc(row[0])}</th>${row.slice(1).map((value,i)=>`<td>${rowIndex===6?anchor(value,'/'+projects.get(order[i]).path+'#plans'):esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="fine-print">Для КД-54 стоимость тёплого контура указана в публикации от 14 марта 2025 года. Перед заказом уточните актуальную цену и перечень работ для каждого проекта.</p>${anchor('Готовый дом с отделкой: наличие и просмотр →','/projects/ready-house.html','text-action')}`;
    return pageTitle()+section(`<div data-catalog>${filters}<div class="catalog-status" hidden data-catalog-status><output role="status" aria-live="polite" aria-atomic="true" data-catalog-count></output></div>${cards(order,'catalog-grid')}<div class="catalog-empty" data-catalog-empty hidden><h2>Таких проектов не найдено</h2><p>Попробуйте другое название или посмотрите весь каталог.</p><button type="button" class="action" data-catalog-reset>Показать все проекты</button></div></div><p class="fine-print">Цены и сведения — из ${anchor('каталога Bal House в VK','https://vk.ru/market-223841683')}. У некоторых карточек площадь и комплектация не указаны. Их можно уточнить вместе с расчётом.</p>`)
      +section(sectionTitle('Сравните проекты',{label:'Помочь с выбором →',href:company.message},'Площадь, конструкция и комплектация помогают выбрать дом. Цена без состава работ не даёт полного сравнения.')+compare,{id:'compare',pale:true});
  }

  function gallery() {
    const first = page.shots[0];
    const choices = page.shots.map((shot, index) => `
      <a href="${local(shot.src)}" target="_blank" rel="noopener noreferrer"
        data-gallery-choice data-image-src="${local(shot.src)}"
        data-image-srcset="${webpSrcset(shot.src)}" data-image-sizes="${stageSizes(shot.src)}"
        data-image-alt="${esc(shot.alt)}" data-image-caption="${esc(shot.caption)}"
        data-image-fit="${shot.plan ? 'contain' : 'cover'}"
        aria-label="${esc(shot.caption)} (${index + 1} из ${page.shots.length})"
        ${index === 0 ? 'aria-current="true"' : ''}>${image(shot,{picture:false,sizes:sizeHints.thumb})}</a>`).join('');
    return `<div class="image-viewer" data-gallery>
      <figure class="image-viewer__stage">
        <button class="image-viewer__open" type="button" data-gallery-open aria-label="Увеличить фотографию">${image(first,{picture:false,eager:true,sizes:stageSizes(first.src)})}</button>
        <figcaption data-gallery-caption>${esc(first.caption)}</figcaption>
      </figure>
      ${page.shots.length > 1 ? `<div class="image-viewer__thumbnails" aria-label="Изображения проекта">${choices}</div>
      <p class="image-viewer__help">Нажмите на миниатюру, чтобы сменить изображение.</p>` : ''}
    </div>`;
  }

  function project() {
    const s=page.sections;
    const intro=`<div class="wrap project-intro">${crumbs()}<div class="project-overview"><div class="project-overview__copy"><p class="eyebrow">ПРОЕКТ BAL HOUSE</p><h1>${esc(page.heading)}</h1><p class="project-subtitle">${esc(page.subtitle)}</p>${paragraphs(page.intro.slice(1,2),'muted')}<dl class="project-facts">${page.facts.map(f=>`<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('')}</dl><p class="project-cost">${esc(page.displayPrice)}</p>${paragraphs(page.intro.slice(2),'fine-print')}<div class="action-row">${page.introLinks.map((a,i)=>button(a.label,a.href,i?'outline':'')).join('')}</div></div>${gallery()}</div><nav class="section-tabs" aria-label="Разделы проекта">${[['description','Описание'],['plans','Планировка'],['equipment','Комплектация и стоимость'],...(s.building?[['building','Строительство']]:[]),['related','Ещё проекты']].map(([id,label])=>anchor(label,'#'+id)).join('')}</nav></div>`;
    const description=`<div class="project-description"><div><h2>${esc(s.description.heading)}</h2>${paragraphs(s.description.paragraphs,'muted')}${page.descriptionSource.map(a=>anchor(a.label,a.href,'text-action')).join('')}</div><div><h2>Основные характеристики</h2>${definitionTable(s.description.tables[0])}</div>${s.description.tables[1]?`<aside class="construction-spec"><h3>Конструкция дома</h3>${definitionTable(s.description.tables[1])}${anchor('Состав работ и стоимость ↓','#equipment','text-action')}</aside>`:''}</div>`;
    const plans=s.plans.figures.length?`<div class="plan-layout${s.plans.figures.length===1?' plan-layout--single':''}">${s.plans.figures.map(f=>`<figure class="plan-sheet">${image(f.image)}<figcaption>${esc(f.caption)}</figcaption>${anchor('Открыть изображение планировки',f.image.src,'text-action',' target="_blank" rel="noopener noreferrer"')}</figure>`).join('')}${s.plans.figures.length===1?`<div>${paragraphs(s.plans.paragraphs.slice(1))}${s.plans.lists.map(bulletList).join('')}${button('Запросить планировку в VK',company.message)}</div>`:''}</div>`:`<div class="plan-request">${button('Запросить планировку в VK',company.message)}</div>`;
    const equipment=`<div class="equipment-layout"><div><h2>${esc(s.equipment.heading)}</h2>${paragraphs(s.equipment.paragraphs,'muted')}${page.id==='kd-54'?'<dl class="package-prices"><div><dt>Тёплый контур</dt><dd>1 400 000 ₽</dd></div><div><dt>Под ключ</dt><dd>1 900 000 ₽</dd></div></dl>':''}${s.equipment.lists.map(bulletList).join('')}</div>${button(page.id==='ready-house'?'Обсудить просмотр в VK':'Обсудить в VK',company.message)}</div>`;
    return intro+section(description,{id:'description'})+section(`<h2>${esc(s.plans.heading)}</h2>${paragraphs(s.plans.paragraphs.slice(0,1),'muted')}${plans}`,{id:'plans',pale:true})+section(equipment,{id:'equipment'})
      +(s.building?section(sectionTitle('Строительство по проекту '+page.heading,{label:'Все фотографии →',href:'/objects/bl130-build.html'})+photoGrid(s.building.figures,'photo-grid--three'),{id:'building',pale:true}):'')
      +section(sectionTitle('Ещё проекты',{label:'Весь каталог →',href:'/projects.html'})+cards(s.related.related,'related-grid'),{id:'related'});
  }

  function service() {
    return `<div class="wrap service-intro">${crumbs()}<div class="service-overview"><div class="service-overview__text"><p class="eyebrow">НАПРАВЛЕНИЕ BAL HOUSE</p><h1>${esc(page.heading)}</h1><p class="project-subtitle">${esc(page.subtitle)}</p>${paragraphs(page.paragraphs.slice(1),'muted')}${button('Обсудить в VK',company.message)}</div><figure class="service-overview__photo">${image(page.figure.image,{eager:true,sizes:sizeHints.card})}<figcaption>${esc(page.figure.caption)}</figcaption></figure><aside class="estimate-questions"><h2>Что нужно для расчёта</h2><p class="muted">Необязательно знать все ответы заранее. Начните с того, что уже решили.</p>${bulletList(page.questions)}</aside></div></div>`
      +(page.path==='directions/foundations.html'?section('<h2>Фотографии фундамента BL-130</h2><p class="muted">Посмотрите подготовку участка, армирование и заливку плиты в фотографиях Bal House.</p>'+photoGrid([['bl130-foundation.webp','Опалубка фундамента'],['bl130-rebar.webp','Армирование плиты'],['bl130-pour.webp','Заливка плиты']].map(([file,caption])=>({image:{src:'/assets/'+file,alt:caption,width:1280,height:960},caption})),'photo-grid--three')+button('Смотреть фотографии','/objects/bl130-build.html'),{pale:true}):'')
      +(page.related.length?section('<h2>Подходящие проекты</h2>'+page.catalogLinks.map(a=>anchor(a.label,a.href,'text-action')).join('')+cards(page.related,'paired-grid'),{pale:true}):'');
  }
  function objects() {
    const entries=[{path:'/objects/bl130-build.html',name:'Строительство дома BL-130',image:'bl130-foundation.webp',description:'Подготовка участка, фундамент и возведение стен.'},{path:'/objects/bl5-build.html',name:'Строительство дома BL-5',image:'bl5-walls-2.webp',description:'Возведение стен дома: фотографии с площадки.'}];
    return pageTitle()+section(`<div class="object-list">${entries.map(o=>`<article class="object-tile">${anchor('',o.path,'object-tile__link',` aria-label="${esc(o.name)}"`).replace('</a>',image({src:'/assets/'+o.image,alt:o.name},{sizes:sizeHints.card})+'</a>')}<div><p class="fine-print">Реальные фотографии · этап строительства</p><h2>${esc(o.name)}</h2><p class="muted">${esc(o.description)}</p>${button('Смотреть фотографии',o.path)}</div></article>`).join('')}</div><p class="fine-print">Больше фотографий и видео — в ${anchor('сообществе Bal House',company.vk)}.</p>`);
  }
  function about() {
    return pageTitle()+section(`<div class="company-overview"><div><h2>От идеи дома к строительству</h2>${paragraphs(page.paragraphs,'muted')}${button('Посмотреть проекты','/projects.html')}</div><figure>${image(page.photo,{sizes:sizeHints.card})}<figcaption>Фото строительства BL-5 из сообщества Bal House.</figcaption></figure></div>`)
      +section(`<div class="company-overview"><div><h2>Компания и контакты</h2><p class="muted">Обсудите проект с Олегом Лихонкиным. Телефон, адрес офиса и реквизиты компании собраны здесь.</p>${definitionTable(page.tables[0])}</div><div><h2>Обсудите ваш дом</h2><p>${esc(company.address)}</p>${anchor(company.phone,company.phoneHref,'phone-link')}<div class="action-row">${button('Все контакты','/contacts.html')}${anchor('Открыть сообщество Bal House',company.vk,'text-action')}</div></div></div>`,{pale:true});
  }
  function contacts() {
    return pageTitle()+section(`<div class="contact-layout"><div class="contact-facts"><section><h2>Телефон</h2>${anchor(company.phone,company.phoneHref,'contact-value')}<p class="fine-print">Контакт в сообществе — Олег Лихонкин.</p></section><section><h2>ВКонтакте</h2>${button('Написать в VK',company.message)}</section><section><h2>Офис</h2><p class="contact-value">${esc(company.address)}</p><p class="fine-print">Перед визитом уточните время встречи по телефону.</p>${anchor('Найти адрес на карте →',company.map,'text-action')}</section><section><h2>Реквизиты</h2><p>${esc(company.legalName)}<br>ИНН ${company.inn}<br>ОГРН ${company.ogrn}</p></section></div>
      <aside class="direct-contact">${image({src:'/assets/bl154-hero.webp',alt:''},{sizes:sizeHints.full})}<div><h2>Обсудим ваш дом</h2><p>Напишите, какой дом хотите построить и где находится участок. Если выбрали проект из каталога, укажите его название.</p>${button('Написать в VK',company.message)}<p class="fine-print">Откроется личная переписка с Bal House во ВКонтакте.</p></div></aside></div>`);
  }
  function privacy() {
    return pageTitle()+section(`<div class="legal-text">${page.blocks.map(block=>block.type==='list'?`<ul>${block.items.map(item=>`<li>${rich(item)}</li>`).join('')}</ul>`:block.type==='definitions'?`<dl class="legal-definitions">${block.rows.map(([dt,dd])=>`<div><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`).join('')}</dl>`:`<${block.type}>${rich(block.content)}</${block.type}>`).join('\n')}</div>`);
  }

  let body;
  switch(page.type) {
    case 'index':body=home();break;
    case 'projects':body=catalog();break;
    case 'project':body=project();break;
    case 'service':body=service();break;
    case 'directions':body=pageTitle()+section(directionCards());break;
    case 'objects':body=objects();break;
    case 'object':body=pageTitle()+section(photoGrid(page.photos,'photo-grid--construction'))+(page.related.length?section(sectionTitle('Проект этого дома',{label:'О проекте →',href:'/projects/bl-130.html'})+cards(page.related,'single-grid'),{pale:true}):'');break;
    case 'about':body=about();break;
    case 'contacts':body=contacts();break;
    case 'privacy':body=privacy();break;
    case '404':body=section('<p class="muted">404</p><h1>Страница не найдена</h1><p>Перейдите в каталог проектов или вернитесь на главную.</p><div class="action-row">'+button('Смотреть проекты','/projects.html')+button('На главную','/index.html','outline')+'</div>');break;
    default:throw new Error('Unknown page type: '+page.type);
  }
  const canonical = canonicalUrl(page.path);
  const ld = structuredData(site, page);
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(page.description)}">
  <meta name="robots" content="${page.type==='404'?'noindex,nofollow':'index,follow'}">
  <meta name="theme-color" content="#1e261c">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Bal House">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:title" content="${esc(page.title)}">
  <meta property="og:description" content="${esc(page.description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="https://bal-house.ru/assets/og-cover.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(page.title)}">
  <meta name="twitter:description" content="${esc(page.description)}">
  <meta name="twitter:image" content="https://bal-house.ru/assets/og-cover.png">
  ${ld ? `<script type="application/ld+json">${ld}</script>` : ''}
  <link rel="icon" href="${local('/assets/favicon.svg')}" type="image/svg+xml">
  <link rel="apple-touch-icon" href="${local('/assets/apple-touch-icon.png')}">
  <link rel="manifest" href="${local('/assets/site.webmanifest')}">
  <link rel="stylesheet" href="${local('/assets/theme.css')}?v=${styleVersion}">
  <script type="module" src="${local('/assets/runtime.js')}?v=${scriptVersion}"></script>
</head>
<body class="page--${esc(page.type)}">
  <a class="skip-link" href="#main">Перейти к содержанию</a>
  ${header}
  <main id="main" tabindex="-1" data-menu-background>
    ${body}
    ${cta()}
  </main>
  ${footer}
</body>
</html>
`;
}

for (const page of site.pages) {
  const destination=path.join(root,page.path);
  await mkdir(path.dirname(destination),{recursive:true});
  await writeFile(destination,renderer(page).replace(/[ \t]+$/gm, ''));
}
console.log(`Generated ${site.pages.length} static pages. GitHub Pages serves these files without a build step.`);
await writeFile(path.join(root, 'sitemap.xml'), sitemap(site));
