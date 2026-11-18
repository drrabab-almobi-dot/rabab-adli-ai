#!/usr/bin/env node
/**
 * فحص تلقائي لصيَغ الإيميلات في دليل التواصل العدلي.
 *
 * الخلفية: الإيميلات المنسوخة من PDF عربي (RTL) تنعكس مقاطعها بسبب خوارزمية bidi،
 * فيظهر `GEN-RYD-LD9` مثلًا على شكل `9LD-RYD-GEN`، أو `KIT-AFIF` على شكل
 * `AFIF-KIT`، أو ينتقل مقطع إلى ما بعد النطاق (`RYD@MOJ.GOV.SA-KIT1`).
 *
 * آلية الفحص لكل إيميل في const DATA داخل index.html:
 *   1. الصيغة العامة: local@domain حيث النطاق ينتهي بـ .GOV.SA ولا شيء بعده.
 *   2. لا مقطع (مفصول بـ "-") يبدأ برقم ويتبعه حروف — اتفاقية الوزارة تضع الأرقام
 *      في نهاية المقطع (ryd-bi-icc19, MAT-MAK-LD5)؛ المقاطع الرقمية بالكامل
 *      (مثل رقم دائرة "-32") مسموحة.
 *   3. كشف انعكاس المقاطع الحرفية: يُقارن الإيميل بلقطة معتمدة من الإيميلات
 *      المدققة (scripts/known-emails.json). الإيميل الموجود في اللقطة يمرّ فورًا.
 *      الإيميل الجديد يُرفض إذا:
 *        أ. كانت صورته المعكوسة (عكس ترتيب المقاطع) موجودة في اللقطة، أو
 *        ب. بدأ بمقطع لا يظهر في اللقطة إلا في نهاية الإيميلات، وانتهى بمقطع
 *           لا يظهر إلا في بدايتها (نمط الانعكاس الكلاسيكي).
 *
 * الاستخدام:
 *   node scripts/check-emails.mjs [path/to/index.html]
 *   node scripts/check-emails.mjs --update-known   (لتحديث اللقطة بعد تدقيق يدوي)
 *   node scripts/check-emails.mjs --self-test      (اختبارات ثابتة للكاشف نفسه)
 *   node scripts/check-emails.mjs --sync           (توليد src/data/entities.json من DATA في index.html)
 *
 * المصدر الوحيد للبيانات هو `const DATA` في index.html (الواجهة المعروضة فعليًا).
 * ملف src/data/entities.json نسخة مولَّدة منه لسكافولد React، ويفشل الفحص إذا
 * اختلفت النسختان — عدِّل index.html ثم شغّل --sync.
 * يخرج بكود 1 مع قائمة الإيميلات المرفوضة إن وُجدت مخالفات.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const knownPath = join(root, "scripts", "known-emails.json");

const entitiesJsonPath = join(root, "src", "data", "entities.json");

const args = process.argv.slice(2);
const updateKnown = args.includes("--update-known");
const selfTest = args.includes("--self-test");
const sync = args.includes("--sync");
const target = args.find((a) => !a.startsWith("--")) ?? join(root, "index.html");

function loadData(htmlPath) {
  const html = readFileSync(htmlPath, "utf8");
  const match = html.match(/const DATA = (\[.*?\]);/s);
  if (!match) throw new Error("لم يتم العثور على `const DATA = [...]` في " + htmlPath);
  return JSON.parse(match[1]);
}

function loadKnown() {
  if (!existsSync(knownPath)) return new Set();
  return new Set(JSON.parse(readFileSync(knownPath, "utf8")).map((e) => e.toUpperCase()));
}

/** يبني مواقع المقاطع من اللقطة المعتمدة: أين يظهر كل مقطع (بداية/نهاية/وسط). */
function buildSegmentPositions(knownSet) {
  const first = new Set();
  const last = new Set();
  const any = new Set();
  for (const email of knownSet) {
    const local = email.split("@")[0];
    const segs = local.split("-").filter(Boolean);
    if (segs.length === 0) continue;
    first.add(segs[0]);
    last.add(segs[segs.length - 1]);
    for (const s of segs) any.add(s);
  }
  return { first, last, any };
}

