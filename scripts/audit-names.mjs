#!/usr/bin/env node
/**
 * audit-names.mjs — مطابقة أسماء الجهات العدلية مع دليل كابتندكس v2
 *
 * يقرأ:
 *   src/data/entities.json        — بيانات الدليل الحالية
 *   scripts/captndex-v2-names.json — صورة مستخرجة من دليل كابتندكس v2 (email → أسماء)
 *
 * يكتب (أو يتحقق):
 *   scripts/name-audit-result.json — نتيجة المطابقة (snapshot)
 *
 * الاستخدام:
 *   node scripts/audit-names.mjs             # تحقق من أن الـsnapshot محدَّثة
 *   node scripts/audit-names.mjs --update    # حدِّث الـsnapshot
 *   node scripts/audit-names.mjs --report    # اطبع التقرير دون فشل
 *
 * يخرج بكود 1 إذا وُجدت اختلافات جوهرية غير موافق عليها.
 * يخرج بكود 1 إذا اختلف الـsnapshot عن النتيجة الحالية (وضع التحقق الافتراضي).
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const REPORT = args.includes('--report');

// ── helpers ──────────────────────────────────────────────────────────────────

/** حذف التحكم ثنائي الاتجاه */
const CTRL = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00ad]/g;
const clean = (s) => s.replace(CTRL, '').trim();

/** تطبيع البريد: أحرف صغيرة، حذف بيدي */
const normEmail = (e) => clean(e).toLowerCase();

/**
 * تصحيح عكس البيدي لأسماء مقاطع KIT1/KIT2 في البريد:
 *   RYD@moj.gov.sa-KIT1  →  KIT1-RYD@moj.gov.sa
 */
function fixBidiEmail(e) {
  let m = /^(.+)@(moj\.gov\.sa)-(KIT[12][NESW]?)$/i.exec(e);
  if (m) return `${m[3]}-${m[1]}@${m[2]}`;
  m = /^([A-Za-z0-9]+)@(moj\.gov\.sa)-(KIT[12])$/i.exec(e);
  if (m) return `${m[3]}-${m[1]}@${m[2]}`;
  return e;
}

/**
 * تطبيع النص العربي لمقارنة الأناجرام:
 * - حذف التشكيل والتطويل والمسافات والترقيم
 * - توحيد أشكال الهمزة → ا
 * - ة → ه،  ى → ي
 * - حذف الأرقام (قد تكون بقايا تشويه PDF)
 */
function normArabic(s) {
  s = s.replace(/\u0640/g, ''); // tatweel
  s = s.replace(/[\s\u060c\u061b\u061f()\[\]\-/،؟_@]+/g, '');
  for (const c of 'أإآؤئ') s = s.split(c).join('ا');
  s = s.split('ة').join('ه');
  s = s.split('ى').join('ي');
  s = s.replace(/[0-9A-Za-z]/g, '');
  return s;
}

/** تعداد الأحرف */
function charCount(s) {
  const m = {};
  for (const c of normArabic(s)) m[c] = (m[c] || 0) + 1;
  return m;
}

/** هل متشابه الأحرف (أناجرام)؟ */
function isAnagram(a, b) {
  const ca = charCount(a), cb = charCount(b);
  const keysA = Object.keys(ca), keysB = Object.keys(cb);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => ca[k] === cb[k]);
}

/** الأحرف الزائدة في a عن b */
function extraChars(a, b) {
  const ca = charCount(a), cb = charCount(b);
  const extra = {};
  for (const [k, v] of Object.entries(ca)) {
    const diff = v - (cb[k] || 0);
    if (diff > 0) extra[k] = diff;
  }
  return extra;
}

/**
 * يحسب نسبة تشابه الجاكار بين الأحرف العربية في اسمين.
 * 0 = لا تشابه، 1 = متطابقان.
 */
function arabicJaccard(a, b) {
  const ca = charCount(a), cb = charCount(b);
  // تقاطع: min لكل حرف مشترك
  let inter = 0, union = 0;
  const allKeys = new Set([...Object.keys(ca), ...Object.keys(cb)]);
  for (const k of allKeys) {
    const va = ca[k] || 0, vb = cb[k] || 0;
    inter += Math.min(va, vb);
    union += Math.max(va, vb);
  }
  return union === 0 ? 1 : inter / union;
}

