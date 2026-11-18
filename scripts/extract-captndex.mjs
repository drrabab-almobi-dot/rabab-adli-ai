#!/usr/bin/env node
/**
 * extract-captndex.mjs — استخراج خريطة email→أسماء من نص كابتندكس v2
 *
 * يقرأ ملف نص مستخرج من PDF (بـ pdftotext) ويبني:
 *   scripts/captndex-v2-names.json
 *
 * الاستخدام:
 *   node scripts/extract-captndex.mjs /path/to/captndex.txt
 *
 * ملاحظة: النص المستخرج من PDF يحتوي على تشويه bidi وأحرف التحكم؛ يعالجها
 * هذا السكريبت تلقائيًا قبل التخزين.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const pdfTextPath = process.argv[2];
if (!pdfTextPath) {
  console.error('الاستخدام: node scripts/extract-captndex.mjs /path/to/captndex.txt');
  process.exit(1);
}

const CTRL = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u00ad]/g;
const clean = (s) => s.replace(CTRL, '').trim();

/** تطبيع البريد */
function normEmail(e) {
  return clean(e).toLowerCase();
}

/** تصحيح عكس بيدي KIT1/KIT2 */
function fixBidiEmail(e) {
  let m = /^(.+)@(moj\.gov\.sa)-(KIT[12][NESW]?)$/i.exec(e);
  if (m) return `${m[3]}-${m[1]}@${m[2]}`;
  m = /^([A-Za-z0-9]+)@(moj\.gov\.sa)-(KIT[12])$/i.exec(e);
  if (m) return `${m[3]}-${m[1]}@${m[2]}`;
  return e;
}

const EMAIL_RE = /[A-Za-z0-9._+%-]+@(?:moj|bog|bip|scj|sba)\.gov\.sa(?:-KIT[12][NESW]?)?/gi;

const text = readFileSync(pdfTextPath, 'utf8');
const lines = text.split('\n').map(clean);

const map = {}; // email_norm → Set<name>

for (let i = 0; i < lines.length; i++) {
  const emails = lines[i].match(EMAIL_RE);
  if (!emails) continue;

  // ابحث عن الاسم العربي في السطور السابقة (حتى 4 سطور)
  let name = null;
  for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
    const candidate = lines[j];
    if (!candidate) continue;
    const arabicCount = (candidate.match(/[\u0600-\u06FF]/g) || []).length;
    if (arabicCount >= 3) {
      name = candidate;
      break;
    }
  }

  for (const raw of emails) {
    const fixed = fixBidiEmail(raw);
    const norm = normEmail(fixed);
    if (!map[norm]) map[norm] = new Set();
    if (name) map[norm].add(name);
  }
}

// تحويل Set إلى مصفوفة
const out = {};
for (const [k, v] of Object.entries(map)) {
  out[k] = [...v];
}

const outPath = join(__dirname, 'captndex-v2-names.json');
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`✓ استُخرجت ${Object.keys(out).length} إيميل → أسماء من PDF`);
console.log(`  الملف: scripts/captndex-v2-names.json`);
