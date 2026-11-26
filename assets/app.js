'use strict';
/* MATHEMATICAL CINEMA：ホワイエの「織機」、展示室、上映室 */
const ROOT = '';
const WORKS = window.WORKS || [];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s => document.querySelector(s);
function el(tag, cls, txt) { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; }
const fmt = s => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '';

/* ---------- ホワイエ：かけ算の係数 m を連続的に変えて、線の造形を変え続ける ----------
   円周を N 等分し、点 k と点 m·k（mod N）を結ぶ。m は 2→10→2 を約5分かけて往復する。
   形を動かしているのは係数そのもの（画像や補間ではない）。 */
const loom = (() => {
  const cv = $('#loom'), g = cv.getContext('2d'), N = 200;
  const mOut = $('#loom-m'), btn = $('.loom-toggle');
  let w = 0, h = 0, dpr = 1, t0 = performance.now(), elapsed = 0, running = !reduceMotion, visible = true, held = false, raf = 0;
  $('#loom-n').textContent = N;
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const mAt = s => 6 - 4 * Math.cos(2 * Math.PI * s / 300);
  function draw(m) {
    g.clearRect(0, 0, w, h);
    const narrow = w < 900;
    const cx = narrow ? w * .5 : w * .68, cy = narrow ? h * .36 : h * .5;
    const r = narrow ? Math.min(w * .44, h * .3) : Math.min(h * .4, w * .3);
    g.lineWidth = .7; g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < N; k++) {
      const a = 2 * Math.PI * k / N - Math.PI / 2, b = a * m + (m - 1) * Math.PI / 2;
      g.strokeStyle = k % 3 ? 'rgba(128,187,212,.30)' : 'rgba(226,193,139,.42)';
      g.beginPath();
      g.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
      g.lineTo(cx + r * Math.cos(b), cy + r * Math.sin(b));
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(221,193,143,.18)'; g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.stroke();
    mOut.textContent = m.toFixed(2);
  }
  function frame(now) {
    elapsed += (now - t0) / 1000; t0 = now;
    draw(mAt(elapsed));
    raf = requestAnimationFrame(frame);
  }
  function update() {
    cancelAnimationFrame(raf);
    if (running && visible && !held) { t0 = performance.now(); raf = requestAnimationFrame(frame); }
    else draw(mAt(elapsed));
    btn.textContent = running ? '動きを止める' : '動きを再生する';
    btn.setAttribute('aria-pressed', String(!running));
  }
  btn.addEventListener('click', () => { running = !running; update(); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; update(); }).observe(cv);
  addEventListener('resize', () => { size(); update(); });
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; update(); });
  size(); update();
  return { hold(v) { held = v; update(); } };
})();

/* ---------- 展示室 ---------- */
const rooms = $('#rooms');
WORKS.forEach((w, i) => {
  const no = String(i + 1).padStart(2, '0');
  const room = el('article', 'room reveal'); room.id = 'room-' + w.id;
  const frame = el('button', 'frame'); frame.type = 'button';
  frame.setAttribute('aria-label', `${w.title} を上映室で鑑賞する`);
  if (w.hasPoster) { const img = el('img'); img.src = ROOT + w.poster; img.alt = ''; img.loading = 'lazy'; frame.append(img); }
  else frame.append(el('span', 'pending', '素材準備中'));
  if (w.available) frame.append(el('span', 'play'));
  const plate = el('div', 'plate');
  plate.append(el('p', 'no', `ROOM ${no}`), el('h2', null, w.title), el('p', 'sub', w.subtitle));
  const dl = el('dl');
  [['算数', w.entry], ['数学', w.mathematics], ['上映', w.available ? fmt(w.duration) || '—' : '素材準備中']]
    .forEach(([k, v]) => dl.append(el('dt', null, k), el('dd', null, v)));
  plate.append(dl);
  const watch = el('button', 'watch', w.available ? '上映室へ  →' : '準備中'); watch.type = 'button';
  watch.disabled = !w.available; watch.setAttribute('aria-label', `${w.title} を上映室で鑑賞する`);
  plate.append(watch);
  [frame, watch].forEach(b => b.addEventListener('click', () => openTheater(w, i)));
  room.append(frame, plate);
  rooms.append(room);
});
if (reduceMotion || !('IntersectionObserver' in window)) document.querySelectorAll('.reveal').forEach(r => r.classList.add('in'));
else {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
  document.querySelectorAll('.reveal').forEach(r => io.observe(r));
}

