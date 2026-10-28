import { readFile, access, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { normalizeProjectName } from '../assets/modules/catalog.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const site = JSON.parse(await readFile(path.join(root,'content/site.json'),'utf8'));
const checksums = JSON.parse(await readFile(path.join(root,'content/asset-checksums.json'),'utf8'));
const pages = new Map();
const errors=[];
const canonicalUrls = new Set();
const titles = new Set();
for (const page of site.pages) pages.set(page.path, await readFile(path.join(root,page.path),'utf8'));
for (const [name, html] of pages) {
  if ([...html.matchAll(/<h1\b/g)].length !== 1) errors.push(`${name}: expected one h1`);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  if (new Set(ids).size !== ids.length) errors.push(`${name}: duplicate ids`);
  for (const match of html.matchAll(/\b(?:href|src|srcset)="([^" ]+)"/g)) {
    const value=match[1].replaceAll('&amp;','&');
    if (/^(https?:|tel:|mailto:|data:)/.test(value)) continue;
    const uri=new URL(value,'https://local.invalid/'+name);
    const destination=decodeURIComponent(uri.pathname.slice(1)) || 'index.html';
    try { await access(path.join(root,destination)); }
    catch { errors.push(`${name}: missing ${destination}`); }
    if (uri.hash && destination.endsWith('.html')) {
      const content=pages.get(destination);
      const id=decodeURIComponent(uri.hash.slice(1));
      if (!content?.includes(`id="${id}"`)) errors.push(`${name}: missing fragment ${destination}#${id}`);
    }
  }
  if (!html.includes('assets/runtime.js') || !html.includes('assets/theme.css')) errors.push(`${name}: missing new runtime`);
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  if (!title || titles.has(title)) errors.push(`${name}: missing or duplicate title`);
  titles.add(title);
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const expectedCanonical = 'https://bal-house.ru/' + (name === 'index.html' ? '' : name);
  if (canonical !== expectedCanonical) errors.push(`${name}: incorrect canonical URL`);
  if (name !== '404.html') {
    canonicalUrls.add(canonical);
    const data = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    try {
      const graph = JSON.parse(data)['@graph'];
      const company = graph.find(item => item['@type'] === 'GeneralContractor');
      assert.equal(company.telephone, site.company.phoneHref.slice(4));
      assert.equal(company.address.addressLocality, 'Балаково');
      assert.equal(company.areaServed.name, 'Саратовская область');
      const ids = graph.map(item => item['@id']);
      assert.equal(new Set(ids).size, ids.length);
      const breadcrumb = graph.find(item => item['@type'] === 'BreadcrumbList');
      if (breadcrumb) {
        assert.equal(breadcrumb.itemListElement[0].item, 'https://bal-house.ru/');
        assert.equal(breadcrumb.itemListElement.at(-1).item, canonical);
      }
      if (site.pages.find(page => page.path === name).type === 'service') {
        assert.ok(graph.some(item => item['@type'] === 'Service'));
      }
    } catch (error) { errors.push(`${name}: invalid structured data: ${error.message}`); }
  }
  if (/site-v5|gsap\.min/.test(html)) errors.push(`${name}: obsolete runtime reference`);
  for (const match of html.matchAll(/target="_blank"[^>]*>/g)) {
    if (!match[0].includes('noopener')) errors.push(`${name}: external link without noopener`);
  }
}
for (const [file, expected] of Object.entries(checksums)) {
  const buffer=await readFile(path.join(root,file));
  const content=/\.(txt|svg)$/.test(file) ? buffer.toString('utf8').replace(/\r\n/g,'\n') : buffer;
  const actual=createHash('sha256').update(content).digest('hex');
  if (actual !== expected) errors.push(`Changed original asset: ${file}`);
}
assert.equal(normalizeProjectName('KD–54'),normalizeProjectName('КД-54'));
assert.equal(normalizeProjectName('KDS 54'),normalizeProjectName('КДС-54'));
assert.equal(normalizeProjectName('БЛ–130'),normalizeProjectName('BL-130'));
assert.equal(normalizeProjectName('ТЁПЛЫЙ дом'),normalizeProjectName('теплый дом'));
const sitemap = await readFile(path.join(root,'sitemap.xml'),'utf8');
const listedUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.deepEqual([...canonicalUrls].sort(), listedUrls.sort(), 'Sitemap must contain every indexable page exactly once');
assert.ok(!sitemap.includes('/404.html'));
assert.ok((await readFile(path.join(root,'robots.txt'),'utf8')).includes('Sitemap: https://bal-house.ru/sitemap.xml'));
for (const file of ['scripts/build.mjs','scripts/seo.mjs','scripts/preview.mjs','scripts/check.mjs','assets/runtime.js',...(await readdir(path.join(root,'assets/modules'))).map(file=>'assets/modules/'+file)]) {
  execFileSync(process.execPath,['--check',path.join(root,file)],{stdio:'pipe'});
}
assert.equal((await readFile(path.join(root,'CNAME'),'utf8')).trim(),'bal-house.ru');
if (errors.length) { console.error(errors.join('\n')); process.exitCode=1; }
else console.log(`PASS: ${pages.size} pages, titles/canonicals/structured data/sitemap, local links and fragments, ${Object.keys(checksums).length} unchanged original assets, search normalization, JavaScript syntax and CNAME.`);
