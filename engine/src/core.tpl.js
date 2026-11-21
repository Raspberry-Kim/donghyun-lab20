/* 동현페 — 엔진 핵심부.
 * 게임 규칙 부분은 원작 프로그램의 기계어를 한 명령씩 JS로 옮긴 것이다.
 * 이 파일의 나머지(기억 장치·화면·입력·시간)는 새로 쓴 것이다. 롬 파일을 실행하지 않는다: data는 자료 바이트 배열. */
(function (root) {
'use strict';
function makeCore(rom, opts) {
  opts = opts || {};
  const m = new Uint8Array(0x10000), vram = new Uint8Array(0x4000);
  const NB = rom.length >> 14;
  let A = 0x11, B = 0, C = 0, D = 0xFF, E = 0x56, H = 0, L = 0x0D, SP = 0xFFFE, fz = 1, fn = 0, fh = 0, fc = 0;
  let pc = 0x100, cyc = 0, ime = 0, halted = 0, eiPend = 0;
  let bank = 1, bankOff = 0x4000, vbk = 0;
  /* ---- 연산 ---- */
  function add(v) { const r = A + v; fh = ((A & 15) + (v & 15)) > 15 ? 1 : 0; fc = r > 255 ? 1 : 0; A = r & 255; fz = A ? 0 : 1; fn = 0; }
  function adc(v) { const c = fc, r = A + v + c; fh = ((A & 15) + (v & 15) + c) > 15 ? 1 : 0; fc = r > 255 ? 1 : 0; A = r & 255; fz = A ? 0 : 1; fn = 0; }
  function sub(v) { const r = A - v; fh = (A & 15) < (v & 15) ? 1 : 0; fc = r < 0 ? 1 : 0; A = r & 255; fz = A ? 0 : 1; fn = 1; }
  function sbc(v) { const c = fc, r = A - v - c; fh = (A & 15) < (v & 15) + c ? 1 : 0; fc = r < 0 ? 1 : 0; A = r & 255; fz = A ? 0 : 1; fn = 1; }
  function and(v) { A &= v; fz = A ? 0 : 1; fn = 0; fh = 1; fc = 0; }
  function xor(v) { A ^= v; fz = A ? 0 : 1; fn = 0; fh = 0; fc = 0; }
  function or(v) { A |= v; fz = A ? 0 : 1; fn = 0; fh = 0; fc = 0; }
  function cp(v) { fh = (A & 15) < (v & 15) ? 1 : 0; fc = A < v ? 1 : 0; fz = A === v ? 1 : 0; fn = 1; }
  function inc(v) { fh = (v & 15) === 15 ? 1 : 0; v = (v + 1) & 255; fz = v ? 0 : 1; fn = 0; return v; }
  function dec(v) { fh = (v & 15) === 0 ? 1 : 0; v = (v - 1) & 255; fz = v ? 0 : 1; fn = 1; return v; }
  function addhl(v) { const hl = H << 8 | L, r = hl + v; fh = ((hl & 0xfff) + (v & 0xfff)) > 0xfff ? 1 : 0; fc = r > 0xffff ? 1 : 0; fn = 0; H = (r >> 8) & 255; L = r & 255; }
  function addsp(n) { const s = n > 127 ? n - 256 : n; fz = 0; fn = 0; fh = ((SP & 15) + (n & 15)) > 15 ? 1 : 0; fc = ((SP & 255) + n) > 255 ? 1 : 0; SP = (SP + s) & 65535; }
  function ldhlsp(n) { const s = n > 127 ? n - 256 : n; fz = 0; fn = 0; fh = ((SP & 15) + (n & 15)) > 15 ? 1 : 0; fc = ((SP & 255) + n) > 255 ? 1 : 0; const r = (SP + s) & 65535; H = r >> 8; L = r & 255; }
  function rlca() { fc = A >> 7; A = ((A << 1) | fc) & 255; fz = 0; fn = 0; fh = 0; }
  function rrca() { fc = A & 1; A = (A >> 1) | (fc << 7); fz = 0; fn = 0; fh = 0; }
  function rla() { const c = A >> 7; A = ((A << 1) | fc) & 255; fc = c; fz = 0; fn = 0; fh = 0; }
  function rra() { const c = A & 1; A = (A >> 1) | (fc << 7); fc = c; fz = 0; fn = 0; fh = 0; }
  function daa() { let a = A; if (!fn) { if (fc || a > 0x99) { a += 0x60; fc = 1; } if (fh || (a & 15) > 9) a += 6; } else { if (fc) a -= 0x60; if (fh) a -= 6; } A = a & 255; fz = A ? 0 : 1; fh = 0; }
  function rlc(v) { fc = v >> 7; v = ((v << 1) | fc) & 255; fz = v ? 0 : 1; fn = 0; fh = 0; return v; }
  function rrc(v) { fc = v & 1; v = (v >> 1) | (fc << 7); fz = v ? 0 : 1; fn = 0; fh = 0; return v; }
  function rl(v) { const c = v >> 7; v = ((v << 1) | fc) & 255; fc = c; fz = v ? 0 : 1; fn = 0; fh = 0; return v; }
  function rr(v) { const c = v & 1; v = (v >> 1) | (fc << 7); fc = c; fz = v ? 0 : 1; fn = 0; fh = 0; return v; }
  function sla(v) { fc = v >> 7; v = (v << 1) & 255; fz = v ? 0 : 1; fn = 0; fh = 0; return v; }
  function sra(v) { fc = v & 1; v = (v >> 1) | (v & 0x80); fz = v ? 0 : 1; fn = 0; fh = 0; return v; }
  function swap(v) { v = ((v << 4) | (v >> 4)) & 255; fz = v ? 0 : 1; fn = 0; fh = 0; fc = 0; return v; }
  function srl(v) { fc = v & 1; v >>= 1; fz = v ? 0 : 1; fn = 0; fh = 0; return v; }
  function push(v) { SP = (SP - 1) & 65535; m[SP] = v >> 8; SP = (SP - 1) & 65535; m[SP] = v & 255; }
  function pop() { const v = m[SP] | (m[(SP + 1) & 65535] << 8); SP = (SP + 2) & 65535; return v; }
  function pushaf() { push((A << 8) | (fz << 7) | (fn << 6) | (fh << 5) | (fc << 4)); }
  function popaf() { const v = pop(); A = v >> 8; fz = (v >> 7) & 1; fn = (v >> 6) & 1; fh = (v >> 5) & 1; fc = (v >> 4) & 1; }

  /* ---- 화면 시간: 한 줄 456, 한 화면 154줄. 줄의 80째 주기에 그 줄을 그린다 ---- */
  let lcdOn = 1, ly = 0, lineStart = 0, evt = 4, frameDone = 0, frames = 0, winLine = 0, offUntil = 0;
  let stat = 0, joySel = 0x30, keys = 0;      // keys: 1 오른쪽 2 왼쪽 4 위 8 아래 16 A 32 B 64 Select 128 Start
  const bgpal = new Uint8Array(64), objpal = new Uint8Array(64); let bcps = 0, ocps = 0;
  const bgRGB = new Uint32Array(32), objRGB = new Uint32Array(32), bgRaw = new Uint32Array(32), objRaw = new Uint32Array(32);
  const SW = 160, SH = 144;
  const fb = new Uint32Array(SW * SH), base = new Uint32Array(SW * SH), over = new Uint32Array(SW * SH), heroPx = new Uint32Array(SW * SH), fgm = new Uint8Array(SW * SH), actPx = new Uint32Array(SW * SH), heroIx = new Uint8Array(SW * SH), actIx = new Uint8Array(SW * SH), bgi = new Uint8Array(SW * SH);
  let recolor = opts.recolor || null, limit10 = !!opts.limit10;
  function rgb(lo, hi) { const c = lo | (hi << 8); return 0xFF000000 | (((c >> 10) & 31) << 19) | (((c >> 5) & 31) << 11) | ((c & 31) << 3); }
  /* recolor(v, k): 배경색 바꾸기(k는 0–31 색 번호). recolor.theme가 있으면 주제색(팔레트 0·1)이 바뀔 때 전체를 다시 계산한다 */
  function setBg(i) {
    const k = i >> 1, v = rgb(bgpal[k * 2], bgpal[k * 2 + 1]); bgRaw[k] = v;
    if (recolor && recolor.theme && k < 8 && recolor.theme(bgRaw)) { for (let j = 0; j < 32; j++) bgRGB[j] = recolor(bgRaw[j], j); reObj(); return; }
    bgRGB[k] = recolor ? recolor(v, k) : v;
  }
  /* 스프라이트 팔레트 6은 궁전 층에서 바닥 조각(주제색)에 쓰이므로 배경과 같은 색 바꾸기를 거친다 */
  function setObj(i) { const k = i >> 1, v = rgb(objpal[k * 2], objpal[k * 2 + 1]); objRaw[k] = v; objRGB[k] = recolor && (k >> 2) === 6 ? recolor(v, -1) : v; }
  function reObj() { for (let j = 24; j < 28; j++) objRGB[j] = recolor ? recolor(objRaw[j], -1) : objRaw[j]; }
  function setRecolor(f) { recolor = f; if (f && f.theme) f.theme(bgRaw); for (let j = 0; j < 32; j++) bgRGB[j] = f ? f(bgRaw[j], j) : bgRaw[j]; reObj(); }

  const lnBg = new Uint8Array(SW), lnU = new Uint32Array(SW), lnH = new Uint32Array(SW), lnO = new Uint32Array(SW), lnA = new Uint32Array(SW), lnUb = new Uint8Array(SW), lnHb = new Uint8Array(SW), lnOb = new Uint8Array(SW), lnAb = new Uint8Array(SW), lnHi = new Uint8Array(SW), lnAi = new Uint8Array(SW);
  function renderLine(y) {
    const lcdc = m[0xFF40], o = y * SW;
    const scy = m[0xFF42], scx = m[0xFF43], wy = m[0xFF4A], wx = m[0xFF4B] - 7;
    const winOn = (lcdc & 0x20) && wy <= y && wx < SW;
    const dataLo = lcdc & 0x10;
    let mapB = (lcdc & 8) ? 0x1C00 : 0x1800, yy = (y + scy) & 255;
    for (let x = 0; x < SW; x++) {
      let px, tyy;
      if (winOn && x >= wx) { px = x - wx; tyy = winLine; mapB = (lcdc & 0x40) ? 0x1C00 : 0x1800; }
      else { px = (x + scx) & 255; tyy = yy; }
      const ma = mapB + ((tyy >> 3) << 5) + (px >> 3), t = vram[ma], at = vram[0x2000 + ma];
      let ta = dataLo ? t * 16 : 0x1000 + ((t << 24) >> 24) * 16;
      if (at & 8) ta += 0x2000;
      const ry = (at & 0x40) ? 7 - (tyy & 7) : (tyy & 7), bx = (at & 0x20) ? (px & 7) : 7 - (px & 7);
      const c = ((vram[ta + ry * 2] >> bx) & 1) | (((vram[ta + ry * 2 + 1] >> bx) & 1) << 1);
      lnBg[x] = c | ((at & 0x80) ? 4 : 0);
      base[o + x] = bgRGB[(at & 7) * 4 + c];
    }
    if (winOn) winLine++;
    lnU.fill(0); lnH.fill(0); lnO.fill(0); lnA.fill(0);
    if (lcdc & 2) {
      const h = (lcdc & 4) ? 16 : 8; let cnt = 0;
      const list = [];
      for (let i = 0; i < 40; i++) { const sy = m[0xFE00 + i * 4] - 16; if (y >= sy && y < sy + h) { list.push(i); if (limit10 && list.length === 10) break; } }
      for (let k = list.length - 1; k >= 0; k--) {
        const i = list[k], a = 0xFE00 + i * 4, sy = m[a] - 16, sx = m[a + 1] - 8, at = m[a + 3]; let t = m[a + 2];
        let ry = y - sy; if (at & 0x40) ry = h - 1 - ry;
        if (h === 16) { t = (t & 0xFE) | (ry >> 3); ry &= 7; }
        const ta = t * 16 + ((at & 8) ? 0x2000 : 0) + ry * 2, b0 = vram[ta], b1 = vram[ta + 1];
        if (!(b0 | b1)) continue;
        const dst = i < 2 ? lnO : i < 17 ? lnH : lnU, dsb = i < 2 ? lnOb : i < 17 ? lnHb : lnUb, act = i >= 17 && i < 33;
        for (let q = 0; q < 8; q++) {
          const x = sx + q; if (x < 0 || x >= SW) continue;
          const bx = (at & 0x20) ? q : 7 - q, c = ((b0 >> bx) & 1) | (((b1 >> bx) & 1) << 1);
          if (!c) continue;
          const v = objRGB[(at & 7) * 4 + c];
          dst[x] = v; dsb[x] = at >> 7;
          if (dst === lnH) lnHi[x] = c;
          if (act) { lnA[x] = v; lnAb[x] = at >> 7; lnAi[x] = c; } else if (i >= 33) lnA[x] = 0;
        }
      }
    }
    const master = lcdc & 1;
    for (let x = 0; x < SW; x++) {
      const b = lnBg[x], bc = b & 3, bp = master && bc && (b & 4) ? 1 : 0, bb = master && bc ? 1 : 0;
      fgm[o + x] = bp; bgi[o + x] = master ? b : 0;
      let v = base[o + x], w = v;
      const u = lnU[x]; if (u && !(bp || (bb && lnUb[x]))) { v = u; w = u; }
      base[o + x] = v;
      const a = lnA[x]; if (a && !(bp || (bb && lnAb[x]))) { actPx[o + x] = a; actIx[o + x] = lnAi[x]; } else { actPx[o + x] = 0; actIx[o + x] = 0; }
      const hh = lnH[x]; if (hh && !(bp || (bb && lnHb[x]))) { heroPx[o + x] = hh; heroIx[o + x] = lnHi[x]; w = hh; } else { heroPx[o + x] = 0; heroIx[o + x] = 0; }
      const oo = lnO[x]; if (oo && !(bp || (bb && lnOb[x]))) { over[o + x] = oo; w = oo; } else over[o + x] = 0;
      fb[o + x] = w;
    }
  }
  function blank() { fb.fill(0xFFFFFFFF); base.fill(0xFFFFFFFF); over.fill(0); heroPx.fill(0); fgm.fill(0); actPx.fill(0); heroIx.fill(0); actIx.fill(0); bgi.fill(0); }
  /* 줄 시간표(보이는 시각 기준): 줄 시작 → +4 스프라이트 고르기(모드 2) → +84 그리기 시작(모드 3, 길이는 그 줄의 스프라이트에 따라) → 가로 귀선 → +456 다음 줄 */
  let ph = 0, firstLine = 0, m3len = 172, nLineObj = 0; const lineObjX = new Uint8Array(10);
  function collectObjs() {
    const lcdc = m[0xFF40]; if (!(lcdc & 2)) return;
    const h = (lcdc & 4) ? 16 : 8; let n = 0;
    for (let i = 0; i < 40 && n < 10; i++) { const r = (ly - (m[0xFE00 + i * 4] - 16)) & 255; if (r < h) lineObjX[n++] = m[0xFE01 + i * 4]; }
    nLineObj = n;
  }
  const bkt = new Int8Array(24);
  function mode3len() {
    const sf = m[0xFF43] & 7; let t = 172 + sf, z = 0; bkt.fill(0);
    for (let i = 0; i < nLineObj; i++) {
      let x = lineObjX[i]; if (x >= 168) continue;
      if (!z && x === 0) { z = 1; t += sf; }
      x += sf; const b = x >> 3, v = 5 - (x & 7); if (v > bkt[b]) bkt[b] = v; t += 6;
    }
    for (let i = 0; i < 22; i++) t += bkt[i];
    return t & ~3;
  }
  function events() {
    while (lcdOn && cyc >= evt) {
      if (ph === 0) { collectObjs(); ph = 1; evt = lineStart + 84; continue; }
      if (ph === 1) { m3len = mode3len(); renderLine(ly); ph = 2; evt = lineStart + 456; continue; }
      if (ph === 3) { if (m[0xFF45] === 0 && (stat & 0x40)) m[0xFF0F] |= 2; ph = 2; evt = lineStart + 456; continue; }
      ly++; lineStart += 456; firstLine = 0;
      if (ly === 154) { ly = 0; winLine = 0; }
      else {
        if (ly === 144) { m[0xFF0F] |= 1; if (stat & 0x10) m[0xFF0F] |= 2; frameDone = 1; frames++; }
        if (ly === m[0xFF45] && (stat & 0x40)) m[0xFF0F] |= 2;
      }
      if (ly < 144) { ph = 0; evt = lineStart + 4; } else if (ly === 153) { ph = 3; evt = lineStart + 8; } else { ph = 2; evt = lineStart + 456; }
    }
  }
  function lyNow() { return !lcdOn ? 0 : (ly === 153 && cyc - lineStart >= 4) ? 0 : ly; }
  function modeNow() {
    if (!lcdOn) return 0;
    const t = cyc - lineStart;
    if (ly >= 144) return (ly === 144 && t < 4) ? 0 : 1;
    if (t < 4) return 0;
    if (t < 84) return firstLine ? 0 : 2;
    return t < 84 + m3len ? 3 : 0;
  }
  /* ---- 기억 장치 ---- */
  let onIo = opts.onIo || null, onDma = opts.onDma || null, romLog = opts.romLog || null;
  function rd(a) {
    if (a < 0x4000) { if (romLog) romLog[a] = 1; return rom[a]; }
    if (a < 0x8000) { const p = bankOff + (a & 0x3fff); if (romLog) romLog[p] = 1; return rom[p]; }
    if (a < 0xA000) return vram[(vbk << 13) + (a & 0x1fff)];
    if (a < 0xC000) return 0xFF;
    if (a < 0xFF00) return m[a];
    switch (a) {
      case 0xFF00: { let r = 0xCF | joySel; if (!(joySel & 0x10)) r &= ~(keys & 15); if (!(joySel & 0x20)) r &= ~(keys >> 4); return r & 255; }
      case 0xFF41: { events(); const l = lyNow(); return 0x80 | stat | (lcdOn && l === m[0xFF45] ? 4 : 0) | modeNow(); }
      case 0xFF44: events(); return lyNow();
      case 0xFF4F: return vbk | 0xFE;
      case 0xFF69: return bgpal[bcps & 63];
      case 0xFF6B: return objpal[ocps & 63];
      case 0xFF68: return bcps; case 0xFF6A: return ocps;
    }
    return m[a];
  }
  function wr(a, v) {
    if (a >= 0xC000) {
      if (a < 0xFF00) { m[a] = v; return; }
      switch (a) {
        case 0xFF00: joySel = v & 0x30; return;
        case 0xFF40: {
          events();
          const was = lcdOn; m[a] = v; lcdOn = v >> 7;
          if (was && !lcdOn) { ly = 0; blank(); offUntil = cyc + 70224; evt = 1e18; }
          else if (!was && lcdOn) { ly = 0; lineStart = cyc - 4; ph = 1; firstLine = 1; evt = lineStart + 84; winLine = 0; }
          return;
        }
        case 0xFF41: { events(); if (lcdOn && (v & 0x40) && !(stat & 0x40) && lyNow() === m[0xFF45]) m[0xFF0F] |= 2; stat = v & 0x78; return; }
        case 0xFF45: { events(); if (lcdOn && v !== m[a] && lyNow() === v && (stat & 0x40)) m[0xFF0F] |= 2; m[a] = v; return; }
        case 0xFF44: return;
        case 0xFF46: { const s = v << 8; for (let i = 0; i < 160; i++) m[0xFE00 + i] = m[s + i]; if (onDma) onDma(); return; }
        case 0xFF4F: vbk = v & 1; return;
        case 0xFF68: bcps = v; return;
        case 0xFF69: bgpal[bcps & 63] = v; setBg(bcps & 63); if (bcps & 0x80) bcps = 0x80 | ((bcps + 1) & 63); return;
        case 0xFF6A: ocps = v; return;
        case 0xFF6B: objpal[ocps & 63] = v; setObj(ocps & 63); if (ocps & 0x80) ocps = 0x80 | ((ocps + 1) & 63); return;
      }
      if (a >= 0xFF10 && a < 0xFF40 && onIo) onIo(a, v, cyc);
      m[a] = v; return;
    }
    if (a >= 0x8000) { if (a < 0xA000) vram[(vbk << 13) + (a & 0x1fff)] = v; return; }
    if (a >= 0x2000 && a < 0x3000) { bank = (bank & 0x100) | v; bankOff = (bank % NB) << 14; }
    else if (a >= 0x3000 && a < 0x4000) { bank = (bank & 0xff) | ((v & 1) << 8); bankOff = (bank % NB) << 14; }
  }
  /*@@CODE@@*/
  /* ---- 실행 ---- */
  const HK = new Uint8Array(0x10000), hooks = {};
  function hook(a, f) { HK[a] = 1; hooks[a] = f; }
  function flowHook(a, f) { GK[a] = 1; ghooks[a] = f; }   // 흐름 갈아 끼우기: f가 true를 돌려주면 그 명령을 실행하지 않고 나간다(pc는 f가 정한다)
  function native(p) {
    if (p === 0xFF80) { wr(0xFF46, 0xC0); cyc += 680; pc = pop(); return; }   // 스프라이트 표 넘기기(원작이 RAM에 복사해 둔 짧은 루틴)
    throw new Error('코드가 아닌 곳으로 감: ' + p.toString(16) + ' bank ' + bank);
  }
  function step() {
    if (cyc >= evt) events();
    if (eiPend) { ime = 1; eiPend = 0; }
    const pend = m[0xFF0F] & m[0xFFFF] & 31;
    if (pend) {
      halted = 0;
      if (ime) { const b = pend & 1 ? 0 : pend & 2 ? 1 : pend & 4 ? 2 : pend & 8 ? 3 : 4; m[0xFF0F] &= ~(1 << b); ime = 0; push(pc); pc = 0x40 + 8 * b; cyc += 20; }
    }
    if (halted) { if (lcdOn) cyc = evt; else cyc += 456; return; }
    if (HK[pc] && hooks[pc]()) return;
    const ci = pc < 0x8000 ? PCT[pc] : -1;
    if (ci < 0) native(pc); else CHUNKS[ci]();
  }
  /* 한 화면(세로 귀선 시작까지) 실행 */
  function frame() {
    frameDone = 0;
    if (!lcdOn) offUntil = cyc + 70224;
    for (;;) {
      step();
      if (frameDone) break;
      if (!lcdOn && cyc >= offUntil) { frames++; break; }
    }
  }
  function runTo(t) { while (cyc < t) step(); }
  m[0xFF40] = 0x91; m[0xFF47] = 0xFC; m[0xFF48] = 0xFF; m[0xFF49] = 0xFF; m[0xFF0F] = 0;
  const KEYBIT = { right: 1, left: 2, up: 4, down: 8, A: 16, B: 32, select: 64, start: 128 };
  return {
    m, vram, fb, base, over, heroPx, actPx, fgm, heroIx, actIx, bgi, brk() { frameDone = 1; }, frame, runTo, step, hook, flowHook, rd, wr,
    key(name, down) { const b = KEYBIT[name]; if (down) keys |= b; else keys &= ~b; },
    setKeys(v) { keys = v; }, setRecolor,
    get pc() { return pc; }, set pc(v) { pc = v; },
    get frames() { return frames; }, get cyc() { return cyc; }, get bank() { return bank; },
    reg() { return { A, B, C, D, E, H, L, SP, fz, fn, fh, fc, pc, ime, halted, bank, ly, lcdOn }; },
    setReg(r) { if ('A' in r) A = r.A; if ('B' in r) B = r.B; if ('C' in r) C = r.C; if ('D' in r) D = r.D; if ('E' in r) E = r.E; if ('H' in r) H = r.H; if ('L' in r) L = r.L; if ('SP' in r) SP = r.SP; if ('ime' in r) ime = r.ime; },
    call(addr) { push(pc); pc = addr; },
    bgRaw, bgRGB, objRGB, SW, SH,
  };
}
const api = { makeCore };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DonghyunPeCore = api;
})(typeof self !== 'undefined' ? self : this);