/* ---------- 上映室 ---------- */
// 上映室を開いたまま再読み込みした場合など、作品IDのハッシュが残っていたら消す
if (WORKS.some(w => '#' + w.id === location.hash)) history.replaceState(null, '', location.pathname + location.search);
const th = $('#theater'), screen = $('#screen'), notes = $('#th-notes'), notesBtn = $('.th-notes-btn');
let opener = null, closing = false, closeTimer = 0;

/* 解説パネル：問い → 映像のみちすじ（場面へ飛べる）→ 数学の背景 → やってみよう → 学びのつながり */
function jumpTo(t) {
  const v = screen.querySelector('video'); if (!v) return;
  screen.querySelector('.curtain')?.classList.add('gone');
  screen.querySelector('.epilogue')?.classList.remove('show');
  v.currentTime = t; v.play();
  if (innerWidth < 900) toggleNotes(false);
}
function section(cls, label) { const s = el('section', 'n-sec ' + cls); s.append(el('h4', null, label)); return s; }
function setNotes(w) {
  const c = w.commentary;
  const head = el('div', 'n-head');
  const close = el('button', 'n-close', '閉じる ✕'); close.type = 'button';
  close.addEventListener('click', () => { toggleNotes(false); notesBtn.focus(); });
  head.append(el('p', 'eyebrow', 'NOTES — 解説'), close);
  const body = el('div', 'n-body');
  body.append(el('h3', 'n-title', w.title), el('p', 'n-sub', w.subtitle));
  if (c?.lead) body.append(el('p', 'n-lead', c.lead));

  const q = section('n-q', 'THE QUESTION — 問い'); q.append(el('p', 'n-question', w.question)); body.append(q);

  if (c?.scenes?.length) {
    const s = section('n-scenes', 'THE FILM — 映像のみちすじ');
    s.append(el('p', 'n-hint', '時刻を押すと、その場面から上映します。'));
    const ol = el('ol');
    c.scenes.forEach(sc => {
      const li = el('li');
      const b = el('button', 'n-time', fmt(sc.at) || '0:00'); b.type = 'button';
      b.setAttribute('aria-label', `${fmt(sc.at) || '0:00'} の場面「${sc.title}」から上映する`);
      b.addEventListener('click', () => jumpTo(sc.at));
      const tx = el('div'); tx.append(el('strong', null, sc.title), el('p', null, sc.text));
      li.append(b, tx); ol.append(li);
    });
    s.append(ol); body.append(s);
  }

  const m = section('n-math', 'THE MATHEMATICS — 数学の背景');
  if (c?.sections?.length) {
    c.sections.forEach(x => {
      m.append(el('h5', null, x.heading));
      x.paragraphs.forEach(p => m.append(el('p', null, p)));
      if (x.formula) m.append(el('p', 'n-formula', x.formula));
    });
  } else m.append(el('p', null, `算数：${w.entry}`), el('p', null, `数学：${w.mathematics}`));
  body.append(m);

  if (c?.try?.length) {
    const t = section('n-try', 'TRY — やってみよう'); const ul = el('ul');
    c.try.forEach(x => ul.append(el('li', null, x))); t.append(ul); body.append(t);
  }
  if (c?.connections?.length) {
    const k = section('n-conn', 'CONNECTIONS — 学びのつながり'); const dl = el('dl');
    c.connections.forEach(x => dl.append(el('dt', null, x.label), el('dd', null, x.text)));
    k.append(dl, el('p', 'note', '学年は目安です。')); body.append(k);
  }
  notes.replaceChildren(head, body);
  notes.scrollTop = 0;
}
function toggleNotes(force) {
  const show = force ?? notes.hidden;
  notes.hidden = !show; notesBtn.setAttribute('aria-expanded', String(show));
  th.classList.toggle('notes-open', show);
  if (show) notes.querySelector('.n-close')?.focus({ preventScroll: true });
}
notesBtn.addEventListener('click', () => toggleNotes());

