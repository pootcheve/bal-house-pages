const origin = 'https://bal-house.ru/';

export function canonicalUrl(file) {
  return new URL(file === 'index.html' || file === '/index.html' ? '/' : file, origin).href;
}

export function structuredData(site, page) {
  if (page.type === '404') return '';
  const canonical = canonicalUrl(page.path);
  const companyId = origin + '#company';
  const websiteId = origin + '#website';
  const area = { '@type': 'AdministrativeArea', name: site.seo.region };
  const business = {
    '@type': 'GeneralContractor', '@id': companyId,
    name: site.company.name, legalName: site.company.legalName,
    url: origin, telephone: site.company.phoneHref.slice(4),
    address: { '@type': 'PostalAddress', ...site.seo.address },
    areaServed: area, sameAs: [site.company.vk], taxID: site.company.inn,
    logo: new URL('assets/logo.webp', origin).href,
    image: ['bl154-hero.webp', 'kd54.webp', 'bl130-foundation.webp'].map(file => new URL('assets/' + file, origin).href),
  };
  const webpage = {
    '@type': ({ about: 'AboutPage', contacts: 'ContactPage', projects: 'CollectionPage', directions: 'CollectionPage', objects: 'CollectionPage' })[page.type] ?? 'WebPage',
    '@id': canonical + '#webpage', url: canonical,
    name: page.title, description: page.description, inLanguage: site.seo.language,
    isPartOf: { '@id': websiteId }, about: { '@id': companyId },
  };
  const graph = [business, {
    '@type': 'WebSite', '@id': websiteId, url: origin,
    name: site.company.name, inLanguage: site.seo.language,
    publisher: { '@id': companyId },
  }, webpage];
  if (page.crumbs.length) {
    const crumbs = [...page.crumbs.map(item => ({ name: item.label, url: canonicalUrl(item.href) })), { name: page.heading, url: canonical }];
    const breadcrumbId = canonical + '#breadcrumb';
    webpage.breadcrumb = { '@id': breadcrumbId };
    graph.push({ '@type': 'BreadcrumbList', '@id': breadcrumbId,
      itemListElement: crumbs.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: item.url })),
    });
  }
  if (page.type === 'service') {
    const serviceId = canonical + '#service';
    webpage.mainEntity = { '@id': serviceId };
    graph.push({ '@type': 'Service', '@id': serviceId, name: page.heading,
      description: page.description, url: canonical,
      provider: { '@id': companyId }, areaServed: area,
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

export function sitemap(site) {
  const entries = site.pages.filter(page => page.type !== '404').map(page => `  <url><loc>${canonicalUrl(page.path)}</loc><lastmod>${site.seo.modified}</lastmod></url>`);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + entries.join('\n') + '\n</urlset>\n';
}
