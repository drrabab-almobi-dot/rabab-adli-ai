import { useState, useMemo, useRef, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import entitiesData from './data/entities.json';
import { entitySlug } from './lib/slug';

const queryClient = new QueryClient();
const PAGE_SIZE = 40;

const REGIONS = ["المنطقة الشرقية","منطقة الباحة","منطقة الجوف","منطقة الحدود الشمالية","منطقة الرياض","منطقة القصيم","منطقة المدينة المنورة","منطقة تبوك","منطقة جازان","منطقة حائل","منطقة عسير","منطقة مكة المكرمة","منطقة نجران","غير مصنف"];
const CATEGORIES = ["الإدارات والوكالات","الدوائر الجزائية","الدوائر الحقوقية","الدوائر القضائية","الدوائر النهائية","المحاكم التجارية","المحاكم الجزائية","المحاكم العامة","المحاكم العمالية","المحكمة الإدارية","المكاتب القضائية","النيابة العامة","الهيئة السعودية للمحامين","دوائر الأحوال الشخصية","دوائر الاستئناف","دوائر التنفيذ","رؤساء الدوائر","رؤساء المحاكم","قيادات الوزارة","كتابات العدل","محاكم الأحوال الشخصية","محاكم الاستئناف","محاكم التنفيذ","مساعدو الرئيس","أخرى"];

const thankMsgs: Record<number, string> = {
  1: 'شكرًا على ملاحظاتك، سنعمل على التحسين 🙏',
  2: 'شكرًا لتقييمك، سنسعى لتقديم الأفضل 🙏',
  3: 'شكرًا لتقييمك 🙏',
  4: 'شكرًا لك! يسعدنا إعجابك بالخدمة ✨',
  5: 'شكرًا جزيلاً! تقييمك يحفزنا على الاستمرار ⭐',
};

function normalize(s: string) {
  return s.toLowerCase().replace(/[\u064B-\u065F]/g, '').replace(/[أإآا]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
}

function Home() {
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [thanks, setThanks] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    return (entitiesData as any[]).filter(e => {
      if (region && e.region !== region) return false;
      if (category && e.category !== category) return false;
      if (q) {
        const hay = normalize(e.name) + ' ' + normalize(e.email) + ' ' + normalize(e.region) + ' ' + normalize(e.category);
        if (!hay.includes(normalize(q))) return false;
      }
      return true;
    });
  }, [q, region, category]);

  const shown = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = shown.length < filtered.length;

  useEffect(() => { setPage(1); }, [q, region, category]);

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email).then(() => {
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 2000);
    });
  };

  const reset = () => { setQ(''); setRegion(''); setCategory(''); if (inputRef.current) inputRef.current.value = ''; };

  const styles: Record<string, React.CSSProperties> = {
    circuitBg: {
      position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
      opacity: .35,
      backgroundImage: 'linear-gradient(rgba(58,166,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(58,166,255,.05) 1px, transparent 1px)',
      backgroundSize: '42px 42px',
      maskImage: 'radial-gradient(1200px 700px at 80% 0%, black, transparent 70%)',
    },
    wrap: { position: 'relative', zIndex: 1, maxWidth: 1180, margin: '0 auto', padding: '0 20px 80px' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '22px 0 18px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' as const },
    brand: { display: 'flex', alignItems: 'center', gap: 12 },
    brandMain: { fontFamily: 'var(--display)', fontWeight: 800, fontSize: 17, color: 'var(--gold)', letterSpacing: '.2px' },
    brandSub: { fontSize: 14, color: 'var(--gold-soft)', fontWeight: 600, letterSpacing: '.5px' },
    badgeAi: { fontFamily: 'var(--body)', fontWeight: 700, fontSize: 14, color: 'var(--azure)', border: '1px solid rgba(58,166,255,.4)', padding: '5px 12px', borderRadius: 999, background: 'rgba(58,166,255,.08)', whiteSpace: 'nowrap' as const },
    hero: { padding: '46px 0 20px', textAlign: 'center' as const },
    eyebrow: { display: 'inline-block', fontFamily: 'var(--body)', fontWeight: 700, fontSize: 13, color: 'var(--gold-soft)', letterSpacing: '.5px', marginBottom: 14, border: '1px solid rgba(217,169,78,.35)', padding: '6px 16px', borderRadius: 999, background: 'rgba(217,169,78,.06)' },
    h1: { fontFamily: 'var(--display)', fontWeight: 800, fontSize: 'clamp(28px, 4vw, 42px)', margin: '0 0 12px', color: 'var(--text)' },
    heroP: { color: 'var(--text)', maxWidth: 640, margin: '0 auto', fontSize: 17.5 },
    supervision: { color: 'var(--gold-soft)', fontSize: 15.5, fontWeight: 600, marginTop: 8 },
    searchShell: { position: 'relative' as const, maxWidth: 720, margin: '32px auto 0', borderRadius: 999, padding: 2, background: 'linear-gradient(90deg, var(--azure), var(--gold), var(--azure))', backgroundSize: '200% 100%', animation: 'sweep 6s linear infinite' },
    searchInner: { background: 'var(--panel)', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px' },
    searchInput: { flex: 1, background: 'transparent', border: 0, outline: 'none', color: 'var(--text)', fontFamily: 'var(--body)', fontSize: 16 },
    clearBtn: { background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--muted)', borderRadius: 999, width: 28, height: 28, cursor: 'pointer', fontSize: 14, lineHeight: 1 },
    stats: { display: 'flex', justifyContent: 'center', gap: 28, margin: '22px 0 6px', flexWrap: 'wrap' as const },
    stat: { textAlign: 'center' as const },
    statB: { display: 'block', fontSize: 22, color: 'var(--azure)', fontFamily: 'var(--mono)' },
    statSpan: { fontSize: 12, color: 'var(--gold-soft)', fontFamily: 'var(--body)' },
    filters: { display: 'flex', gap: 12, flexWrap: 'wrap' as const, justifyContent: 'center', margin: '26px 0 8px' },
    select: { background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: 10, fontFamily: 'var(--body)', fontSize: 14, cursor: 'pointer' },
    resetBtn: { background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--line)', padding: '10px 14px', borderRadius: 10, fontFamily: 'var(--body)', fontSize: 14, cursor: 'pointer' },
    resultsHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '30px 0 14px', color: 'var(--muted)', fontSize: 13 },
    results: { display: 'flex', flexDirection: 'column' as const, gap: 10 },
    card: { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const, transition: 'border-color .15s' },
    cardName: { fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6, lineHeight: 1.5 },
    tags: { display: 'flex', gap: 8, flexWrap: 'wrap' as const },
    tag: { fontSize: 11, padding: '3px 10px', borderRadius: 999, border: '1px solid var(--line)', color: 'var(--muted)' },
    tagRegion: { fontSize: 11, padding: '3px 10px', borderRadius: 999, border: '1px solid rgba(217,169,78,.3)', color: 'var(--gold-soft)' },
    tagCategory: { fontSize: 11, padding: '3px 10px', borderRadius: 999, border: '1px solid rgba(58,166,255,.3)', color: 'var(--azure)' },
    emailBox: { display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' },
    email: { direction: 'ltr', fontFamily: 'var(--mono)', fontSize: 13.5, color: 'var(--text)', background: 'var(--panel-2)', border: '1px solid var(--line)', padding: '8px 12px', borderRadius: 8, whiteSpace: 'nowrap' as const },
    copyBtn: { background: 'var(--gold)', color: '#1A1204', border: 0, borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--body)', whiteSpace: 'nowrap' as const },
    copyBtnCopied: { background: '#3CCB7F', color: '#06111F', border: 0, borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--body)', whiteSpace: 'nowrap' as const },
    empty: { textAlign: 'center' as const, color: 'var(--muted)', padding: '60px 20px' },
    loadMore: { display: 'block', margin: '22px auto 0', background: 'var(--panel)', color: 'var(--azure)', border: '1px dashed var(--azure-dim)', padding: '12px 26px', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--body)', fontWeight: 700 },
    disclaimer: { marginTop: 44, padding: '16px 18px', borderRadius: 'var(--radius)', background: 'rgba(224,102,102,.06)', border: '1px solid rgba(224,102,102,.25)', color: 'var(--text)', fontSize: 15.5, lineHeight: 1.8 },
    footer: { marginTop: 40, paddingTop: 22, borderTop: '1px solid var(--line)', textAlign: 'center' as const, color: 'var(--text)', fontSize: 15.5, lineHeight: 2 },
    footerBrandline: { color: 'var(--gold-soft)', fontWeight: 700, fontFamily: 'var(--display)', fontSize: 17 },
    footerLtr: { direction: 'ltr', display: 'inline-block', fontFamily: 'var(--mono)' },
    footerIcon: { color: 'var(--gold)', fontStyle: 'normal', marginLeft: 3 },
    footerCopyright: { marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)', fontSize: 12.5, color: 'var(--text)', lineHeight: 1.9 },
    likeCta: { marginTop: 18, textAlign: 'center' as const, color: 'var(--muted)', fontSize: 13 },
    rateLabel: { marginBottom: 10, color: 'var(--text)', fontSize: 16 },
    stars: { display: 'inline-flex', gap: 6, direction: 'ltr' },
    rateThanks: { marginTop: 10, fontSize: 13, color: 'var(--gold-soft)', minHeight: 18 },
    visitsBadge: { marginTop: 16, textAlign: 'center' as const, fontSize: 13, color: 'var(--muted)' },
    visitsLabel: { marginLeft: 8 },
  };

  return (
    <>
      <style>{`
        @keyframes sweep {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        select option { background: var(--panel); color: var(--text); }
        select:focus { outline: 2px solid var(--azure); outline-offset: 2px; }
        input:focus { outline: none; }
        .copy-btn-hover:hover { background: var(--gold-soft) !important; }
        .reset-btn-hover:hover { border-color: var(--azure-dim) !important; }
        .load-more-hover:hover { background: var(--panel-2) !important; }
        .card-hover:hover { border-color: var(--azure-dim) !important; }
        .star-hover:hover { transform: scale(1.15); }
      `}</style>

      <div style={styles.circuitBg} />

      <div style={styles.wrap}>
        {/* Header */}
        <header style={styles.header}>
          <div style={styles.brand}>
            <div style={styles.brand}>
              <svg width="56" height="56" viewBox="0 0 56 56" style={{ borderRadius: '50%', boxShadow: '0 0 0 2px var(--gold), 0 0 20px rgba(217,169,78,.55)', background: 'var(--panel-2)', flexShrink: 0 }}>
                <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fontSize="28" fill="var(--gold)">⚖</text>
              </svg>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={styles.brandMain}>دليل التواصل العدلي</span>
                <span style={styles.brandSub}>Rabab Adli AI</span>
              </div>
            </div>
          </div>
          <div style={styles.badgeAi}>رباب · عدلي · AI</div>
        </header>

        {/* Hero */}
        <section style={styles.hero}>
          <div style={styles.eyebrow}>دليل الجهات القضائية السعودية</div>
          <h1 style={styles.h1}>
            ابحث عن بريد <span style={{ color: 'var(--gold)' }}>أي جهة عدلية</span> في المملكة
          </h1>
          <p style={styles.heroP}>
            قاعدة بيانات شاملة لعناوين التواصل الرسمية للمحاكم وكتابات العدل والدوائر القضائية في جميع مناطق المملكة العربية السعودية.
          </p>
          <p style={styles.supervision}>المنصة تعمل تحت إشراف المحامية د. رباب أحمد المعبي</p>

          {/* Search */}
          <div style={styles.searchShell}>
            <div style={styles.searchInner}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" style={{ flexShrink: 0 }}>
                <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                ref={inputRef}
                type="text"
                placeholder="اكتب اسم المحكمة، المنطقة، أو نوع الجهة…"
                style={styles.searchInput}
                onChange={e => setQ(e.target.value)}
              />
              {q && (
                <button style={styles.clearBtn} onClick={() => { setQ(''); if (inputRef.current) inputRef.current.value = ''; }}>✕</button>
              )}
            </div>
          </div>
        </section>

        {/* Stats */}
        <div style={styles.stats}>
          <div style={styles.stat}>
            <b style={styles.statB}>{(entitiesData as any[]).length.toLocaleString('en-US')}</b>
            <span style={styles.statSpan}>إجمالي الجهات</span>
          </div>
          <div style={styles.stat}>
            <b style={styles.statB}>{REGIONS.length}</b>
            <span style={styles.statSpan}>المناطق</span>
          </div>
          <div style={styles.stat}>
            <b style={styles.statB}>{shown.length}</b>
            <span style={styles.statSpan}>المعروض حاليًا</span>
          </div>
        </div>

        {/* Filters */}
        <section style={styles.filters}>
          <select
            style={styles.select}
            value={region}
            onChange={e => setRegion(e.target.value)}
          >
            <option value="">كل المناطق</option>
            {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            style={styles.select}
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            <option value="">كل التصنيفات</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="reset-btn-hover" style={styles.resetBtn} onClick={reset}>إعادة تعيين</button>
        </section>

        {/* Results head */}
        <div style={styles.resultsHead}>
          <span>النتائج (<b style={{ color: 'var(--text)' }}>{filtered.length.toLocaleString('en-US')}</b>)</span>
          <span style={{ color: 'var(--muted)' }}>
            {region && <span style={{ marginLeft: 8, color: 'var(--gold-soft)' }}>{region}</span>}
            {category && <span style={{ marginLeft: 8, color: 'var(--azure)' }}>{category}</span>}
          </span>
        </div>

        {/* Cards */}
        {shown.length > 0 ? (
          <div style={styles.results}>
            {shown.map((e: any) => (
              <div key={e.id} className="card-hover" style={styles.card}>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <a
                    href={`${import.meta.env.BASE_URL}courts/${encodeURIComponent(entitySlug(e))}/`}
                    style={{ ...styles.cardName, display: 'block', color: 'inherit', textDecoration: 'none' }}
                    title={`صفحة ${e.name}`}
                  >{e.name}</a>
                  <div style={styles.tags}>
                    <span style={styles.tagRegion}>{e.region}</span>
                    <span style={styles.tagCategory}>{e.category}</span>
                    {e.phone && <span style={{ ...styles.tag, color: 'var(--gold)', direction: 'ltr' }}>{e.phone}</span>}
                  </div>
                </div>
                <div style={styles.emailBox}>
                  <span style={styles.email}>{e.email}</span>
                  {e.unverifiedEmail === e.email && (
                    <span
                      title="هذا الإيميل لم يُوثَّق في الملفات الرسمية المتاحة — تأكد قبل الاعتماد عليه"
                      style={{ background: 'rgba(224,102,102,.12)', color: '#E06666', border: '1px solid rgba(224,102,102,.45)', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'help' }}
                    >
                      غير مؤكد
                    </span>
                  )}
                  <button
                    className="copy-btn-hover"
                    style={copiedEmail === e.email ? styles.copyBtnCopied : styles.copyBtn}
                    onClick={() => copyEmail(e.email)}
                  >
                    {copiedEmail === e.email ? '✓ تم النسخ' : 'نسخ'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={styles.empty}>
            <b style={{ display: 'block', color: 'var(--text)', fontSize: 17, marginBottom: 8 }}>لا توجد نتائج مطابقة</b>
            جرّب كلمة أخرى أو أعد ضبط الفلاتر.
          </div>
        )}

        {/* Load More */}
        {hasMore && (
          <button className="load-more-hover" style={styles.loadMore} onClick={() => setPage(p => p + 1)}>
            عرض المزيد
          </button>
        )}

        {/* Disclaimer */}
        <div style={styles.disclaimer}>
          <b style={{ color: 'var(--gold)' }}>ملاحظة هامة:</b> نحن منصة مجتمعية تعمل بالذكاء الاصطناعي وتحت إشراف المحامية د. رباب أحمد المعبي لخدمة مهنة المحاماة والمختصين ونسعد بتقييم الخدمة.
        </div>

        {/* Rating */}
        <div style={styles.likeCta}>
          <div style={styles.rateLabel}>إن كانت هذه الخدمة مفيدة لك، يسعدنا تقييمها لمساعدتنا على تطويرها أكثر</div>
          <div style={styles.stars}>
            {[1, 2, 3, 4, 5].map(v => (
              <span
                key={v}
                className="star-hover"
                style={{
                  fontSize: 30, lineHeight: 1, cursor: 'pointer',
                  color: v <= (hovered || rating) ? 'var(--gold)' : 'var(--line)',
                  textShadow: v <= (hovered || rating) ? '0 0 12px rgba(217,169,78,.5)' : 'none',
                  transition: 'color .12s, transform .12s', display: 'inline-block',
                }}
                onMouseEnter={() => setHovered(v)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => { setRating(v); setThanks(thankMsgs[v]); }}
              >★</span>
            ))}
          </div>
          <div style={styles.rateThanks}>{thanks}</div>
        </div>

        {/* Visits */}
        <div style={styles.visitsBadge}>
          <span style={styles.visitsLabel}>عدد زوار المنصة</span>
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--azure)' }}>—</span>
        </div>

        {/* Footer */}
        <footer style={styles.footer}>
          <div style={styles.footerBrandline}>دليل التواصل العدلي — Rabab Adli AI</div>
          <div>بإشراف المحامية والمحكم التجاري د. رباب أحمد المعبي</div>
          <div style={styles.footerLtr}>
            <i style={styles.footerIcon}>☎</i> +966 50 464 7649 &nbsp;·&nbsp; <i style={styles.footerIcon}>☎</i> +966 57 077 3999
          </div>
          <div style={styles.footerLtr}>
            <i style={styles.footerIcon}>✉</i> rababmobilaw@gmail.com &nbsp;·&nbsp; <i style={styles.footerIcon}>◎</i> rabablawyer.sa
          </div>
          <div style={styles.footerCopyright}>
            © 2026 جميع الحقوق محفوظة<br />منصة مجتمعية التواصل العدلي — Rabab Adli AI
          </div>
        </footer>
      </div>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Home />
    </QueryClientProvider>
  );
}

export default App;