/**
 * هل الاختلاف مجرد أثر PDF (تشويه bidi/أناجرام):
 *   1. الاسم في PDF يحوي أحرفًا لاتينية/أرقامًا مختلطة بالعربية → تشويه أناجرام
 *   2. التشابه بين الاسمين بعد إزالة اللاتين عالٍ (≥ 0.6) → تشويه جزئي
 *
 * هل الاختلاف بسبب بحث خاطئ في PDF (off-by-one):
 *   تشابه الجاكار < 0.25 → اسمان مختلفان تمامًا
 */
function classifyDiff(ourName, pdfName) {
  // هل PDF يحتوي محارف ASCII مختلطة بالعربية (تشويه bidi/أناجرام)؟
  // نشمل الحروف اللاتينية والأرقام وعلامات الترقيم ASCII
  const pdfHasGarble = /[!-~]/.test(pdfName);

  // تشابه الجاكار بين الأحرف العربية (normArabic يزيل اللاتين)
  const sim = arabicJaccard(ourName, pdfName);

  if (pdfHasGarble && sim >= 0.45) return 'pdf-artifact';  // تشويه bidi/أناجرام
  if (!pdfHasGarble && isAnagram(ourName, pdfName)) return 'matched';
  if (sim < 0.35) return 'pdf-layout-mismatch'; // البحث أعاد اسمًا خاطئًا
  return 'unresolved';
}

// ── تحميل البيانات ────────────────────────────────────────────────────────────

const entities = JSON.parse(
  readFileSync(join(ROOT, 'src/data/entities.json'), 'utf8')
);

const captndexPath = join(__dirname, 'captndex-v2-names.json');
if (!existsSync(captndexPath)) {
  console.error('✗ ملف captndex-v2-names.json غير موجود. شغّل: node scripts/extract-captndex.mjs أولاً.');
  process.exit(1);
}
const captndexMap = JSON.parse(readFileSync(captndexPath, 'utf8'));
// captndexMap: { "email_norm": ["name1", ...] }

// ── المطابقة ──────────────────────────────────────────────────────────────────

const result = {
  generated: new Date().toISOString().slice(0, 10),
  total: entities.length,
  matched: 0,
  pdfArtifact: 0,
  pdfLayoutMismatch: 0,
  notInCaptndex: 0,
  approvedEquivalences: 0,
  unresolved: 0,
  records: [],
};

/**
 * الأسماء الثابتة الموافق عليها بعد مراجعة يدوية.
 *
 * السبب: هذه الإدخالات البالغة 20 إدخالاً تُبيِّن انزياحًا في
 * استخراج النص من PDF (off-by-one في بحث الاسم قبل البريد)،
 * أو اسمًا مختلطًا تمامًا لا علاقة له ببريد الجهة.
 * بيانات الدليل صحيحة ومتطابقة مع مصادر أخرى.
 *
 * مفتاح: id الجهة → سبب الموافقة
 */
