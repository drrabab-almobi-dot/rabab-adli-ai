import { readFileSync } from 'node:fs';
import articles from '../content/articles.mjs';
import mojServices, { serviceAccessDate } from '../content/moj-services.mjs';
import information from '../content/information.mjs';
import regions from '../content/regions.mjs';
import { courtPage, entitySlug } from './generate-court-pages.mjs';
import { company, companySite, escapeHtml, site, staticPage } from './site-layout.mjs';

const entities = JSON.parse(readFileSync(new URL('../src/data/entities.json', import.meta.url), 'utf8'));
const lastModified = '2026-11-18';
const schemaContext = 'https://schema.org';

const notaryArticle = articles.find(({ slug }) => slug === 'notary-offices-by-region');

function notaryArticleLink(prefix) {
  return `<a href="${prefix}${notaryArticle.slug}.html">${escapeHtml(notaryArticle.title)}</a>`;
}

function notaryTables(groups) {
  const notariesByRegion = regions.map(([slug, name]) => ({
    slug,
    name,
    records: groups.get(name).filter(({ category }) => category === 'كتابات العدل'),
  })).sort((a, b) => b.records.length - a.records.length);

  return notariesByRegion.map(({ slug, name, records }) => {
    const rows = records.map(({ name, email }) => {
      const address = escapeHtml(email);
      return `<tr><td>${escapeHtml(name)}</td><td><a class="contact-address" href="mailto:${address}">${address}</a></td></tr>`;
    }).join('\n');
    return `<h2 id="notaries-${slug}">${escapeHtml(name)} (${records.length})</h2>
<table class="notary-table" aria-labelledby="notaries-${slug}">
<thead><tr><th scope="col">الجهة</th><th scope="col">البريد الإلكتروني</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`;
  }).join('\n');
}

function articlePage({ slug, title, description, faq, source }, groups) {
  const pathname = `articles/${slug}.html`;
  const articleBody = readFileSync(new URL(`../content/${pathname}`, import.meta.url), 'utf8');
  const tables = slug === notaryArticle.slug ? notaryTables(groups) : '';
  const relatedLink = slug === 'notary-contact' ? `<p>${notaryArticleLink('./')}</p>\n` : '';
  const officialSource = source ? `
<section aria-labelledby="official-source">
<h2 id="official-source">المصدر الرسمي</h2>
<p><a href="${escapeHtml(source)}">وصف الخدمة المنشور رسمياً</a> · تاريخ الاطلاع <time datetime="${serviceAccessDate}">${serviceAccessDate}</time>.</p>
<p>قد تتغير الخدمات أو طريقة عرضها. ارجع إلى الصفحة الرسمية للتحقق من المتطلبات الحالية.</p>
</section>` : '';
  const faqBody = faq.map(([question, answer]) => `<h3>${escapeHtml(question)}</h3>\n<p>${escapeHtml(answer)}</p>`).join('\n');
  return {
    pathname,
    title: `${title} | دليل التواصل العدلي`,
    description,
    article: true,
    body: `<article>
<h1>${escapeHtml(title)}</h1>
${articleBody}${tables}
<section aria-labelledby="article-faq">
<h2 id="article-faq">الأسئلة الشائعة</h2>
${faqBody}
</section>${officialSource}
</article>
${relatedLink}<p><a href="./">المدونة</a></p>`,
    schema: [
      {
        '@context': schemaContext,
        '@type': 'Article',
        headline: title,
        description,
        mainEntityOfPage: `${site}/${pathname}`,
        inLanguage: 'ar',
        datePublished: lastModified,
        dateModified: lastModified,
        author: { '@type': 'Organization', name: company, url: companySite },
        publisher: { '@type': 'Organization', name: company, url: companySite },
      },
      {
        '@context': schemaContext,
        '@type': 'FAQPage',
        mainEntity: faq.map(([question, answer]) => ({
          '@type': 'Question',
          name: question,
          acceptedAnswer: { '@type': 'Answer', text: answer },
        })),
      },
    ],
  };
}

const articleIndex = {
  pathname: 'articles/',
  title: 'المدونة | دليل التواصل العدلي',
  description: 'المدونة تضم أدلة عربية عن التواصل مع المحاكم وكتابات العدل والنيابة وديوان المظالم واستخدام ناجز والمراسلات والجلسات عن بعد.',
  body: `<h1>المدونة</h1>
<p class="lead">أدلة عربية تساعدك على تحديد الجهة، والتحقق من قناة التواصل، وفهم ما تحتاجه قبل الاستفسار عن خدمة أو موعد.</p>
<ul class="directory-list">
${articles.map(({ slug, title, description }) => `<li><a href="${slug}.html">${escapeHtml(title)}</a><small>${escapeHtml(description)}</small></li>`).join('\n')}
</ul>
<p>إذا كنت تعرف اسم الجهة، يمكنك الانتقال مباشرة إلى <a href="../#q">البحث في الدليل</a>.</p>`,
};

