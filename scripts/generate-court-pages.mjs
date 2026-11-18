#!/usr/bin/env node
import guidance from '../content/entity-guidance.mjs';
import { site, escapeHtml } from './site-layout.mjs';

/** Must stay in sync with entitySlug() in src/lib/slug.ts */
export function entitySlug(e) {
  const name = String(e.name)
    .trim()
    .replace(/[\u064B-\u065F\u0640]/g, '') // harakat + tatweel
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${e.id}-${name}`;
}

const serviceByCategory = {
  'كتابات العدل': 'electronic-power-of-attorney',
  'محاكم التنفيذ': 'submit-enforcement-request',
  'دوائر التنفيذ': 'submit-enforcement-request',
  'محاكم الأحوال الشخصية': 'document-existing-marriage',
  'دوائر الأحوال الشخصية': 'document-will-najiz',
  'الدوائر النهائية': 'digitize-heirship-deed',
  'المحاكم العامة': 'file-electronic-lawsuit',
  'المحاكم التجارية': 'file-electronic-lawsuit',
  'المحاكم العمالية': 'file-electronic-lawsuit',
  'الدوائر القضائية': 'written-litigation-najiz',
  'الدوائر الحقوقية': 'written-litigation-najiz',
  'الدوائر الجزائية': 'written-litigation-najiz',
  'المحاكم الجزائية': 'written-litigation-najiz',
  'محاكم الاستئناف': 'written-litigation-najiz',
  'دوائر الاستئناف': 'written-litigation-najiz',
};

const categoryGuides = {
  'كتابات العدل': ['notary-offices-by-region', 'كتابات العدل حسب المناطق والاختصاص'],
  'المحكمة الإدارية': ['board-of-grievances', 'التواصل مع ديوان المظالم والمحاكم الإدارية'],
  'النيابة العامة': ['public-prosecution', 'التواصل مع النيابة العامة والقنوات الرسمية'],
};

export function courtPage(e, { regionSlug, peers, duplicateName, serviceTitles }) {
  const slug = entitySlug(e);
  const pathname = `courts/${slug}/`;
  const url = `${site}/courts/${encodeURIComponent(slug)}/`;
  const regionPath = `regions/${regionSlug}.html`;
  const title = `${e.name} | البريد الرسمي - ${e.region}${duplicateName ? ` (${e.id})` : ''}`;
  const description = `${title}. عنوان البريد ${e.email}، وتصنيف الجهة ${e.category}، وروابط لاستعراض الجهات في المنطقة والتحقق من قناة التواصل.`;
  const name = escapeHtml(e.name);
  const region = escapeHtml(e.region);
  const category = escapeHtml(e.category);
  const email = escapeHtml(e.email);
  const paragraph = guidance[e.category];
  if (!paragraph) throw new Error(`Missing contact guidance for category: ${e.category}`);
  const guide = categoryGuides[e.category] ?? (/محاكم|دوائر/.test(e.category)
    ? ['court-types', 'أنواع المحاكم السعودية']
    : null);
  const guideLink = guide ? ` <a href="../../articles/${guide[0]}.html">${guide[1]}</a>.` : '';
  const service = serviceByCategory[e.category] ?? 'najiz-service-complaints';
  const serviceTitle = serviceTitles.get(service);
  if (!serviceTitle) throw new Error(`Missing service guide: ${service}`);
  const similar = peers.filter((entity) => entity.id !== e.id).slice(0, 8);
  const similarList = similar.length
    ? `<ul>${similar.map((entity) => `<li><a href="../${encodeURIComponent(entitySlug(entity))}/">${escapeHtml(entity.name)}</a></li>`).join('')}</ul>`
    : '<p>يمكنك الرجوع إلى صفحة المنطقة لاستعراض التصنيفات الأخرى ومقارنة بيانات التواصل المنشورة للجهات المدرجة فيها.</p>';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'GovernmentOrganization',
    name: e.name,
    email: e.email,
    areaServed: e.region,
    description: `${e.category} — ${e.region}`,
    url,
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'الرئيسية', item: `${site}/` },
      { '@type': 'ListItem', position: 2, name: e.region, item: `${site}/${regionPath}` },
      { '@type': 'ListItem', position: 3, name: e.name, item: url },
    ],
  };
  const body = `<nav aria-label="مسار الصفحة"><a href="../../">الرئيسية</a> ← <a href="../../${regionPath}">${region}</a> ← <span aria-current="page">${name}</span></nav>
<h1>${name}</h1>
<div class="directory-list">
  <p>${region} · ${category}</p>
  <h2>البريد الإلكتروني</h2>
  <a class="contact-address" href="mailto:${email}">${email}</a>
</div>
<section aria-labelledby="entity-about">
  <h2 id="entity-about">عن هذه الجهة</h2>
  <p>يظهر اسم «${name}» في دليل التواصل العدلي ضمن تصنيف «${category}» في ${region}. تعرض البطاقة عنوان التواصل المدرج لهذا الاسم، ويمكنك مقارنة التصنيف والمنطقة بما يرد في مستندك قبل اختيار الجهة. تحقّق من العنوان والغرض من القناة في المصدر الرسمي قبل إرسال أي بيانات.</p>
</section>
<section aria-labelledby="entity-contact">
  <h2 id="entity-contact">متى تراسل هذه الجهة؟</h2>
  <p>${escapeHtml(paragraph)}${guideLink}</p>
</section>
<section aria-labelledby="similar-entities">
  <h2 id="similar-entities">جهات مشابهة في المنطقة</h2>
  ${similarList}
</section>
<p>استعرض <a href="../../${regionPath}">جهات ${region}</a> أو ارجع إلى <a href="../../#q">البحث في الدليل</a>. تجد في <a href="../../articles/">المدونة</a> أدلة عن القنوات والخدمات الرسمية، ومنها <a href="../../articles/${service}.html">${escapeHtml(serviceTitle)}</a>.</p>`;
  return { pathname, title, description, body, schema: [jsonLd, breadcrumb] };
}