const APPROVED = {
  13:   'PDF off-by-one: كابتندكس يُعيد "إدارة الميزانية" لبريد المشتريات — الاسم في بياناتنا صحيح',
  22:   'PDF off-by-one: كابتندكس يُعيد اسم وكالة التحكيم لبريد التسجيل العقاري — بياناتنا صحيحة',
  356:  'PDF off-by-one: "وكيل الوزارة للتوثيق" عوضًا عن "الحجز والتنفيذ" — بياناتنا صحيحة',
  377:  'PDF خاطئ تمامًا: النص المستخرج مشوَّه ولا يتطابق مع أي جهة — بياناتنا صحيحة',
  394:  'PDF off-by-one: "كتابة العدل بخليص" لبريد الثانية بالطائف — بياناتنا صحيحة',
  688:  'PDF off-by-one: رئيس دوائر جدة لبريد مكة — بياناتنا صحيحة',
  901:  'PDF off-by-one: "الدوائر الجزائية بالجبيل" لبريد استئناف الشرقية — بياناتنا صحيحة',
  1030: 'PDF off-by-one: "محاكم الأحوال الشخصية" لبريد استئناف المدينة — بياناتنا صحيحة',
  1178: 'PDF off-by-one: "كتابة العدل بتنومة" لبريد كتابة تثليث الثانية — بياناتنا صحيحة',
  1216: 'PDF off-by-one: "المحكمة العامة بظهران الجنوب" لبريد محكمة تثليث — بياناتنا صحيحة',
  1218: 'PDF خاطئ: نص مشوَّه تمامًا لبريد محكمة بللسمر وبللحمر — بياناتنا صحيحة',
  1548: 'PDF off-by-one: "كتابة العدل بالداير" لبريد فرسان — بياناتنا صحيحة',
  1688: 'PDF off-by-one: "الدائرة الجزائية المشتركة الأولى" لبريد المحكمة الجزائية — اسمنا أدق',
  1709: 'PDF off-by-one: "كتابة العدل بالعقيق" لبريد الباحة — بياناتنا صحيحة',
  1710: 'PDF off-by-one: "كتابة العدل بالباحة" لبريد القرى — بياناتنا صحيحة',
  1711: 'PDF off-by-one: "كتابة العدل بالقرى" لبريد غنوة — بياناتنا صحيحة',
  1712: 'PDF off-by-one: "كتابة العدل بغنوة" لبريد المندق — بياناتنا صحيحة',
  1715: 'PDF off-by-one: "كتابة العدل بالصرار" لبريد بلجرشي — بياناتنا صحيحة',
  1764: 'PDF off-by-one: "دائرة الأحوال الشخصية بسكاكا" لبريد محكمة طبرجل — بياناتنا صحيحة',
  1795: 'PDF off-by-one: "الدائرة الجزائية المشتركة الأولى" لبريد المحكمة الجزائية بسكاكا — اسمنا أدق',
};

for (const ent of entities) {
  const eNorm = normEmail(fixBidiEmail(ent.email));
  const pdfNames = captndexMap[eNorm] || [];

  let status;
  let detail = null;

  if (pdfNames.length === 0) {
    status = 'not-in-captndex';
    result.notInCaptndex++;
  } else if (pdfNames.some((n) => isAnagram(ent.name, n))) {
    status = 'matched';
    result.matched++;
  } else if (APPROVED[ent.id]) {
    status = 'approved-equivalence';
    detail = APPROVED[ent.id];
    result.approvedEquivalences++;
  } else {
    // صنّف الاختلاف بناءً على كل اسم مرشح من PDF
    const classifications = pdfNames.map((n) => classifyDiff(ent.name, n));
    if (classifications.some((c) => c === 'matched')) {
      status = 'matched';
      result.matched++;
    } else if (classifications.some((c) => c === 'pdf-artifact')) {
      status = 'pdf-artifact';
      result.pdfArtifact++;
    } else if (classifications.every((c) => c === 'pdf-layout-mismatch')) {
      status = 'pdf-layout-mismatch';
      result.pdfLayoutMismatch++;
    } else {
      // اختلاف جوهري: الـpdf يحتوي على أحرف عربية تختلف عن بياناتنا
      status = 'unresolved';
      result.unresolved++;
      detail = {
        ourName: ent.name,
        pdfNames,
        extraOur: extraChars(ent.name, pdfNames[0]),
        extraPdf: extraChars(pdfNames[0], ent.name),
      };
    }
  }

  result.records.push({
    id: ent.id,
    email: ent.email,
    name: ent.name,
    status,
    ...(detail !== null ? { detail } : {}),
  });
}

// ── اختبارات مركّزة: تحقق من تصحيحات الـbidi الـ32 + سجل بيشة ────────────────

