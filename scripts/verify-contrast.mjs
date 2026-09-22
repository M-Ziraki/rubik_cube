#!/usr/bin/env node
/**
 * Text contrast, measured rather than eyeballed, in every combination the
 * application ships in.
 *
 * Written because a review by eye had missed roughly 160 failures per page in
 * both themes: `--ink-faint` on paper was 3.16:1 against a 4.5:1 requirement,
 * and it carried every card note, every eyebrow and every table header in the
 * product. One token, wrong, in about nineteen hundred places.
 *
 * For each of light/dark x desktop/tablet/mobile x English/Persian it walks
 * every element with its own text, finds the nearest painted background,
 * computes the WCAG 2.2 contrast ratio and reports anything under the
 * threshold for its size. It also reports horizontal overflow, because the
 * same loop is already visiting every page.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npm run verify:contrast
 */
import { chromium } from 'playwright';
const BASE='http://127.0.0.1:4173/';
const routes=['atlas','course','lab','graph','solver','scan','training','ai-lab','settings'];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let total = 0;
let overflowPages = 0;

// Relative luminance / contrast, so "is this readable" is a number.
const CONTRAST = `(() => {
  const lum = (c) => {
    // Chromium reports color-mix() results as color(srgb r g b / a) with
    // 0-1 channels, and everything else as rgb() with 0-255 ones.
    const srgb = /^color\\(srgb/.test(c);
    const m = c.match(/[\\d.]+/g).map(Number);
    const f = m.slice(0,3).map(v => { v = srgb ? v : v/255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*f[0] + 0.7152*f[1] + 0.0722*f[2];
  };
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(bg)) return bg;
    }
    return 'rgb(255,255,255)';
  };
  const bad = [];
  for (const el of document.querySelectorAll('p,span,div,button,a,td,th,li,h1,h2,h3,h4,strong,label,summary')) {
    if (!el.childNodes.length) continue;
    const text = [...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join('');
    if (text.length < 2) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || parseFloat(s.opacity) < 0.6) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const size = parseFloat(s.fontSize);
    const bold = parseInt(s.fontWeight,10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    const a = lum(s.color), c = lum(bgOf(el));
    const ratio = (Math.max(a,c)+0.05)/(Math.min(a,c)+0.05);
    if (ratio < need) bad.push({ t: text.slice(0,28), ratio: +ratio.toFixed(2), need, size, cls: (el.className||'').toString().slice(0,26) });
  }
  return bad;
})()`;

for (const theme of ['light','dark']) {
  for (const [w,h,vp] of [[1440,1000,'desktop'],[834,1112,'tablet'],[390,844,'mobile']]) {
    for (const lang of ['en','fa']) {
      const ctx = await b.newContext({ viewport:{width:w,height:h} });
      await ctx.addInitScript(([t,l])=>{ try{
        localStorage.setItem('cube-atlas.lang.v1', l);
        localStorage.setItem('cube-atlas.welcome.v1','1');
        localStorage.setItem('cube-atlas.prefs.v1', JSON.stringify({turnSpeed:900, theme:t}));
      }catch{} }, [theme,lang]);
      const p = await ctx.newPage();
      const errs=[];
      p.on('console',m=>{ if(m.type()==='error' && !/CERT_AUTHORITY|Failed to load resource/.test(m.text())) errs.push(m.text()); });
      p.on('pageerror',e=>errs.push('pageerror: '+e.message));
      const rows=[];
      for (const r of routes) {
        await p.goto(BASE+'#/'+r); await p.waitForTimeout(vp==='desktop'?1300:1000);
        const m = await p.evaluate(`(() => { const bad = ${CONTRAST}; const de=document.documentElement;
          return { overflow: Math.max(0, de.scrollWidth-de.clientWidth), contrast: bad.slice(0,6), contrastN: bad.length }; })()`);
        if (m.overflow>1 || m.contrastN) rows.push({r, ...m});
      }
      const failures = rows.reduce((n, r) => n + r.contrastN, 0);
      const overflowing = rows.filter((r) => r.overflow > 1).map((r) => r.r);
      total += failures;
      overflowPages += overflowing.length;
      console.log(
        `${theme}/${vp}/${lang}: ` + (rows.length
          ? `${failures} contrast failures` + (overflowing.length ? `, overflow on ${overflowing.join(', ')}` : '')
            + ' :: ' + JSON.stringify(rows.flatMap((r) => r.contrast).slice(0, 4))
          : 'clean')
        + (errs.length ? '  ERR ' + errs[0] : ''),
      );
      await ctx.close();
    }
  }
}
await b.close();
console.log(`\ntotal: ${total} contrast failures, ${overflowPages} pages with overflow`);
process.exit(total === 0 && overflowPages === 0 ? 0 : 1);
