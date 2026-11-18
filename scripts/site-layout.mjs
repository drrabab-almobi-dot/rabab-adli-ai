export const site = 'https://rabab-adli.com';
export const company = 'شركة رباب المعبي للمحاماة والاستشارات القانونية';
export const companySite = 'https://rabablawyer.sa';

const headerLinks = [
  ['', 'الرئيسية'], ['#q', 'الدليل'], ['articles/', 'المدونة'],
  ['regions/', 'المناطق'], ['about.html', 'من نحن'], ['contact.html', 'تواصل معنا'],
];
const footerLinks = [
  ['articles/', 'المدونة'],
  ['privacy.html', 'سياسة الخصوصية'], ['terms.html', 'الشروط'],
  ['about.html', 'من نحن'], ['contact.html', 'تواصل معنا'],
];

export const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function navigation(links, label, depth, page) {
  const root = '../'.repeat(depth) || './';
  return `<nav class="site-nav" aria-label="${label}">
    ${links.map(([href, name]) => `<a href="${root}${href}"${href === page ? ' aria-current="page"' : ''}>${name}</a>`).join('\n    ')}
  </nav>`;
}

export function header(depth, page) {
  return `<header class="top">
  <div class="brand">
    <img src="${'../'.repeat(depth) || './'}brand.png" width="56" height="56" alt="" decoding="async">
    <div class="titles">
      <span class="main">دليل التواصل العدلي</span>
      <span class="sub">Rabab Adli AI</span>
    </div>
  </div>
  <div class="badge-ai">رباب · عدلي · AI</div>
  ${navigation(headerLinks, 'التنقل الرئيسي', depth, page)}
</header>`;
}

export function footerNavigation(depth, page) {
  return navigation(footerLinks, 'روابط التذييل', depth, page);
}


const MAX_DESCRIPTION = 155;
export function capDescription(text) {
  const value = String(text).trim();
  if (value.length <= MAX_DESCRIPTION) return value;
  const cut = value.slice(0, MAX_DESCRIPTION);
  const space = cut.lastIndexOf(' ');
  return `${(space > 80 ? cut.slice(0, space) : cut).replace(/[\s،,.؛:—-]+$/u, '')}…`;
}

function defaultSchema(pathname, title, description, url) {
  const base = { '@context': 'https://schema.org', name: title, description, url, inLanguage: 'ar' };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: `${site}/` },
    { '@type': 'ListItem', position: 2, name: title, item: url },
  ] };
  if (pathname === 'about.html') {
    return [{ ...base, '@type': 'AboutPage', about: { '@type': 'Organization', name: company, url: companySite, telephone: '+966504647649' } }, crumbs];
  }
  if (pathname === 'contact.html') {
    return [{ ...base, '@type': 'ContactPage', about: { '@type': 'Organization', name: company, url: companySite, telephone: '+966504647649' } }, crumbs];
  }
  if (pathname.startsWith('articles/') && pathname.endsWith('/')) return [{ ...base, '@type': ['CollectionPage', 'Blog'] }, crumbs];
  if (pathname.startsWith('regions/')) return [{ ...base, '@type': 'CollectionPage' }, crumbs];
  return [{ ...base, '@type': 'WebPage' }, crumbs];
}

export function staticPage({ pathname, title, description: rawDescription, body, schema: rawSchema = [], article = false }, siteBase) {
  const description = capDescription(rawDescription);
  const depth = pathname.split('/').length - 1;
  const root = '../'.repeat(depth) || './';
  const pageDirectory = pathname.slice(0, pathname.lastIndexOf('/') + 1);
  // Clean URL hosts can serve the same .html file one directory deeper.
  const baseTag = pathname.endsWith('.html') && siteBase.startsWith('/')
    ? `<base href="${escapeHtml(siteBase + pageDirectory)}">\n`
    : '';
  const url = `${site}/${pathname.split('/').map(encodeURIComponent).join('/')}`;
  const schema = rawSchema.length ? rawSchema : defaultSchema(pathname, title, description, url);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}">
${baseTag}<link rel="canonical" href="${url}">
<meta property="og:type" content="${article ? 'article' : 'website'}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="ar_SA">
<meta property="og:site_name" content="دليل التواصل العدلي | Rabab Adli AI">
<meta property="og:image" content="${site}/og-logo.png">
<link rel="icon" href="${root}brand.png">
<link rel="stylesheet" href="${root}site.css">
${schema.map((item) => `<script type="application/ld+json">${JSON.stringify(item).replaceAll('<', '\\u003c')}</script>`).join('\n')}
</head>
<body>
<div class="circuit-bg" aria-hidden="true"></div>
<div class="wrap">
${header(depth, pathname)}
<main class="site-content">
${body}
</main>
<footer>
  <div class="brandline">دليل التواصل العدلي — Rabab Adli AI</div>
  <div>دليل مجتمعي تديره <a href="${companySite}">${company}</a> بإشراف المحامية د. رباب أحمد المعبي، وبمساعدة الذكاء الاصطناعي.</div>
  ${footerNavigation(depth, pathname)}
  <div class="copyright">جميع الحقوق محفوظة</div>
</footer>
</div>
</body>
</html>
`;
}