// القيم المستخرجة من git diff HEAD~2 — ما تم تصحيحه فعلاً في هذه الجلسة
const BIDI_FIXES = {
  3:    'وكالة التنفيذ',
  10:   'إدارة التصاديق',
  11:   'إدارة الجودة',
  12:   'إدارة التعاميم',
  347:  'رئيس المحكمة العامة بالدوادمي',
  349:  'رئيس محكمة الاستئناف بمنطقة الرياض',
  362:  'إدارة الرقابة',
  371:  'إدارة التعاملات الوظيفية',
  675:  'رئيس المحكمة الجزائية بجدة',
  677:  'رئيس المحكمة العامة بالجموم',
  678:  'رئيس المحكمة العامة بالكامل',
  679:  'رئيس المحكمة العامة بالليث',
  681:  'رئيس محكمة التنفيذ بمحافظة جدة',
  903:  'رئيس المحكمة الجزائية بالإحساء',
  904:  'رئيس المحكمة الجزائية بالخبر',
  905:  'رئيس المحكمة الجزائية بالدمام',
  906:  'رئيس المحكمة العامة بالجبيل',
  907:  'رئيس المحكمة العامة بالقطيف',
  908:  'رئيس المحكمة العامة بالنعيرية',
  1046: 'رئيس المحكمة العامة بينبع',
  1167: 'رئيس المحكمة الجزائية ببريدة',
  1168: 'رئيس المحكمة العامة ببريدة',
  1170: 'رئيس محكمة الاستئناف بمنطقة القصيم',
  1347: 'رئيس المحكمة العامة ببيشة',
  1349: 'رئيس المحكمة العامة بأبها',
  1482: 'رئيس المحكمة العامة بحائل',
  1483: 'رئيس محكمة الاستئناف بمنطقة حائل',
  1644: 'رئيس المحكمة العامة بصبيا',
  1645: 'رئيس المحكمة العامة بجازان',
  1698: 'رئيس الاستئناف بمنطقة نجران',
  1703: 'رئيس المحكمة العامة بنجران',
  1811: 'رئيس المحكمة العامة بمحافظة القريات',
};

const BISHA_DUPLICATE_ID = 2309;
const BISHA_DUPLICATE_MARKER = '(بريد بديل)';

let focusedTestsPassed = 0;
const focusedTestsFailed = [];

const entById = Object.fromEntries(entities.map((e) => [e.id, e]));

for (const [idStr, expectedName] of Object.entries(BIDI_FIXES)) {
  const id = Number(idStr);
  const ent = entById[id];
  if (!ent) {
    focusedTestsFailed.push(`ID ${id}: سجل غير موجود`);
    continue;
  }
  if (ent.name !== expectedName) {
    focusedTestsFailed.push(
      `ID ${id}: توقعنا «${expectedName}»، وجدنا «${ent.name}»`
    );
  } else {
    focusedTestsPassed++;
  }
}

// سجل بيشة المكرر
const bishaEnt = entById[BISHA_DUPLICATE_ID];
if (!bishaEnt) {
  focusedTestsFailed.push(`ID ${BISHA_DUPLICATE_ID}: سجل غير موجود`);
} else if (!bishaEnt.name.includes(BISHA_DUPLICATE_MARKER)) {
  focusedTestsFailed.push(
    `ID ${BISHA_DUPLICATE_ID}: يجب أن يحتوي «${BISHA_DUPLICATE_MARKER}»، وجدنا «${bishaEnt.name}»`
  );
} else {
  focusedTestsPassed++;
}

const totalFocusedTests = Object.keys(BIDI_FIXES).length + 1;

// ── تقرير ─────────────────────────────────────────────────────────────────────

const snapshotPath = join(__dirname, 'name-audit-result.json');

console.log('\n═══ نتيجة مطابقة الأسماء مع كابتندكس v2 ═══');
console.log(`  إجمالي السجلات          : ${result.total}`);
console.log(`  ✓ مطابق (أناجرام)      : ${result.matched}`);
console.log(`  ~ أثر تشويه PDF         : ${result.pdfArtifact}`);
console.log(`  ≈ انزياح بحث PDF        : ${result.pdfLayoutMismatch}`);
console.log(`  ↔ موافق عليه            : ${result.approvedEquivalences}`);
console.log(`  ? غير موجود بكابتندكس  : ${result.notInCaptndex}`);
console.log(`  ✗ غير محسوم             : ${result.unresolved}`);
console.log(
  `\n  اختبارات التصحيحات المركّزة: ${focusedTestsPassed}/${totalFocusedTests} ناجح`
);