function reversedForm(email) {
  const [local, domain] = email.split("@");
  return local.split("-").reverse().join("-") + "@" + domain;
}

/**
 * يفحص إيميلًا واحدًا. يعيد رسالة الخطأ أو null.
 * knownSet/pos اختياريان (يُتجاوز فحص الانعكاس الحرفي بدونهما).
 */
export function checkEmail(email, knownSet, pos) {
  const upper = email.toUpperCase();

  // 1) الصيغة العامة: @ واحدة، لا شيء بعد النطاق، أحرف مسموحة فقط
  const m = /^([A-Za-z0-9._-]+)@([A-Za-z0-9.-]+)$/.exec(email);
  if (!m) return `صيغة غير صالحة أو أحرف غريبة أو مقطع بعد النطاق`;
  const [, local, domain] = m;
  if (!/\.GOV\.SA$/i.test(domain))
    return `النطاق لا ينتهي بـ .GOV.SA (قد يكون مقطع انتقل بعد النطاق)`;

  const segs = local.toUpperCase().split("-");

  // 2) مقاطع رقمية البداية مختلطة = انعكاس bidi
  for (const seg of segs) {
    if (seg === "") return `مقطع فارغ (شرطة مكررة/طرفية)`;
    if (/^[0-9]/.test(seg) && /[A-Z]/.test(seg))
      return `المقطع "${seg}" يبدأ برقم — الأرقام تأتي في نهاية المقطع باتفاقية الوزارة`;
  }

  // 3) كشف انعكاس المقاطع الحرفية عبر اللقطة المعتمدة
  if (knownSet && knownSet.size > 0 && segs.length >= 2) {
    if (knownSet.has(upper)) return null; // إيميل مدقق مسبقًا

    // أ) صورته المعكوسة إيميل معتمد → الأرجح أنه انعكس
    if (knownSet.has(reversedForm(upper)))
      return `ترتيب المقاطع معكوس — الصيغة الصحيحة المعتمدة هي "${reversedForm(upper)}"`;

    // ب) يبدأ بمقطع لا يظهر إلا نهايةً وينتهي بمقطع لا يظهر إلا بدايةً
    const firstSeg = segs[0];
    const lastSeg = segs[segs.length - 1];
    const firstIsTailOnly = pos.last.has(firstSeg) && !pos.first.has(firstSeg);
    const lastIsHeadOnly = pos.first.has(lastSeg) && !pos.last.has(lastSeg);
    if (firstIsTailOnly && lastIsHeadOnly)
      return `نمط انعكاس محتمل: يبدأ بـ "${firstSeg}" (يَرِد نهايةً فقط في الإيميلات المعتمدة) وينتهي بـ "${lastSeg}" (يَرِد بدايةً فقط) — تأكد من الترتيب الأصلي في المصدر`;
  }

  return null;
}

/**
 * أزواج معتمدة من الإيميلات المتناظرة المقاطع (anagram) وهي جهات حقيقية مختلفة
 * موثقة جنبًا إلى جنب في مصادر PDF — لا تُعد تكرارًا معكوس المقاطع.
 * القائمة أزواج إيميلات كاملة عمدًا (لا بادئات) حتى لا يمرّ أي زوج جديد
 * بنفس البادئات دون تدقيق (مثل HBAT-GEN-ICC3 مقابل GEN-HBAT-ICC3):
 *   - أوقاف القطيف: QAT-AW-MA-* (هيئة التدقيق) مقابل AW-MA-QAT-* (الدائرة القضائية)
 *   - حفر الباطن: HBAT-GEN-ICC1/2 (دوائر التنفيذ) مقابل GEN-HBAT-ICC1/2 (الدوائر الجزائية)
 */