function openTheater(w, i) {
  if (!w.available) return;
  // 閉じる途中で別の作品を開いた場合は、閉じる処理を打ち切ってから開き直す
  if (closing) { clearTimeout(closeTimer); closing = false; }
  if (th.open) th.close();
  opener = document.activeElement;
  $('#th-room').textContent = `ROOM ${String(i + 1).padStart(2, '0')}`;
  $('#th-title').textContent = w.title;
  setNotes(w); toggleNotes(false);
  th.classList.remove('playing');

  const v = el('video'); v.controls = true; v.preload = 'metadata'; v.playsInline = true;
  // 上映室ではサムネイル（答えを含みうる場面）を出さず、暗い幕の上に問いだけを置く
  v.src = ROOT + w.video;
  v.addEventListener('error', () => v.replaceWith(el('p', 'no-film', '映像を読み込めません。素材の配置を確認してください。')));

  // 上映前：問いを置き、鑑賞者が自分で上映を始める（自動再生しない）
  const curtain = el('div', 'curtain');
  const inner = el('div');
  const q = el('p', 'q'); q.append(el('span', 'eyebrow q-label', 'THE QUESTION'), document.createTextNode(w.question));
  const start = el('button', 'start', '上映する'); start.type = 'button';
  inner.append(q, start, el('p', 'meta', `上映時間 ${fmt(w.duration)}　·　音が出ます`));
  curtain.append(inner);
  start.addEventListener('click', () => { curtain.classList.add('gone'); v.play(); v.focus(); });

  // 上映後：余韻のあと、数学への扉を示す
  const ep = el('div', 'epilogue'); const ei = el('div', 'ep-in');
  const path = el('div', 'path');
  const a = el('div'); a.append(el('span', null, '算数'), document.createTextNode(w.entry));
  const b = el('div'); b.append(el('span', null, '数学'), document.createTextNode(w.mathematics));
  path.append(a, el('i', null, '→'), b);
  const acts = el('div', 'ep-actions');
  const again = el('button', null, 'もう一度見る'), read = el('button', null, '解説を読む'), back = el('button', null, '展示室へ戻る');
  [again, read, back].forEach(x => { x.type = 'button'; acts.append(x); });
  ei.append(el('p', 'eyebrow', 'AFTER THE FILM'), el('h3', null, w.question), path, acts);
  ep.append(ei);
  again.addEventListener('click', () => { ep.classList.remove('show'); v.currentTime = 0; v.play(); v.focus(); });
  read.addEventListener('click', () => toggleNotes(true));
  back.addEventListener('click', requestClose);

  v.addEventListener('play', () => { th.classList.add('playing'); curtain.classList.add('gone'); ep.classList.remove('show'); });
  v.addEventListener('pause', () => th.classList.remove('playing'));
  v.addEventListener('ended', () => { th.classList.remove('playing'); ep.classList.add('show'); again.focus({ preventScroll: true }); });

  screen.replaceChildren(v, curtain, ep);
  loom.hold(true);
  th.showModal();
  history.pushState({ theater: w.id }, '', '#' + w.id);
  requestAnimationFrame(() => requestAnimationFrame(() => th.classList.add('lit')));
  start.focus();
}
function closeTheater() {
  if (closing || !th.open) return;
  closing = true;
  screen.querySelector('video')?.pause();
  th.classList.remove('lit');
  closeTimer = setTimeout(() => { th.close(); closing = false; }, reduceMotion ? 0 : 700);
}
// 戻る操作は3通り：左上のボタン、Escキー、ブラウザ（スマホ）の「戻る」
function requestClose() { if (history.state && history.state.theater) history.back(); else closeTheater(); }
$('.th-back').addEventListener('click', requestClose);
th.addEventListener('cancel', e => { e.preventDefault(); if (!notes.hidden) toggleNotes(false); else requestClose(); });
addEventListener('popstate', () => { if (th.open && !(history.state && history.state.theater)) closeTheater(); });
// 上映中に手を動かしたら、戻るボタンをはっきり見せる
let awakeTimer = 0;
['pointermove', 'touchstart', 'keydown'].forEach(ev => th.addEventListener(ev, () => {
  th.classList.add('awake'); clearTimeout(awakeTimer);
  awakeTimer = setTimeout(() => th.classList.remove('awake'), 2500);
}, { passive: true }));
th.addEventListener('close', () => {
  if (th.open) return; // すでに別の作品で開き直している
  screen.querySelector('video')?.pause();
  screen.replaceChildren(); th.classList.remove('playing', 'lit', 'notes-open');
  loom.hold(false);
  opener?.focus({ preventScroll: true });
});
