#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import articles from '../content/articles.mjs';
import information from '../content/information.mjs';
import regions from '../content/regions.mjs';
import { site } from './site-layout.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const entities = JSON.parse(
  readFileSync(join(ROOT, 'src/data/entities.json'), 'utf8'),
);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function requireFile(relativePath) {
  const file = join(DIST, relativePath);
  if (!existsSync(file)) fail(`ملف البناء مفقود: dist/${relativePath}`);
  return file;
}

requireFile('index.html');
requireFile('robots.txt');
requireFile('sitemap.xml');
if (readFileSync(requireFile('ads.txt'), 'utf8').trim() !== '#') {
  fail('ads.txt must be a comment-only placeholder');
}

// Preserve the published root URLs alongside the assets that Vite fingerprints.
for (const image of ['og-logo.png', 'apple-touch-icon.png', 'favicon.png', 'icon-192.png', 'icon-512.png']) {
  copyFileSync(join(ROOT, image), join(DIST, image));
  requireFile(image);
}

const courtDir = join(DIST, 'courts');
if (!existsSync(courtDir)) fail('مجلد صفحات الجهات مفقود من البناء');
const courtPages = readdirSync(courtDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .filter((entry) => existsSync(join(courtDir, entry.name, 'index.html')));

if (courtPages.length !== entities.length) {
  fail(`عدد صفحات الجهات ${courtPages.length} لا يطابق عدد السجلات ${entities.length}`);
}

const contentPages = [
  ...information.map(({ pathname }) => pathname),
  'articles/index.html', ...articles.map(({ slug }) => `articles/${slug}.html`),
  'regions/index.html', ...regions.map(([slug]) => `regions/${slug}.html`),
];

const sitemap = readFileSync(requireFile('sitemap.xml'), 'utf8');
const sitemapUrls = new Set(Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]));
const expectedCount = entities.length + contentPages.length + 1;
if (sitemapUrls.size !== expectedCount) {
  fail(`Sitemap contains ${sitemapUrls.size} URLs, expected ${expectedCount}`);
}
if (!readFileSync(requireFile('robots.txt'), 'utf8').includes(`Sitemap: ${site}/sitemap.xml`)) {
  fail('robots.txt does not link to the production sitemap');
}

const titles = new Set();
const descriptions = new Set();
const allPages = [
  'index.html', ...contentPages,
  ...courtPages.map(({ name }) => `courts/${name}/index.html`),
];
for (const page of allPages) {
  const content = readFileSync(requireFile(page), 'utf8');
  const head = content.split('</head>', 1)[0];
  const title = head.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = head.match(/<meta name="description" content="([^"]+)">/)?.[1];
  const url = `${site}/${page.replace(/(^|\/)index\.html$/, '$1').split('/').map(encodeURIComponent).join('/')}`;
  if (!title || !description || titles.has(title) || descriptions.has(description)) {
    fail(`Missing or duplicate page metadata: ${page}`);
  }
  titles.add(title);
  descriptions.add(description);
  if (!sitemapUrls.has(url) || !head.includes(`<link rel="canonical" href="${url}">`)) {
    fail(`Missing sitemap entry or canonical URL: ${page}`);
  }
  if (/adsbygoogle|google-adsense-account|ca-pub-\d+/i.test(content) ||
      !content.includes('aria-label="التنقل الرئيسي"')) {
    fail(`Missing page navigation or unexpected AdSense configuration: ${page}`);
  }
  const footer = content.match(/<footer>([\s\S]*?)<\/footer>/)?.[1] ?? '';
  for (const link of ['about.html', 'privacy.html', 'terms.html', 'contact.html']) {
    if (!footer.includes(`/${link}"`)) fail(`Missing footer link to ${link}: ${page}`);
  }
}

const html = readFileSync(requireFile('index.html'), 'utf8');
const embeddedMatch = html.match(/const DATA = (\[.*?\]);/s);
if (!embeddedMatch) fail('بيانات الجهات غير موجودة في الصفحة المبنية');
const embedded = JSON.parse(embeddedMatch[1]);
if (embedded.length !== entities.length) {
  fail(`بيانات الصفحة ${embedded.length} لا تطابق ملف البيانات ${entities.length}`);
}

const deploymentInputs = [
  '.vercelignore',
  'package.json',
  'vite.config.ts',
  'vercel.json',
  'index.html',
  'scripts/generate-court-pages.mjs',
];
const vercelIgnore = readFileSync(join(ROOT, '.vercelignore'), 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim());
if (!vercelIgnore.includes('.replit-artifact')) {
  fail('بيانات تشغيل Replit ليست مستثناة من رفع Vercel');
}

const forbidden = [
  /@replit\//i,
  /\bREPLIT_(?:DB|AUTH|OBJECT|DEV|DOMAIN|DEPLOYMENT|CONNECTOR)/i,
  /\bDATABASE_URL\b/,
  /@workspace\/(?:db|api-client|api-spec)/,
];

for (const relativePath of deploymentInputs) {
  const content = readFileSync(join(ROOT, relativePath), 'utf8');
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      fail(`اعتماد غير مستقل في ${relativePath}: ${pattern}`);
    }
  }
}

console.log(
  `✓ تحقق البناء المستقل: ${entities.length} سجل، ${courtPages.length} صفحة جهة، ${sitemapUrls.size} رابطًا، دون اعتماد على Replit.`,
);