export const ANAGRAM_EXCEPTIONS = [
  ["QAT-AW-MA-JC2@MOJ.GOV.SA", "AW-MA-QAT-JC2@MOJ.GOV.SA"],
  ["QAT-AW-MA-PC@MOJ.GOV.SA", "AW-MA-QAT-PC@MOJ.GOV.SA"],
  ["HBAT-GEN-ICC1@MOJ.GOV.SA", "GEN-HBAT-ICC1@MOJ.GOV.SA"],
  ["HBAT-GEN-ICC2@MOJ.GOV.SA", "GEN-HBAT-ICC2@MOJ.GOV.SA"],
];

function segmentMultisetKey(email) {
  const [local, domain] = email.toUpperCase().split("@");
  if (!domain) return null;
  const segs = local.split("-").filter(Boolean);
  if (segs.length < 2) return null;
  return [...segs].sort().join("-") + "@" + domain;
}

function isApprovedAnagramPair(a, b) {
  const ua = a.toUpperCase();
  const ub = b.toUpperCase();
  return ANAGRAM_EXCEPTIONS.some(
    ([x, y]) => (ua === x && ub === y) || (ua === y && ub === x),
  );
}

/**
 * يكشف أزواج الإيميلات المختلفة في DATA التي تتشارك مجموعة المقاطع نفسها
 * (multiset) — نمط انعكاس المقاطع الذي أنتج سلاسل مكررة مثل JED-SUM-JC*
 * مقابل SUM-JED-JC*. يعيد قائمة { key, emails } للأزواج غير المعتمدة.
 */
export function findSegmentAnagramDuplicates(data) {
  const byKey = new Map();
  for (const e of data) {
    if (!e.email) continue;
    const em = e.email.toUpperCase();
    const key = segmentMultisetKey(em);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key).add(em);
  }
  const results = [];
  for (const [key, set] of byKey) {
    if (set.size < 2) continue;
    const emails = [...set];
    // مجموعة كاملة معتمدة فقط إذا كان كل زوج فيها معتمدًا
    const allApproved = emails.every((a, i) =>
      emails.every((b, j) => i === j || isApprovedAnagramPair(a, b)),
    );
    if (!allApproved) results.push({ key, emails });
  }
  return results;
}

/**
 * يكشف السجلات المكررة (نفس المنطقة + التصنيف + الاسم) والإيميلات المشتركة
 * بين جهات مختلفة. يعيد { duplicates: [...], sharedEmails: [...] }.
 */
export function findDuplicates(data) {
  const byKey = new Map();
  data.forEach((e, i) => {
    const key = [e.region ?? "", e.category ?? "", e.name ?? ""].join("|");
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(i);
  });
  const duplicates = [];
  for (const [key, idxs] of byKey) {
    if (idxs.length > 1)
      duplicates.push({ key, indices: idxs, count: idxs.length });
  }

  const byEmail = new Map();
  data.forEach((e, i) => {
    if (!e.email) return;
    const em = e.email.toUpperCase();
    if (!byEmail.has(em)) byEmail.set(em, []);
    byEmail.get(em).push(i);
  });
  const sharedEmails = [];
  for (const [email, idxs] of byEmail) {
    const keys = new Set(
      idxs.map((i) => [data[i].region ?? "", data[i].category ?? "", data[i].name ?? ""].join("|")),
    );
    if (keys.size > 1) sharedEmails.push({ email, indices: idxs, keys: [...keys] });
  }
  return { duplicates, sharedEmails };
}