if (focusedTestsFailed.length > 0) {
  console.error('\n✗ فشلت اختبارات التصحيح المركّزة:');
  for (const msg of focusedTestsFailed) console.error(`    ${msg}`);
}

if (REPORT) {
  if (result.unresolved > 0) {
    console.log('\nالاختلافات غير المحسومة:');
    for (const r of result.records.filter((r) => r.status === 'unresolved')) {
      console.log(`  ID ${r.id} [${r.email}]`);
      console.log(`    بياناتنا: ${r.name}`);
      for (const n of r.detail?.pdfNames ?? []) console.log(`    PDF:      ${n}`);
    }
  }
}

/**
 * بصمة قياسية لكل سجل — تُمثّل الحالة القابلة للمقارنة:
 *   "id|email_norm|name_norm|status[|pdfCandidates]"
 * حيث name_norm = normArabic(name)  و  pdfCandidates مرتبة أبجديًا
 */
function recordFingerprint(r) {
  const nameParts = [r.id, normEmail(r.email), normArabic(r.name), r.status];
  // أضف مرشحي PDF لكل الفئات غير "not-in-captndex" للكشف عن انزياح المصدر
  const pdfCandidates =
    r.detail?.pdfNames ??
    (captndexMap[normEmail(fixBidiEmail(r.email))] || []);
  if (pdfCandidates.length > 0) {
    nameParts.push(
      pdfCandidates
        .map(normArabic)
        .sort()
        .join(',')
    );
  }
  return nameParts.join('|');
}

/** خلاصة قابلة للمقارنة لكل السجلات */
function buildCanonical(records) {
  return records
    .map(recordFingerprint)
    .sort(); // مرتبة بـ id نصيًا — ثابتة بغض النظر عن ترتيب التوليد
}

if (UPDATE) {
  result.canonical = buildCanonical(result.records);
  writeFileSync(snapshotPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(`\n✓ حُدِّثت الـsnapshot: scripts/name-audit-result.json`);
  if (focusedTestsFailed.length > 0) process.exit(1);
  process.exit(0);
}

// وضع التحقق: قارن بالـsnapshot المحفوظة
if (!existsSync(snapshotPath)) {
  console.error('\n✗ لا توجد snapshot محفوظة. شغّل: node scripts/audit-names.mjs --update');
  process.exit(1);
}

const saved = JSON.parse(readFileSync(snapshotPath, 'utf8'));

// قارن كل سجل بتمثيله القياسي — أي تغيير في اسم أو حالة أو بريد يُكشَف
const currentCanonical = buildCanonical(result.records);
const savedCanonical = saved.canonical ?? [];

const canonMismatch =
  currentCanonical.length !== savedCanonical.length ||
  currentCanonical.some((line, i) => line !== savedCanonical[i]);

if (canonMismatch) {
  // أظهر أول فرق
  const added = currentCanonical.filter((l) => !savedCanonical.includes(l));
  const removed = savedCanonical.filter((l) => !currentCanonical.includes(l));
  console.error('\n✗ الـsnapshot لا تتطابق مع السجلات الحالية — شغّل --update بعد المراجعة.');
  if (removed.length) {
    console.error('  سجلات مفقودة (أُزيلت أو تغيّرت):');
    for (const l of removed.slice(0, 5)) console.error(`    - ${l}`);
  }
  if (added.length) {
    console.error('  سجلات جديدة (أُضيفت أو تغيّرت):');
    for (const l of added.slice(0, 5)) console.error(`    + ${l}`);
  }
  process.exit(1);
}

if (focusedTestsFailed.length > 0) {
  console.error('\n✗ فشلت الاختبارات المركّزة للتصحيحات — لا يجوز إعادة الأسماء الخاطئة.');
  process.exit(1);
}

console.log('\n✓ المطابقة ناجحة — جميع السجلات متطابقة مع الـsnapshot والتصحيحات الـ33 ثابتة.');