const regionIndex = {
  pathname: 'regions/',
  title: 'جهات التواصل العدلي حسب مناطق السعودية | دليل التواصل العدلي',
  description: 'تصفح بيانات المحاكم وكتابات العدل والدوائر حسب المناطق الإدارية الثلاث عشرة، واختر منطقة الجهة للتحقق من بيانات التواصل.',
  body: `<h1>تصفح الجهات حسب المنطقة</h1>
<p class="lead">اختر منطقة الجهة المذكورة في مستندك أو استخدم <a href="../#q">البحث في الدليل</a> للتصفية بالاسم والتصنيف.</p>
<ul class="directory-list">
${regions.map(([slug, name]) => `<li><a href="${slug}.html">${escapeHtml(name)}</a></li>`).join('\n')}
</ul>`,
};

function regionPage([slug, name, intro], records) {
  const list = records.map((entity) => `<li>
  <a href="../courts/${encodeURIComponent(entitySlug(entity))}/">${escapeHtml(entity.name)}</a>
  <small>${escapeHtml(entity.category)} · <bdi dir="ltr">${escapeHtml(entity.email)}</bdi></small>
</li>`).join('\n');

  return {
    pathname: `regions/${slug}.html`,
    title: `بيانات التواصل مع الجهات العدلية في ${name} | دليل التواصل العدلي`,
    description: `تصفح ${records.length} من سجلات المحاكم والدوائر وكتابات العدل في ${name} وراجع الاسم والعنوان عبر البطاقة والمصدر الرسمي.`,
    body: `<h1>الجهات العدلية في ${name}</h1>
${intro.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n')}
<p><a href="../#q">البحث في الدليل</a> · <a href="./">جميع المناطق</a> · <a href="../articles/court-email.html">طريقة التحقق من بريد المحكمة</a> · <a href="https://www.moj.gov.sa/">وزارة العدل</a></p>
<p>${notaryArticleLink('../articles/')}</p>
<h2>الجهات المدرجة في الدليل (${records.length})</h2>
<ul class="directory-list">
${list}
</ul>`,
  };
}

export function generateSitePages(siteBase) {
  const groups = new Map(regions.map(([, name]) => [name, []]));
  for (const entity of entities) {
    const records = groups.get(entity.region);
    if (!records) throw new Error(`Unknown region in entities.json: ${entity.region}`);
    records.push(entity);
  }
  if (groups.size !== regions.length || Array.from(groups.values()).some((records) => records.length === 0)) {
    throw new Error('Region pages do not match the regions in entities.json');
  }

  const categoriesByRegion = new Map();
  const namesByRegion = new Map();
  for (const entity of entities) {
    const categoryKey = `${entity.region}/${entity.category}`;
    const peers = categoriesByRegion.get(categoryKey) ?? [];
    peers.push(entity);
    categoriesByRegion.set(categoryKey, peers);
    const nameKey = `${entity.region}/${entity.name}`;
    namesByRegion.set(nameKey, (namesByRegion.get(nameKey) ?? 0) + 1);
  }

  const regionSlugs = new Map(regions.map(([slug, name]) => [name, slug]));
  const serviceTitles = new Map(mojServices.map(({ slug, title }) => [slug, title]));
  const pages = [
    ...information, articleIndex, ...articles.map((article) => articlePage(article, groups)),
    regionIndex, ...regions.map((region) => regionPage(region, groups.get(region[1]))),
    ...entities.map((entity) => courtPage(entity, {
      regionSlug: regionSlugs.get(entity.region),
      peers: categoriesByRegion.get(`${entity.region}/${entity.category}`).slice(0, 9),
      duplicateName: namesByRegion.get(`${entity.region}/${entity.name}`) > 1,
      serviceTitles,
    })),
  ];

  const files = new Map(pages.map((page) => [
    page.pathname.endsWith('/') ? `${page.pathname}index.html` : page.pathname,
    staticPage(page, siteBase),
  ]));
  if (files.size !== pages.length) throw new Error('Duplicate static page paths');

  const sitemapPaths = ['', ...pages.map(({ pathname }) => pathname)];
  const sitemapEntries = sitemapPaths.map((pathname) => {
    const encodedPath = pathname.split('/').map(encodeURIComponent).join('/');
    return `<url><loc>${site}/${encodedPath}</loc><lastmod>${lastModified}</lastmod></url>`;
  });
  files.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries.join('\n')}\n</urlset>\n`);
  return files;
}