function runSelfTest(knownSet, pos) {
  const cases = [
    // [email, يجب أن يُرفض؟]
    ["TOUTHEEQ@MOJ.GOV.SA", false],
    ["GEN-RYD-LD9@MOJ.GOV.SA", false], // صيغة سليمة معتمدة
    ["9LD-RYD-GEN@MOJ.GOV.SA", true], // انعكاس رقمي
    ["RYD@MOJ.GOV.SA-KIT1", true], // مقطع بعد النطاق
    ["GEN-MECKJC-32@MOJ.GOV.SA", false], // رقم دائرة نهائي مسموح
    ["INFO@BIP.GOV.SA", false], // جهة حكومية أخرى
    ["EXAMPLE@GMAIL.COM", true], // خارج .GOV.SA
  ];
  // انعكاس حرفي: نبني حالة من اللقطة نفسها (أول إيميل متعدد المقاطع)
  const sample = [...knownSet].find((e) => e.split("@")[0].includes("-"));
  if (sample) {
    const rev = reversedForm(sample);
    if (rev !== sample) cases.push([rev, true]); // معكوس إيميل معتمد → يُرفض
    cases.push([sample, false]); // المعتمد نفسه → يمرّ
  }
  let failed = 0;
  for (const [email, shouldFail] of cases) {
    const err = checkEmail(email, knownSet, pos);
    const rejected = err !== null;
    if (rejected !== shouldFail) {
      failed++;
      console.error(`  ✗ self-test: "${email}" → ${rejected ? "رُفض" : "مرّ"} والمتوقع ${shouldFail ? "الرفض" : "المرور"}${err ? ` (${err})` : ""}`);
    }
  }
  if (failed) {
    console.error(`فشل ${failed} من اختبارات الكاشف الذاتية.`);
    process.exit(1);
  }

  // اختبار كاشف التكرار
  const dupSample = [
    { region: "ر", category: "ت", name: "جهة أ", email: "A-B@MOJ.GOV.SA" },
    { region: "ر", category: "ت", name: "جهة أ", email: "A-B@MOJ.GOV.SA" }, // مكرر تمامًا
    { region: "ر", category: "ت", name: "جهة ب", email: "A-B@MOJ.GOV.SA" }, // إيميل مشترك
    { region: "ر", category: "ت", name: "جهة ج", email: "C-D@MOJ.GOV.SA" },
  ];
  const { duplicates, sharedEmails } = findDuplicates(dupSample);
  let dupFailed = 0;
  if (duplicates.length !== 1 || duplicates[0].count !== 2) {
    dupFailed++;
    console.error(`  ✗ self-test: كاشف التكرار لم يرصد السجل المكرر (${JSON.stringify(duplicates)})`);
  }
  if (sharedEmails.length !== 1 || sharedEmails[0].email !== "A-B@MOJ.GOV.SA") {
    dupFailed++;
    console.error(`  ✗ self-test: كاشف الإيميل المشترك لم يرصد الحالة (${JSON.stringify(sharedEmails)})`);
  }
  if (findDuplicates([dupSample[2], dupSample[3]]).duplicates.length !== 0) {
    dupFailed++;
    console.error(`  ✗ self-test: كاشف التكرار أصدر إنذارًا كاذبًا`);
  }
  if (dupFailed) {
    console.error(`فشل ${dupFailed} من اختبارات كاشف التكرار.`);
    process.exit(1);
  }

  // اختبار كاشف تناظر المقاطع (anagram)
  let anaFailed = 0;
  const anaCases = [
    // زوج معكوس المقاطع → يُرصد
    {
      data: [
        { email: "JED-SUM-JC1@MOJ.GOV.SA" },
        { email: "SUM-JED-JC1@MOJ.GOV.SA" },
      ],
      expect: 1,
      label: "زوج معكوس المقاطع",
    },
    // زوج القطيف المعتمد → يمرّ
    {
      data: [
        { email: "QAT-AW-MA-JC2@MOJ.GOV.SA" },
        { email: "AW-MA-QAT-JC2@MOJ.GOV.SA" },
      ],
      expect: 0,
      label: "استثناء القطيف المعتمد",
    },
    // زوج حفر الباطن المعتمد → يمرّ
    {
      data: [
        { email: "HBAT-GEN-ICC1@MOJ.GOV.SA" },
        { email: "GEN-HBAT-ICC1@MOJ.GOV.SA" },
      ],
      expect: 0,
      label: "استثناء حفر الباطن المعتمد",
    },
    // ICC3 خارج الاستثناء الموثق (ICC1/2 فقط) → يُرصد
    {
      data: [
        { email: "HBAT-GEN-ICC3@MOJ.GOV.SA" },
        { email: "GEN-HBAT-ICC3@MOJ.GOV.SA" },
      ],
      expect: 1,
      label: "لاحقة خارج الاستثناء الموثق تُرفض",
    },
    // إيميلان مختلفا المقاطع → لا إنذار كاذب
    {
      data: [
        { email: "GEN-RYD-LD9@MOJ.GOV.SA" },
        { email: "GEN-JED-LD9@MOJ.GOV.SA" },
      ],
      expect: 0,
      label: "لا إنذار كاذب لمقاطع مختلفة",
    },
    // الإيميل نفسه مكرر (جهتان تتشاركان البريد) → ليس تناظرًا
    {
      data: [
        { email: "A-B@MOJ.GOV.SA" },
        { email: "A-B@MOJ.GOV.SA" },
      ],
      expect: 0,
      label: "الإيميل المتطابق ليس تناظرًا",
    },
    // نطاقان مختلفان بنفس المقاطع → لا يُرصد
    {
      data: [
        { email: "A-B@MOJ.GOV.SA" },
        { email: "B-A@SCJ.GOV.SA" },
      ],
      expect: 0,
      label: "النطاق المختلف يفصل بين الإيميلين",
    },
  ];
  for (const c of anaCases) {
    const found = findSegmentAnagramDuplicates(c.data);
    if (found.length !== c.expect) {
      anaFailed++;
      console.error(`  ✗ self-test: كاشف تناظر المقاطع — ${c.label}: وجد ${found.length} والمتوقع ${c.expect} (${JSON.stringify(found)})`);
    }
  }
  if (anaFailed) {
    console.error(`فشل ${anaFailed} من اختبارات كاشف تناظر المقاطع.`);
    process.exit(1);
  }
  console.log(`✓ اختبارات الكاشف الذاتية ناجحة (${cases.length + 3 + anaCases.length} حالة).`);
}

/** يقارن نسخة entities.json المولَّدة بالمصدر (DATA). يعيد قائمة اختلافات. */
export function diffEntities(data, jsonData) {
  const diffs = [];
  if (!Array.isArray(jsonData)) return ["src/data/entities.json ليس مصفوفة"];
  if (jsonData.length !== data.length)
    diffs.push(`عدد السجلات مختلف: index.html فيه ${data.length} و entities.json فيه ${jsonData.length}`);
  const n = Math.min(data.length, jsonData.length);
  for (let i = 0; i < n; i++) {
    for (const f of ["region", "category", "name", "email"]) {
      const a = data[i][f] ?? null;
      const b = jsonData[i][f] ?? null;
      if (a !== b) diffs.push(`السجل #${i + 1} حقل ${f}: index.html="${a}" مقابل entities.json="${b}"`);
    }
  }
  return diffs;
}

function serializeEntities(data) {
  return JSON.stringify(
    data.map((e, i) => ({
      id: i + 1,
      region: e.region ?? null,
      category: e.category ?? null,
      name: e.name ?? null,
      email: e.email ?? null,
    })),
    null,
    2,
  ) + "\n";
}

// ---- main ----
const data = loadData(target);

if (sync) {
  writeFileSync(entitiesJsonPath, serializeEntities(data));
  console.log(`✓ وُلِّد src/data/entities.json من DATA في index.html (${data.length} سجل).`);
  process.exit(0);
}

if (updateKnown) {
  const emails = [...new Set(data.map((e) => (e.email ?? "").toUpperCase()).filter(Boolean))].sort();
  writeFileSync(knownPath, JSON.stringify(emails, null, 1) + "\n");
  console.log(`✓ حُدّثت اللقطة المعتمدة: ${emails.length} إيميل في scripts/known-emails.json`);
  process.exit(0);
}

const knownSet = loadKnown();
if (knownSet.size === 0) {
  console.error("تحذير: scripts/known-emails.json غير موجودة — فحص الانعكاس الحرفي معطّل. شغّل --update-known بعد تدقيق البيانات.");
}
const pos = buildSegmentPositions(knownSet);

if (selfTest) {
  runSelfTest(knownSet, pos);
  process.exit(0);
}

const errors = [];
for (const [i, entry] of data.entries()) {
  const email = entry.email;
  if (email == null || email === "") continue; // جهات بلا إيميل مسموحة
  const err = checkEmail(email, knownSet, pos);
  if (err) errors.push(`#${i + 1} — ${entry.name ?? "?"} (${entry.region ?? "?"}): ${err} → "${email}"`);
}

// كشف التكرارات: السجل المكرر تمامًا (منطقة+تصنيف+اسم) يُفشل الفحص،
// والإيميل المشترك بين جهات مختلفة يصدر تحذيرًا فقط (قد يكون مقصودًا).
const { duplicates, sharedEmails } = findDuplicates(data);
for (const d of duplicates) {
  const [region, category, name] = d.key.split("|");
  errors.push(`سجل مكرر ${d.count} مرات (الفهارس ${d.indices.map((i) => i + 1).join("، ")}): ${name} — ${category} — ${region}`);
}
// كشف الإيميلات متناظرة المقاطع (anagram) — نمط الانعكاس الذي أنتج سلاسل مكررة
const anagramDups = findSegmentAnagramDuplicates(data);
for (const a of anagramDups) {
  errors.push(
    `إيميلان بنفس مجموعة المقاطع (تكرار معكوس محتمل): ${a.emails.join(" ↔ ")} — إن كانا جهتين حقيقيتين مختلفتين أضِف الزوج إلى ANAGRAM_EXCEPTIONS في scripts/check-emails.mjs`,
  );
}
// توحيد النسختين: entities.json يجب أن يطابق DATA في index.html
if (existsSync(entitiesJsonPath)) {
  const jsonData = JSON.parse(readFileSync(entitiesJsonPath, "utf8"));
  const diffs = diffEntities(data, jsonData);
  if (diffs.length > 0) {
    const shown = diffs.slice(0, 20);
    errors.push(
      `src/data/entities.json غير متطابق مع DATA في index.html (${diffs.length} اختلاف) — شغّل: node scripts/check-emails.mjs --sync\n    ` +
        shown.join("\n    "),
    );
  }
}

if (sharedEmails.length > 0) {
  console.warn(`تحذير: ${sharedEmails.length} إيميلًا مشتركًا بين جهات مختلفة (لا يُفشل الفحص):`);
  for (const s of sharedEmails)
    console.warn(`  ⚠ ${s.email} ← ${s.keys.map((k) => k.split("|")[2]).join(" / ")}`);
}

if (errors.length > 0) {
  console.error(`فشل الفحص: ${errors.length} إيميل مخالف من أصل ${data.length} سجل:\n`);
  for (const e of errors) console.error("  ✗ " + e);
  console.error("\nراجع الإيميلات أعلاه — الأرجح أنها منسوخة من PDF عربي وانعكست مقاطعها. بعد التدقيق اليدوي لأي إيميل جديد صحيح، شغّل: node scripts/check-emails.mjs --update-known");
  process.exit(1);
}
console.log(`✓ الفحص ناجح: ${data.length} سجل، جميع الإيميلات سليمة الصيغة والترتيب.`);
