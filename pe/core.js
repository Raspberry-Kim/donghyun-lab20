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
  function rgb(lo, hi) { const c = lo | (hi << 8); return (0xFF000000 | (((c >> 10) & 31) << 19) | (((c >> 5) & 31) << 11) | ((c & 31) << 3)) >>> 0; }
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
  const GK=new Uint8Array(0x8000),ghooks={};
const CHUNKS=[
function(){switch(pc){
case 72:cyc+=16;pc=4320;return;
case 256:cyc+=4;
if(cyc>=evt){pc=257;return;}
case 257:cyc+=16;pc=358;return;
case 336:cyc+=4;ime=0;
if(cyc>=evt){pc=337;return;}
case 337:cyc+=24;push(340);pc=15023;return;
if(cyc>=evt){pc=340;return;}
case 340:cyc+=12;H=255;L=68;
if(cyc>=evt){pc=343;return;}
case 343:cyc+=8;A=146;
if(cyc>=evt){pc=345;return;}
case 345:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=346;return;}
case 346:cyc+=8;if(!fz){cyc+=4;pc=345;return;}
if(cyc>=evt){pc=348;return;}
case 348:cyc+=24;push(351);pc=7398;return;
if(cyc>=evt){pc=351;return;}
case 351:cyc+=8;A=145;
if(cyc>=evt){pc=353;return;}
case 353:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=354;return;}
case 354:cyc+=8;if(!fz){cyc+=4;pc=353;return;}
if(cyc>=evt){pc=356;return;}
case 356:cyc+=12;pc=361;return;
case 358:cyc+=16;wr(49408,A);
if(cyc>=evt){pc=361;return;}
case 361:cyc+=4;ime=0;
if(cyc>=evt){pc=362;return;}
case 362:cyc+=12;SP=52735;
if(cyc>=evt){pc=365;return;}
case 365:cyc+=24;push(368);pc=14663;return;
if(cyc>=evt){pc=368;return;}
case 368:cyc+=8;A=144;
if(cyc>=evt){pc=370;return;}
case 370:cyc+=12;wr(65354,A);
if(cyc>=evt){pc=372;return;}
case 372:cyc+=8;A=7;
if(cyc>=evt){pc=374;return;}
case 374:cyc+=12;wr(65355,A);
if(cyc>=evt){pc=376;return;}
case 376:cyc+=4;xor(A);
if(cyc>=evt){pc=377;return;}
case 377:cyc+=12;wr(65347,A);
if(cyc>=evt){pc=379;return;}
case 379:cyc+=12;wr(65346,A);
if(cyc>=evt){pc=381;return;}
case 381:cyc+=12;wr(65295,A);
if(cyc>=evt){pc=383;return;}
case 383:cyc+=12;wr(65535,A);
if(cyc>=evt){pc=385;return;}
case 385:cyc+=12;H=193;L=6;
if(cyc>=evt){pc=388;return;}
case 388:cyc+=4;xor(A);
if(cyc>=evt){pc=389;return;}
case 389:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=390;return;}
case 390:cyc+=4;A=H;
if(cyc>=evt){pc=391;return;}
case 391:cyc+=8;cp(193);
if(cyc>=evt){pc=393;return;}
case 393:cyc+=8;if(!fz){cyc+=4;pc=388;return;}
if(cyc>=evt){pc=395;return;}
case 395:cyc+=4;A=L;
if(cyc>=evt){pc=396;return;}
case 396:cyc+=8;cp(217);
if(cyc>=evt){pc=398;return;}
case 398:cyc+=8;if(!fz){cyc+=4;pc=388;return;}
if(cyc>=evt){pc=400;return;}
case 400:cyc+=8;A=60;
if(cyc>=evt){pc=402;return;}
case 402:cyc+=16;wr(49507,A);
if(cyc>=evt){pc=405;return;}
case 405:cyc+=24;push(408);pc=4739;return;
if(cyc>=evt){pc=408;return;}
case 408:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=410;return;}
case 410:cyc+=8;and(15);
if(cyc>=evt){pc=412;return;}
case 412:cyc+=8;if(!fz){cyc+=4;pc=405;return;}
if(cyc>=evt){pc=414;return;}
case 414:cyc+=4;xor(A);
if(cyc>=evt){pc=415;return;}
case 415:cyc+=16;wr(0,A);
if(cyc>=evt){pc=418;return;}
case 418:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=421;return;}
case 421:cyc+=16;wr(16384,A);
if(cyc>=evt){pc=424;return;}
case 424:cyc+=16;wr(24576,A);
if(cyc>=evt){pc=427;return;}
case 427:cyc+=24;push(430);pc=4788;return;
if(cyc>=evt){pc=430;return;}
case 430:cyc+=24;push(433);pc=7524;return;
if(cyc>=evt){pc=433;return;}
case 433:cyc+=8;A=1;
if(cyc>=evt){pc=435;return;}
case 435:cyc+=16;wr(49496,A);
if(cyc>=evt){pc=438;return;}
case 438:cyc+=24;push(441);pc=15023;return;
if(cyc>=evt){pc=441;return;}
case 441:cyc+=8;A=2;
if(cyc>=evt){pc=443;return;}
case 443:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=446;return;}
case 446:cyc+=12;D=115;E=32;
if(cyc>=evt){pc=449;return;}
case 449:cyc+=12;B=4;C=0;
if(cyc>=evt){pc=452;return;}
case 452:cyc+=24;push(455);pc=7946;return;
if(cyc>=evt){pc=455;return;}
case 455:cyc+=4;L=E;
if(cyc>=evt){pc=456;return;}
case 456:cyc+=4;H=D;
if(cyc>=evt){pc=457;return;}
case 457:cyc+=12;D=200;E=0;
if(cyc>=evt){pc=460;return;}
case 460:cyc+=24;push(463);pc=4849;return;
if(cyc>=evt){pc=463;return;}
case 463:cyc+=8;A=5;
if(cyc>=evt){pc=465;return;}
case 465:if(GK[465]){pc=465;if(ghooks[465]())return;}
cyc+=16;wr(49419,A);
if(cyc>=evt){pc=468;return;}
case 468:cyc+=4;xor(A);
if(cyc>=evt){pc=469;return;}
case 469:cyc+=16;wr(49418,A);
if(cyc>=evt){pc=472;return;}
case 472:cyc+=8;A=10;
if(cyc>=evt){pc=474;return;}
case 474:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=477;return;}
case 477:cyc+=12;H=82;L=156;
if(cyc>=evt){pc=480;return;}
case 480:cyc+=24;push(483);pc=8129;return;
if(cyc>=evt){pc=483;return;}
case 483:cyc+=12;D=128;E=0;
if(cyc>=evt){pc=486;return;}
case 486:cyc+=24;push(489);pc=4849;return;
if(cyc>=evt){pc=489;return;}
case 489:cyc+=12;H=208;L=0;
if(cyc>=evt){pc=492;return;}
case 492:cyc+=12;D=144;E=0;
if(cyc>=evt){pc=495;return;}
case 495:cyc+=12;B=8;C=0;
if(cyc>=evt){pc=498;return;}
case 498:cyc+=24;push(501);pc=4849;return;
if(cyc>=evt){pc=501;return;}
case 501:cyc+=8;A=1;
if(cyc>=evt){pc=503;return;}
case 503:cyc+=12;wr(65359,A);
if(cyc>=evt){pc=505;return;}
case 505:cyc+=4;
if(cyc>=evt){pc=506;return;}
case 506:cyc+=12;H=152;L=0;
if(cyc>=evt){pc=509;return;}
case 509:cyc+=12;B=20;C=32;
if(cyc>=evt){pc=512;return;}
case 512:cyc+=12;D=79;E=220;
if(cyc>=evt){pc=515;return;}
case 515:cyc+=24;push(518);pc=4922;return;
if(cyc>=evt){pc=518;return;}
case 518:cyc+=4;xor(A);
if(cyc>=evt){pc=519;return;}
case 519:cyc+=12;wr(65359,A);
if(cyc>=evt){pc=521;return;}
case 521:cyc+=4;
if(cyc>=evt){pc=522;return;}
case 522:cyc+=12;H=152;L=0;
if(cyc>=evt){pc=525;return;}
case 525:cyc+=12;B=20;C=32;
if(cyc>=evt){pc=528;return;}
case 528:cyc+=12;D=77;E=92;
if(cyc>=evt){pc=531;return;}
case 531:cyc+=24;push(534);pc=4922;return;
if(cyc>=evt){pc=534;return;}
case 534:cyc+=8;A=5;
if(cyc>=evt){pc=536;return;}
case 536:cyc+=16;wr(49483,A);
if(cyc>=evt){pc=539;return;}
case 539:cyc+=24;push(542);pc=7275;return;
if(cyc>=evt){pc=542;return;}
case 542:cyc+=8;A=143;
if(cyc>=evt){pc=544;return;}
case 544:cyc+=12;wr(65349,A);
if(cyc>=evt){pc=546;return;}
case 546:cyc+=8;A=64;
if(cyc>=evt){pc=548;return;}
case 548:cyc+=12;wr(65345,A);
if(cyc>=evt){pc=550;return;}
case 550:cyc+=4;xor(A);
if(cyc>=evt){pc=551;return;}
case 551:cyc+=12;wr(65295,A);
if(cyc>=evt){pc=553;return;}
case 553:cyc+=8;A=2;
if(cyc>=evt){pc=555;return;}
case 555:cyc+=12;wr(65535,A);
if(cyc>=evt){pc=557;return;}
case 557:cyc+=8;A=129;
if(cyc>=evt){pc=559;return;}
case 559:cyc+=12;wr(65344,A);
if(cyc>=evt){pc=561;return;}
case 561:cyc+=4;eiPend=1;
case 562:cyc+=8;A=180;
if(cyc>=evt){pc=564;return;}
case 564:cyc+=16;wr(49419,A);
if(cyc>=evt){pc=567;return;}
case 567:cyc+=12;H=193;L=11;
if(cyc>=evt){pc=570;return;}
case 570:cyc+=16;A=rd(49418);
if(cyc>=evt){pc=573;return;}
case 573:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=574;return;}
case 574:cyc+=8;if(fc){cyc+=4;pc=567;return;}
if(cyc>=evt){pc=576;return;}
case 576:cyc+=12;A=rd(65346);
if(cyc>=evt){pc=578;return;}
case 578:cyc+=4;A=inc(A);
if(cyc>=evt){pc=579;return;}
case 579:cyc+=8;cp(113);
if(cyc>=evt){pc=581;return;}
case 581:cyc+=8;if(!fc){cyc+=4;pc=596;return;}
if(cyc>=evt){pc=583;return;}
case 583:cyc+=12;wr(65346,A);
if(cyc>=evt){pc=585;return;}
case 585:cyc+=4;xor(A);
if(cyc>=evt){pc=586;return;}
case 586:cyc+=16;wr(49418,A);
if(cyc>=evt){pc=589;return;}
case 589:cyc+=8;A=2;
if(cyc>=evt){pc=591;return;}
case 591:cyc+=16;wr(49419,A);
if(cyc>=evt){pc=594;return;}
case 594:cyc+=12;pc=567;return;
case 596:cyc+=24;push(599);pc=8287;return;
if(cyc>=evt){pc=599;return;}
case 599:cyc+=8;if(fz){cyc+=4;pc=596;return;}
if(cyc>=evt){pc=601;return;}
case 601:cyc+=24;push(604);pc=4824;return;
if(cyc>=evt){pc=604;return;}
case 604:cyc+=4;xor(A);
if(cyc>=evt){pc=605;return;}
case 605:cyc+=12;wr(65346,A);
if(cyc>=evt){pc=607;return;}
case 607:cyc+=8;A=103;
if(cyc>=evt){pc=609;return;}
case 609:cyc+=12;wr(65349,A);
if(cyc>=evt){pc=611;return;}
case 611:cyc+=8;A=4;
if(cyc>=evt){pc=613;return;}
case 613:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=616;return;}
case 616:cyc+=12;H=65;L=184;
if(cyc>=evt){pc=619;return;}
case 619:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=622;return;}
case 622:cyc+=8;cp(17);
if(cyc>=evt){pc=624;return;}
case 624:cyc+=8;if(!fz){cyc+=4;pc=629;return;}
if(cyc>=evt){pc=626;return;}
case 626:cyc+=12;H=83;L=191;
if(cyc>=evt){pc=629;return;}
case 629:cyc+=24;push(632);pc=8129;return;
if(cyc>=evt){pc=632;return;}
case 632:cyc+=12;D=128;E=0;
if(cyc>=evt){pc=635;return;}
case 635:cyc+=24;push(638);pc=4849;return;
if(cyc>=evt){pc=638;return;}
case 638:cyc+=12;H=208;L=0;
if(cyc>=evt){pc=641;return;}
case 641:cyc+=12;D=144;E=0;
if(cyc>=evt){pc=644;return;}
case 644:cyc+=12;B=8;C=0;
if(cyc>=evt){pc=647;return;}
case 647:cyc+=24;push(650);pc=4849;return;
if(cyc>=evt){pc=650;return;}
case 650:cyc+=8;A=4;
if(cyc>=evt){pc=652;return;}
case 652:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=655;return;}
case 655:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=658;return;}
case 658:cyc+=8;cp(17);
if(cyc>=evt){pc=660;return;}
case 660:cyc+=8;if(fz){cyc+=4;pc=667;return;}
if(cyc>=evt){pc=662;return;}
case 662:cyc+=12;D=64;E=80;
if(cyc>=evt){pc=665;return;}
case 665:cyc+=12;pc=691;return;
case 667:cyc+=8;A=1;
if(cyc>=evt){pc=669;return;}
case 669:cyc+=12;wr(65359,A);
if(cyc>=evt){pc=671;return;}
case 671:cyc+=4;
if(cyc>=evt){pc=672;return;}
case 672:cyc+=12;H=152;L=0;
if(cyc>=evt){pc=675;return;}
case 675:cyc+=12;D=82;E=23;
if(cyc>=evt){pc=678;return;}
case 678:cyc+=12;B=20;C=18;
if(cyc>=evt){pc=681;return;}
case 681:cyc+=24;push(684);pc=4922;return;
if(cyc>=evt){pc=684;return;}
case 684:cyc+=4;xor(A);
if(cyc>=evt){pc=685;return;}
case 685:cyc+=12;wr(65359,A);
if(cyc>=evt){pc=687;return;}
case 687:cyc+=4;
if(cyc>=evt){pc=688;return;}
case 688:cyc+=12;D=80;E=95;
if(cyc>=evt){pc=691;return;}
case 691:cyc+=12;H=152;L=0;
if(cyc>=evt){pc=694;return;}
case 694:cyc+=12;B=20;C=18;
if(cyc>=evt){pc=697;return;}
case 697:cyc+=24;push(700);pc=4922;return;
if(cyc>=evt){pc=700;return;}
case 700:cyc+=8;A=6;
if(cyc>=evt){pc=702;return;}
case 702:cyc+=16;wr(49483,A);
if(cyc>=evt){pc=705;return;}
case 705:cyc+=24;push(708);pc=7275;return;
if(cyc>=evt){pc=708;return;}
case 708:cyc+=8;A=1;
if(cyc>=evt){pc=710;return;}
case 710:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=713;return;}
case 713:cyc+=12;D=112;E=22;
if(cyc>=evt){pc=716;return;}
case 716:cyc+=12;H=153;L=132;
if(cyc>=evt){pc=719;return;}
case 719:cyc+=24;push(722);pc=7640;return;
if(cyc>=evt){pc=722;return;}
case 722:cyc+=8;A=5;
if(cyc>=evt){pc=724;return;}
case 724:cyc+=16;wr(49419,A);
if(cyc>=evt){pc=727;return;}
case 727:cyc+=16;wr(49418,A);
if(cyc>=evt){pc=730;return;}
case 730:cyc+=8;A=15;
if(cyc>=evt){pc=732;return;}
case 732:cyc+=24;push(735);pc=14993;return;
if(cyc>=evt){pc=735;return;}
case 735:cyc+=8;A=129;
if(cyc>=evt){pc=737;return;}
case 737:cyc+=12;wr(65344,A);
if(cyc>=evt){pc=739;return;}
case 739:cyc+=24;push(742);pc=8287;return;
if(cyc>=evt){pc=742;return;}
case 742:cyc+=8;if(!fz){cyc+=4;pc=832;return;}
if(cyc>=evt){pc=744;return;}
case 744:cyc+=16;A=rd(49595);
if(cyc>=evt){pc=747;return;}
case 747:cyc+=8;cp(1);
if(cyc>=evt){pc=749;return;}
case 749:cyc+=8;if(!fz){cyc+=4;pc=763;return;}
if(cyc>=evt){pc=751;return;}
case 751:cyc+=16;A=rd(49594);
if(cyc>=evt){pc=754;return;}
case 754:cyc+=8;cp(24);
if(cyc>=evt){pc=756;return;}
case 756:cyc+=8;if(!fz){cyc+=4;pc=826;return;}
if(cyc>=evt){pc=758;return;}
case 758:cyc+=12;D=112;E=51;
if(cyc>=evt){pc=761;return;}
case 761:cyc+=12;pc=809;return;
case 763:cyc+=8;cp(2);
if(cyc>=evt){pc=765;return;}
case 765:cyc+=8;if(!fz){cyc+=4;pc=779;return;}
if(cyc>=evt){pc=767;return;}
case 767:cyc+=16;A=rd(49594);
if(cyc>=evt){pc=770;return;}
case 770:cyc+=8;cp(17);
if(cyc>=evt){pc=772;return;}
case 772:cyc+=8;if(!fz){cyc+=4;pc=826;return;}
if(cyc>=evt){pc=774;return;}
case 774:cyc+=12;D=112;E=75;
if(cyc>=evt){pc=777;return;}
case 777:cyc+=12;pc=809;return;
case 779:cyc+=8;cp(3);
if(cyc>=evt){pc=781;return;}
case 781:cyc+=8;if(!fz){cyc+=4;pc=795;return;}
if(cyc>=evt){pc=783;return;}
case 783:cyc+=16;A=rd(49594);
if(cyc>=evt){pc=786;return;}
case 786:cyc+=8;cp(2);
if(cyc>=evt){pc=788;return;}
case 788:cyc+=8;if(!fz){cyc+=4;pc=826;return;}
if(cyc>=evt){pc=790;return;}
case 790:cyc+=12;D=112;E=112;
if(cyc>=evt){pc=793;return;}
case 793:cyc+=12;pc=809;return;
case 795:cyc+=8;cp(4);
if(cyc>=evt){pc=797;return;}
case 797:cyc+=8;if(!fz){cyc+=4;pc=826;return;}
if(cyc>=evt){pc=799;return;}
case 799:cyc+=16;A=rd(49594);
if(cyc>=evt){pc=802;return;}
case 802:cyc+=8;cp(18);
if(cyc>=evt){pc=804;return;}
case 804:cyc+=8;if(!fz){cyc+=4;pc=826;return;}
if(cyc>=evt){pc=806;return;}
case 806:cyc+=12;D=112;E=143;
if(cyc>=evt){pc=809;return;}
case 809:cyc+=12;H=153;L=132;
if(cyc>=evt){pc=812;return;}
case 812:cyc+=12;B=13;C=5;
if(cyc>=evt){pc=815;return;}
case 815:cyc+=24;push(818);pc=7864;return;
if(cyc>=evt){pc=818;return;}
case 818:cyc+=12;H=153;L=132;
if(cyc>=evt){pc=821;return;}
case 821:cyc+=24;push(824);pc=7640;return;
if(cyc>=evt){pc=824;return;}
case 824:cyc+=12;pc=739;return;
case 826:cyc+=16;A=rd(49592);
if(cyc>=evt){pc=829;return;}
case 829:cyc+=4;and(A);
if(cyc>=evt){pc=830;return;}
case 830:cyc+=8;if(!fz){cyc+=4;pc=739;return;}
if(cyc>=evt){pc=832;return;}
case 832:cyc+=24;push(835);pc=14992;return;
if(cyc>=evt){pc=835;return;}
case 835:cyc+=8;A=16;
if(cyc>=evt){pc=837;return;}
case 837:cyc+=16;wr(49482,A);
if(cyc>=evt){pc=840;return;}
case 840:cyc+=24;push(843);pc=8304;return;
if(cyc>=evt){pc=843;return;}
case 843:cyc+=8;A=2;
pc=845;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 845:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=848;return;}
case 848:cyc+=12;H=106;L=87;
if(cyc>=evt){pc=851;return;}
case 851:cyc+=24;push(854);pc=8129;return;
if(cyc>=evt){pc=854;return;}
case 854:cyc+=12;D=128;E=0;
if(cyc>=evt){pc=857;return;}
case 857:cyc+=24;push(860);pc=4858;return;
if(cyc>=evt){pc=860;return;}
case 860:cyc+=8;A=5;
if(cyc>=evt){pc=862;return;}
case 862:cyc+=16;wr(49484,A);
if(cyc>=evt){pc=865;return;}
case 865:cyc+=24;push(868);pc=4990;return;
if(cyc>=evt){pc=868;return;}
case 868:cyc+=8;A=10;
if(cyc>=evt){pc=870;return;}
case 870:cyc+=16;wr(49425,A);
if(cyc>=evt){pc=873;return;}
case 873:cyc+=8;A=2;
if(cyc>=evt){pc=875;return;}
case 875:cyc+=16;wr(49426,A);
if(cyc>=evt){pc=878;return;}
case 878:cyc+=8;A=0;
if(cyc>=evt){pc=880;return;}
case 880:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=883;return;}
case 883:cyc+=8;A=2;
if(cyc>=evt){pc=885;return;}
case 885:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=888;return;}
case 888:cyc+=4;xor(A);
if(cyc>=evt){pc=889;return;}
case 889:cyc+=24;push(892);pc=7904;return;
if(cyc>=evt){pc=892;return;}
case 892:cyc+=24;push(895);pc=7894;return;
if(cyc>=evt){pc=895;return;}
case 895:cyc+=12;D=106;E=67;
if(cyc>=evt){pc=898;return;}
case 898:cyc+=12;H=154;L=128;
if(cyc>=evt){pc=901;return;}
case 901:cyc+=12;B=20;C=1;
if(cyc>=evt){pc=904;return;}
case 904:cyc+=24;push(907);pc=4922;return;
if(cyc>=evt){pc=907;return;}
case 907:cyc+=16;A=rd(49515);
if(cyc>=evt){pc=910;return;}
case 910:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=913;return;}
case 913:cyc+=12;H=153;L=35;
if(cyc>=evt){pc=916;return;}
case 916:cyc+=12;D=96;E=14;
if(cyc>=evt){pc=919;return;}
case 919:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=922;return;}
case 922:cyc+=8;cp(17);
if(cyc>=evt){pc=924;return;}
case 924:cyc+=8;if(!fz){cyc+=4;pc=929;return;}
if(cyc>=evt){pc=926;return;}
case 926:cyc+=12;D=64;E=240;
if(cyc>=evt){pc=929;return;}
case 929:cyc+=12;B=6;C=1;
if(cyc>=evt){pc=932;return;}
case 932:cyc+=24;push(935);pc=4953;return;
if(cyc>=evt){pc=935;return;}
case 935:cyc+=12;H=153;L=46;
if(cyc>=evt){pc=938;return;}
case 938:cyc+=4;A=E;
if(cyc>=evt){pc=939;return;}
case 939:cyc+=8;add(5);
if(cyc>=evt){pc=941;return;}
case 941:cyc+=4;E=A;
if(cyc>=evt){pc=942;return;}
case 942:cyc+=8;if(!fc){cyc+=4;pc=945;return;}
if(cyc>=evt){pc=944;return;}
case 944:cyc+=4;D=inc(D);
if(cyc>=evt){pc=945;return;}
case 945:cyc+=12;B=5;C=1;
if(cyc>=evt){pc=948;return;}
case 948:cyc+=24;push(951);pc=4953;return;
if(cyc>=evt){pc=951;return;}
case 951:cyc+=8;A=1;
if(cyc>=evt){pc=953;return;}
case 953:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=956;return;}
case 956:cyc+=16;A=rd(49419);
if(cyc>=evt){pc=959;return;}
case 959:cyc+=16;wr(49418,A);
if(cyc>=evt){pc=962;return;}
case 962:cyc+=24;push(965);pc=12071;return;
if(cyc>=evt){pc=965;return;}
case 965:cyc+=24;push(968);pc=7275;return;
if(cyc>=evt){pc=968;return;}
case 968:cyc+=24;push(971);pc=14031;return;
if(cyc>=evt){pc=971;return;}
case 971:cyc+=24;push(974);pc=8287;return;
if(cyc>=evt){pc=974;return;}
case 974:cyc+=24;push(977);pc=9234;return;
if(cyc>=evt){pc=977;return;}
case 977:cyc+=24;push(980);pc=12071;return;
if(cyc>=evt){pc=980;return;}
case 980:cyc+=24;push(983);pc=15014;return;
if(cyc>=evt){pc=983;return;}
case 983:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=986;return;}
case 986:cyc+=8;cp(104);
if(cyc>=evt){pc=988;return;}
case 988:cyc+=8;if(!fz){cyc+=4;pc=968;return;}
if(cyc>=evt){pc=990;return;}
case 990:cyc+=16;A=rd(49462);
if(cyc>=evt){pc=993;return;}
case 993:cyc+=4;and(A);
if(cyc>=evt){pc=994;return;}
case 994:cyc+=8;if(!fz){cyc+=4;pc=968;return;}
if(cyc>=evt){pc=996;return;}
case 996:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=999;return;}
case 999:cyc+=8;xor(1);
if(cyc>=evt){pc=1001;return;}
case 1001:cyc+=4;C=A;
if(cyc>=evt){pc=1002;return;}
case 1002:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=1005;return;}
case 1005:cyc+=8;cp(10);
if(cyc>=evt){pc=1007;return;}
case 1007:cyc+=8;if(fc){cyc+=4;pc=1010;return;}
if(cyc>=evt){pc=1009;return;}
case 1009:cyc+=4;C=inc(C);
if(cyc>=evt){pc=1010;return;}
case 1010:cyc+=8;cp(16);
if(cyc>=evt){pc=1012;return;}
case 1012:cyc+=8;if(fc){cyc+=4;pc=1015;return;}
if(cyc>=evt){pc=1014;return;}
case 1014:cyc+=4;C=inc(C);
if(cyc>=evt){pc=1015;return;}
case 1015:cyc+=4;A=C;
if(cyc>=evt){pc=1016;return;}
case 1016:cyc+=4;and(A);
if(cyc>=evt){pc=1017;return;}
case 1017:cyc+=8;if(fz){cyc+=4;pc=1020;return;}
if(cyc>=evt){pc=1019;return;}
case 1019:cyc+=4;A=dec(A);
if(cyc>=evt){pc=1020;return;}
case 1020:cyc+=16;wr(49623,A);
if(cyc>=evt){pc=1023;return;}
case 1023:cyc+=24;push(1026);pc=7434;return;
if(cyc>=evt){pc=1026;return;}
case 1026:cyc+=24;push(1029);pc=7524;return;
if(cyc>=evt){pc=1029;return;}
case 1029:cyc+=8;A=1;
if(cyc>=evt){pc=1031;return;}
case 1031:cyc+=16;wr(49496,A);
if(cyc>=evt){pc=1034;return;}
case 1034:cyc+=4;xor(A);
if(cyc>=evt){pc=1035;return;}
case 1035:cyc+=12;wr(65346,A);
if(cyc>=evt){pc=1037;return;}
case 1037:cyc+=8;C=0;
if(cyc>=evt){pc=1039;return;}
case 1039:cyc+=24;push(1042);pc=7722;return;
if(cyc>=evt){pc=1042;return;}
case 1042:cyc+=8;A=16;
if(cyc>=evt){pc=1044;return;}
case 1044:cyc+=24;push(1047);pc=14993;return;
if(cyc>=evt){pc=1047;return;}
case 1047:cyc+=24;push(1050);pc=7275;return;
if(cyc>=evt){pc=1050;return;}
case 1050:cyc+=24;push(1053);pc=8287;return;
if(cyc>=evt){pc=1053;return;}
case 1053:cyc+=12;if(!fz){cyc+=4;pc=1465;return;}
if(cyc>=evt){pc=1056;return;}
case 1056:cyc+=16;A=rd(49592);
if(cyc>=evt){pc=1059;return;}
case 1059:cyc+=4;and(A);
if(cyc>=evt){pc=1060;return;}
case 1060:cyc+=8;if(!fz){cyc+=4;pc=1050;return;}
if(cyc>=evt){pc=1062;return;}
case 1062:cyc+=4;xor(A);
if(cyc>=evt){pc=1063;return;}
case 1063:cyc+=16;wr(49482,A);
if(cyc>=evt){pc=1066;return;}
case 1066:cyc+=24;push(1069);pc=8304;return;
if(cyc>=evt){pc=1069;return;}
case 1069:cyc+=4;xor(A);
if(cyc>=evt){pc=1070;return;}
case 1070:cyc+=24;push(1073);pc=7904;return;
if(cyc>=evt){pc=1073;return;}
case 1073:cyc+=24;push(1076);pc=7894;return;
if(cyc>=evt){pc=1076;return;}
case 1076:cyc+=8;A=8;
if(cyc>=evt){pc=1078;return;}
case 1078:cyc+=16;wr(49425,A);
if(cyc>=evt){pc=1081;return;}
case 1081:cyc+=8;A=1;
if(cyc>=evt){pc=1083;return;}
case 1083:cyc+=16;wr(49423,A);
if(cyc>=evt){pc=1086;return;}
case 1086:cyc+=8;A=14;
if(cyc>=evt){pc=1088;return;}
case 1088:cyc+=24;push(1091);pc=14993;return;
if(cyc>=evt){pc=1091;return;}
case 1091:cyc+=16;A=rd(49419);
if(cyc>=evt){pc=1094;return;}
case 1094:cyc+=16;wr(49418,A);
if(cyc>=evt){pc=1097;return;}
case 1097:cyc+=24;push(1100);pc=12071;return;
if(cyc>=evt){pc=1100;return;}
case 1100:cyc+=24;push(1103);pc=7275;return;
if(cyc>=evt){pc=1103;return;}
case 1103:cyc+=24;push(1106);pc=14031;return;
if(cyc>=evt){pc=1106;return;}
case 1106:cyc+=24;push(1109);pc=8287;return;
if(cyc>=evt){pc=1109;return;}
case 1109:cyc+=12;if(!fz){cyc+=4;pc=1465;return;}
if(cyc>=evt){pc=1112;return;}
case 1112:cyc+=16;A=rd(49592);
if(cyc>=evt){pc=1115;return;}
case 1115:cyc+=4;and(A);
if(cyc>=evt){pc=1116;return;}
case 1116:cyc+=8;if(!fz){cyc+=4;pc=1103;return;}
if(cyc>=evt){pc=1118;return;}
case 1118:cyc+=4;xor(A);
if(cyc>=evt){pc=1119;return;}
case 1119:cyc+=16;wr(49418,A);
if(cyc>=evt){pc=1122;return;}
case 1122:cyc+=24;push(1125);pc=14031;return;
if(cyc>=evt){pc=1125;return;}
case 1125:cyc+=16;A=rd(49418);
if(cyc>=evt){pc=1128;return;}
case 1128:cyc+=8;cp(15);
if(cyc>=evt){pc=1130;return;}
case 1130:cyc+=8;if(!fz){cyc+=4;pc=1122;return;}
if(cyc>=evt){pc=1132;return;}
case 1132:cyc+=12;B=64;C=69;
if(cyc>=evt){pc=1135;return;}
case 1135:cyc+=24;push(1138);pc=15065;return;
if(cyc>=evt){pc=1138;return;}
case 1138:cyc+=24;push(1141);pc=14031;return;
if(cyc>=evt){pc=1141;return;}
case 1141:cyc+=16;A=rd(49418);
if(cyc>=evt){pc=1144;return;}
case 1144:cyc+=8;cp(90);
if(cyc>=evt){pc=1146;return;}
case 1146:cyc+=8;if(!fz){cyc+=4;pc=1138;return;}
if(cyc>=evt){pc=1148;return;}
case 1148:cyc+=8;A=165;
if(cyc>=evt){pc=1150;return;}
case 1150:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=1153;return;}
case 1153:cyc+=8;A=20;
if(cyc>=evt){pc=1155;return;}
case 1155:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=1158;return;}
case 1158:cyc+=8;A=1;
if(cyc>=evt){pc=1160;return;}
case 1160:cyc+=16;wr(49437,A);
if(cyc>=evt){pc=1163;return;}
case 1163:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=1166;return;}
case 1166:cyc+=8;A=170;
if(cyc>=evt){pc=1168;return;}
case 1168:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=1171;return;}
case 1171:cyc+=8;A=8;
if(cyc>=evt){pc=1173;return;}
case 1173:cyc+=24;push(1176);pc=14993;return;
if(cyc>=evt){pc=1176;return;}
case 1176:cyc+=24;push(1179);pc=14031;return;
if(cyc>=evt){pc=1179;return;}
case 1179:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=1182;return;}
case 1182:cyc+=4;and(A);
if(cyc>=evt){pc=1183;return;}
case 1183:cyc+=8;if(!fz){cyc+=4;pc=1309;return;}
if(cyc>=evt){pc=1185;return;}
case 1185:cyc+=24;push(1188);pc=12071;return;
if(cyc>=evt){pc=1188;return;}
case 1188:cyc+=24;push(1191);pc=14907;return;
if(cyc>=evt){pc=1191;return;}
case 1191:cyc+=8;if(!fz){cyc+=4;pc=1309;return;}
if(cyc>=evt){pc=1193;return;}
case 1193:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=1196;return;}
case 1196:cyc+=8;cp(11);
if(cyc>=evt){pc=1198;return;}
case 1198:cyc+=8;if(fc){cyc+=4;pc=1218;return;}
if(cyc>=evt){pc=1200;return;}
case 1200:cyc+=8;cp(17);
if(cyc>=evt){pc=1202;return;}
case 1202:cyc+=8;if(!fc){cyc+=4;pc=1211;return;}
if(cyc>=evt){pc=1204;return;}
case 1204:cyc+=16;A=rd(49595);
if(cyc>=evt){pc=1207;return;}
case 1207:cyc+=8;cp(1);
if(cyc>=evt){pc=1209;return;}
case 1209:cyc+=8;if(fc){cyc+=4;pc=1309;return;}
if(cyc>=evt){pc=1211;return;}
case 1211:cyc+=8;A=170;
if(cyc>=evt){pc=1213;return;}
case 1213:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=1216;return;}
case 1216:cyc+=12;pc=1309;return;
case 1218:cyc+=16;A=rd(49595);
if(cyc>=evt){pc=1221;return;}
case 1221:cyc+=8;cp(1);
if(cyc>=evt){pc=1223;return;}
case 1223:cyc+=8;if(!fz){cyc+=4;pc=1248;return;}
if(cyc>=evt){pc=1225;return;}
case 1225:cyc+=16;A=rd(49594);
if(cyc>=evt){pc=1228;return;}
case 1228:cyc+=8;cp(207);
if(cyc>=evt){pc=1230;return;}
case 1230:cyc+=8;if(!fz){cyc+=4;pc=1309;return;}
if(cyc>=evt){pc=1232;return;}
case 1232:cyc+=4;xor(A);
if(cyc>=evt){pc=1233;return;}
case 1233:cyc+=16;wr(49423,A);
if(cyc>=evt){pc=1236;return;}
case 1236:cyc+=8;A=166;
if(cyc>=evt){pc=1238;return;}
case 1238:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=1241;return;}
case 1241:cyc+=8;A=171;
if(cyc>=evt){pc=1243;return;}
case 1243:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=1246;return;}
case 1246:cyc+=12;pc=1309;return;
case 1248:cyc+=8;cp(2);
if(cyc>=evt){pc=1250;return;}
case 1250:cyc+=8;if(!fz){cyc+=4;pc=1266;return;}
if(cyc>=evt){pc=1252;return;}
case 1252:cyc+=16;A=rd(49594);
if(cyc>=evt){pc=1255;return;}
case 1255:cyc+=8;cp(72);
if(cyc>=evt){pc=1257;return;}
case 1257:cyc+=8;if(!fz){cyc+=4;pc=1309;return;}
if(cyc>=evt){pc=1259;return;}
case 1259:cyc+=8;A=169;
if(cyc>=evt){pc=1261;return;}
case 1261:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=1264;return;}
case 1264:cyc+=12;pc=1309;return;
case 1266:cyc+=8;cp(3);
if(cyc>=evt){pc=1268;return;}
case 1268:cyc+=8;if(!fz){cyc+=4;pc=1309;return;}
if(cyc>=evt){pc=1270;return;}
case 1270:cyc+=16;A=rd(49594);
if(cyc>=evt){pc=1273;return;}
case 1273:cyc+=8;cp(28);
if(cyc>=evt){pc=1275;return;}
case 1275:cyc+=8;if(!fz){cyc+=4;pc=1284;return;}
if(cyc>=evt){pc=1277;return;}
case 1277:cyc+=8;A=172;
if(cyc>=evt){pc=1279;return;}
case 1279:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=1282;return;}
case 1282:cyc+=12;pc=1309;return;
case 1284:cyc+=16;A=rd(49594);
if(cyc>=evt){pc=1287;return;}
case 1287:cyc+=8;cp(78);
if(cyc>=evt){pc=1289;return;}
case 1289:cyc+=8;if(!fz){cyc+=4;pc=1309;return;}
if(cyc>=evt){pc=1291;return;}
case 1291:cyc+=24;push(1294);pc=14162;return;
if(cyc>=evt){pc=1294;return;}
case 1294:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=1297;return;}
case 1297:cyc+=8;cp(17);
if(cyc>=evt){pc=1299;return;}
case 1299:cyc+=8;if(!fz){cyc+=4;pc=1306;return;}
if(cyc>=evt){pc=1301;return;}
case 1301:cyc+=8;A=4;
if(cyc>=evt){pc=1303;return;}
case 1303:cyc+=24;push(1306);pc=7904;return;
if(cyc>=evt){pc=1306;return;}
case 1306:cyc+=24;push(1309);pc=13729;return;
if(cyc>=evt){pc=1309;return;}
case 1309:cyc+=24;push(1312);pc=8287;return;
if(cyc>=evt){pc=1312;return;}
case 1312:cyc+=12;if(!fz){cyc+=4;pc=1465;return;}
if(cyc>=evt){pc=1315;return;}
case 1315:cyc+=16;A=rd(49592);
if(cyc>=evt){pc=1318;return;}
case 1318:cyc+=4;and(A);
if(cyc>=evt){pc=1319;return;}
case 1319:cyc+=12;if(!fz){cyc+=4;pc=1176;return;}
if(cyc>=evt){pc=1322;return;}
case 1322:cyc+=8;A=5;
if(cyc>=evt){pc=1324;return;}
case 1324:cyc+=24;push(1327);pc=14993;return;
if(cyc>=evt){pc=1327;return;}
case 1327:cyc+=8;A=174;
if(cyc>=evt){pc=1329;return;}
case 1329:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=1332;return;}
case 1332:cyc+=24;push(1335);pc=14031;return;
if(cyc>=evt){pc=1335;return;}
case 1335:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=1338;return;}
case 1338:cyc+=4;and(A);
if(cyc>=evt){pc=1339;return;}
case 1339:cyc+=8;if(!fz){cyc+=4;pc=1344;return;}
if(cyc>=evt){pc=1341;return;}
case 1341:cyc+=24;push(1344);pc=12071;return;
if(cyc>=evt){pc=1344;return;}
case 1344:cyc+=24;push(1347);pc=8287;return;
if(cyc>=evt){pc=1347;return;}
case 1347:cyc+=8;if(!fz){cyc+=4;pc=1465;return;}
if(cyc>=evt){pc=1349;return;}
case 1349:cyc+=16;A=rd(49595);
if(cyc>=evt){pc=1352;return;}
case 1352:cyc+=8;cp(0);
if(cyc>=evt){pc=1354;return;}
case 1354:cyc+=8;if(!fz){cyc+=4;pc=1332;return;}
if(cyc>=evt){pc=1356;return;}
case 1356:cyc+=16;A=rd(49594);
if(cyc>=evt){pc=1359;return;}
case 1359:cyc+=8;cp(180);
if(cyc>=evt){pc=1361;return;}
case 1361:cyc+=8;if(!fz){cyc+=4;pc=1332;return;}
if(cyc>=evt){pc=1363;return;}
case 1363:cyc+=8;A=175;
if(cyc>=evt){pc=1365;return;}
case 1365:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=1368;return;}
case 1368:cyc+=24;push(1371);pc=14031;return;
if(cyc>=evt){pc=1371;return;}
case 1371:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=1374;return;}
case 1374:cyc+=4;and(A);
if(cyc>=evt){pc=1375;return;}
case 1375:cyc+=8;if(!fz){cyc+=4;pc=1413;return;}
if(cyc>=evt){pc=1377;return;}
case 1377:cyc+=24;push(1380);pc=12071;return;
pc=1380;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 1380:cyc+=24;push(1383);pc=14907;return;
if(cyc>=evt){pc=1383;return;}
case 1383:cyc+=8;if(!fz){cyc+=4;pc=1413;return;}
if(cyc>=evt){pc=1385;return;}
case 1385:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=1388;return;}
case 1388:cyc+=8;cp(20);
if(cyc>=evt){pc=1390;return;}
case 1390:cyc+=8;if(!fc){cyc+=4;pc=1413;return;}
if(cyc>=evt){pc=1392;return;}
case 1392:cyc+=4;xor(A);
if(cyc>=evt){pc=1393;return;}
case 1393:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=1396;return;}
case 1396:cyc+=8;A=170;
if(cyc>=evt){pc=1398;return;}
case 1398:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=1401;return;}
case 1401:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=1404;return;}
case 1404:cyc+=8;cp(18);
if(cyc>=evt){pc=1406;return;}
case 1406:cyc+=8;if(fc){cyc+=4;pc=1413;return;}
if(cyc>=evt){pc=1408;return;}
case 1408:cyc+=8;A=167;
if(cyc>=evt){pc=1410;return;}
case 1410:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=1413;return;}
case 1413:cyc+=24;push(1416);pc=8287;return;
if(cyc>=evt){pc=1416;return;}
case 1416:cyc+=8;if(!fz){cyc+=4;pc=1465;return;}
if(cyc>=evt){pc=1418;return;}
case 1418:cyc+=16;A=rd(49595);
if(cyc>=evt){pc=1421;return;}
case 1421:cyc+=8;cp(3);
if(cyc>=evt){pc=1423;return;}
case 1423:cyc+=8;if(!fz){cyc+=4;pc=1368;return;}
if(cyc>=evt){pc=1425;return;}
case 1425:cyc+=16;A=rd(49594);
if(cyc>=evt){pc=1428;return;}
case 1428:cyc+=8;cp(64);
if(cyc>=evt){pc=1430;return;}
case 1430:cyc+=8;if(!fz){cyc+=4;pc=1368;return;}
if(cyc>=evt){pc=1432;return;}
case 1432:cyc+=24;push(1435);pc=7434;return;
if(cyc>=evt){pc=1435;return;}
case 1435:cyc+=24;push(1438);pc=7524;return;
if(cyc>=evt){pc=1438;return;}
case 1438:cyc+=8;A=1;
if(cyc>=evt){pc=1440;return;}
case 1440:cyc+=16;wr(49496,A);
if(cyc>=evt){pc=1443;return;}
case 1443:cyc+=4;xor(A);
if(cyc>=evt){pc=1444;return;}
case 1444:cyc+=12;wr(65346,A);
if(cyc>=evt){pc=1446;return;}
case 1446:cyc+=8;C=1;
if(cyc>=evt){pc=1448;return;}
case 1448:cyc+=24;push(1451);pc=7722;return;
if(cyc>=evt){pc=1451;return;}
case 1451:cyc+=24;push(1454);pc=7275;return;
if(cyc>=evt){pc=1454;return;}
case 1454:cyc+=24;push(1457);pc=8287;return;
if(cyc>=evt){pc=1457;return;}
case 1457:cyc+=8;if(!fz){cyc+=4;pc=1465;return;}
if(cyc>=evt){pc=1459;return;}
case 1459:cyc+=16;A=rd(49592);
if(cyc>=evt){pc=1462;return;}
case 1462:cyc+=4;and(A);
if(cyc>=evt){pc=1463;return;}
case 1463:cyc+=8;if(!fz){cyc+=4;pc=1454;return;}
if(cyc>=evt){pc=1465;return;}
case 1465:if(GK[1465]){pc=1465;if(ghooks[1465]())return;}
cyc+=24;push(1468);pc=14992;return;
if(cyc>=evt){pc=1468;return;}
case 1468:cyc+=8;A=16;
if(cyc>=evt){pc=1470;return;}
case 1470:cyc+=16;wr(49482,A);
if(cyc>=evt){pc=1473;return;}
case 1473:cyc+=4;xor(A);
if(cyc>=evt){pc=1474;return;}
case 1474:cyc+=16;wr(49481,A);
if(cyc>=evt){pc=1477;return;}
case 1477:cyc+=24;push(1480);pc=8304;return;
if(cyc>=evt){pc=1480;return;}
case 1480:cyc+=4;xor(A);
if(cyc>=evt){pc=1481;return;}
case 1481:cyc+=16;wr(49484,A);
if(cyc>=evt){pc=1484;return;}
case 1484:cyc+=24;push(1487);pc=4990;return;
if(cyc>=evt){pc=1487;return;}
case 1487:cyc+=8;A=8;
if(cyc>=evt){pc=1489;return;}
case 1489:cyc+=16;wr(49425,A);
if(cyc>=evt){pc=1492;return;}
case 1492:cyc+=8;A=0;
if(cyc>=evt){pc=1494;return;}
case 1494:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=1497;return;}
case 1497:cyc+=8;A=2;
if(cyc>=evt){pc=1499;return;}
case 1499:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=1502;return;}
case 1502:cyc+=4;xor(A);
if(cyc>=evt){pc=1503;return;}
case 1503:cyc+=24;push(1506);pc=7904;return;
if(cyc>=evt){pc=1506;return;}
case 1506:cyc+=24;push(1509);pc=7894;return;
if(cyc>=evt){pc=1509;return;}
case 1509:cyc+=12;D=105;E=235;
if(cyc>=evt){pc=1512;return;}
case 1512:cyc+=12;H=154;L=128;
if(cyc>=evt){pc=1515;return;}
case 1515:cyc+=12;B=3;C=1;
if(cyc>=evt){pc=1518;return;}
case 1518:cyc+=24;push(1521);pc=4922;return;
if(cyc>=evt){pc=1521;return;}
case 1521:cyc+=12;D=105;E=236;
if(cyc>=evt){pc=1524;return;}
case 1524:cyc+=12;H=154;L=145;
if(cyc>=evt){pc=1527;return;}
case 1527:cyc+=12;B=3;C=1;
if(cyc>=evt){pc=1530;return;}
case 1530:cyc+=24;push(1533);pc=4922;return;
if(cyc>=evt){pc=1533;return;}
case 1533:cyc+=12;D=106;E=47;
if(cyc>=evt){pc=1536;return;}
case 1536:cyc+=12;H=154;L=160;
if(cyc>=evt){pc=1539;return;}
case 1539:cyc+=12;B=20;C=1;
if(cyc>=evt){pc=1542;return;}
case 1542:cyc+=24;push(1545);pc=4922;return;
if(cyc>=evt){pc=1545;return;}
case 1545:cyc+=16;A=rd(49515);
if(cyc>=evt){pc=1548;return;}
case 1548:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=1551;return;}
case 1551:cyc+=12;H=153;L=39;
if(cyc>=evt){pc=1554;return;}
case 1554:cyc+=12;D=96;E=34;
if(cyc>=evt){pc=1557;return;}
case 1557:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=1560;return;}
case 1560:cyc+=8;cp(17);
if(cyc>=evt){pc=1562;return;}
case 1562:cyc+=8;if(!fz){cyc+=4;pc=1567;return;}
if(cyc>=evt){pc=1564;return;}
case 1564:cyc+=12;D=65;E=4;
if(cyc>=evt){pc=1567;return;}
case 1567:cyc+=12;B=6;C=1;
if(cyc>=evt){pc=1570;return;}
case 1570:cyc+=24;push(1573);pc=4953;return;
if(cyc>=evt){pc=1573;return;}
case 1573:cyc+=8;A=1;
if(cyc>=evt){pc=1575;return;}
case 1575:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=1578;return;}
case 1578:cyc+=16;A=rd(49419);
if(cyc>=evt){pc=1581;return;}
case 1581:cyc+=16;wr(49418,A);
if(cyc>=evt){pc=1584;return;}
case 1584:cyc+=24;push(1587);pc=12071;return;
if(cyc>=evt){pc=1587;return;}
case 1587:cyc+=24;push(1590);pc=7275;return;
if(cyc>=evt){pc=1590;return;}
case 1590:cyc+=24;push(1593);pc=14031;return;
if(cyc>=evt){pc=1593;return;}
case 1593:cyc+=24;push(1596);pc=8287;return;
if(cyc>=evt){pc=1596;return;}
case 1596:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=1598;return;}
case 1598:cyc+=8;fz=(A>>4)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=1600;return;}
case 1600:cyc+=8;if(!fz){cyc+=4;pc=1674;return;}
if(cyc>=evt){pc=1602;return;}
case 1602:cyc+=8;fz=(A>>5)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=1604;return;}
case 1604:cyc+=8;if(!fz){cyc+=4;pc=1649;return;}
if(cyc>=evt){pc=1606;return;}
case 1606:cyc+=8;fz=(A>>6)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=1608;return;}
case 1608:cyc+=8;if(!fz){cyc+=4;pc=1615;return;}
if(cyc>=evt){pc=1610;return;}
case 1610:cyc+=24;push(1613);pc=15014;return;
if(cyc>=evt){pc=1613;return;}
case 1613:cyc+=12;pc=1590;return;
case 1615:cyc+=8;A=104;
if(cyc>=evt){pc=1617;return;}
case 1617:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=1620;return;}
case 1620:cyc+=24;push(1623);pc=14031;return;
if(cyc>=evt){pc=1623;return;}
case 1623:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=1626;return;}
case 1626:cyc+=4;and(A);
if(cyc>=evt){pc=1627;return;}
case 1627:cyc+=12;if(fz){cyc+=12;push(1630);pc=12071;return;}
if(cyc>=evt){pc=1630;return;}
case 1630:cyc+=24;push(1633);pc=14912;return;
if(cyc>=evt){pc=1633;return;}
case 1633:cyc+=8;if(!fz){cyc+=4;pc=1615;return;}
if(cyc>=evt){pc=1635;return;}
case 1635:cyc+=8;A=16;
if(cyc>=evt){pc=1637;return;}
case 1637:cyc+=16;wr(49481,A);
if(cyc>=evt){pc=1640;return;}
case 1640:cyc+=16;wr(49482,A);
if(cyc>=evt){pc=1643;return;}
case 1643:cyc+=24;push(1646);pc=8304;return;
if(cyc>=evt){pc=1646;return;}
case 1646:cyc+=16;pc=2060;return;
case 1649:cyc+=8;A=1;
if(cyc>=evt){pc=1651;return;}
case 1651:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=1654;return;}
case 1654:cyc+=24;push(1657);pc=14031;return;
if(cyc>=evt){pc=1657;return;}
case 1657:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=1660;return;}
case 1660:cyc+=4;and(A);
if(cyc>=evt){pc=1661;return;}
case 1661:cyc+=12;if(fz){cyc+=12;push(1664);pc=12071;return;}
if(cyc>=evt){pc=1664;return;}
case 1664:cyc+=24;push(1667);pc=14912;return;
if(cyc>=evt){pc=1667;return;}
case 1667:cyc+=8;if(!fz){cyc+=4;pc=1654;return;}
if(cyc>=evt){pc=1669;return;}
case 1669:cyc+=8;A=1;
if(cyc>=evt){pc=1671;return;}
case 1671:cyc+=16;wr(49423,A);
if(cyc>=evt){pc=1674;return;}
case 1674:cyc+=24;push(1677);pc=14031;return;
if(cyc>=evt){pc=1677;return;}
case 1677:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=1680;return;}
case 1680:cyc+=4;and(A);
if(cyc>=evt){pc=1681;return;}
case 1681:cyc+=12;if(fz){cyc+=12;push(1684);pc=12071;return;}
if(cyc>=evt){pc=1684;return;}
case 1684:cyc+=16;A=rd(49497);
if(cyc>=evt){pc=1687;return;}
case 1687:cyc+=4;and(A);
if(cyc>=evt){pc=1688;return;}
case 1688:cyc+=8;if(!fz){cyc+=4;pc=1701;return;}
if(cyc>=evt){pc=1690;return;}
case 1690:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=1693;return;}
case 1693:cyc+=4;and(A);
if(cyc>=evt){pc=1694;return;}
case 1694:cyc+=8;if(!fz){cyc+=4;pc=1701;return;}
if(cyc>=evt){pc=1696;return;}
case 1696:cyc+=24;push(1699);pc=14678;return;
if(cyc>=evt){pc=1699;return;}
case 1699:cyc+=12;pc=1674;return;
case 1701:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=1704;return;}
case 1704:cyc+=4;and(A);
if(cyc>=evt){pc=1705;return;}
case 1705:cyc+=12;if(fz){cyc+=4;pc=2060;return;}
if(cyc>=evt){pc=1708;return;}
case 1708:cyc+=24;push(1711);pc=4990;return;
if(cyc>=evt){pc=1711;return;}
case 1711:cyc+=8;A=8;
if(cyc>=evt){pc=1713;return;}
case 1713:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=1716;return;}
case 1716:cyc+=24;push(1719);pc=13926;return;
if(cyc>=evt){pc=1719;return;}
case 1719:cyc+=24;push(1722);pc=14031;return;
if(cyc>=evt){pc=1722;return;}
case 1722:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=1725;return;}
case 1725:cyc+=4;and(A);
if(cyc>=evt){pc=1726;return;}
case 1726:cyc+=12;if(fz){cyc+=12;push(1729);pc=12071;return;}
if(cyc>=evt){pc=1729;return;}
case 1729:cyc+=24;push(1732);pc=14912;return;
if(cyc>=evt){pc=1732;return;}
case 1732:cyc+=8;if(!fz){cyc+=4;pc=1719;return;}
if(cyc>=evt){pc=1734;return;}
case 1734:cyc+=24;push(1737);pc=14707;return;
if(cyc>=evt){pc=1737;return;}
case 1737:cyc+=24;push(1740);pc=14031;return;
if(cyc>=evt){pc=1740;return;}
case 1740:cyc+=24;push(1743);pc=4739;return;
if(cyc>=evt){pc=1743;return;}
case 1743:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=1746;return;}
case 1746:cyc+=12;A=rd(65420);
if(cyc>=evt){pc=1748;return;}
case 1748:cyc+=8;fz=(A>>4)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=1750;return;}
case 1750:cyc+=8;if(fz){cyc+=4;pc=1753;return;}
if(cyc>=evt){pc=1752;return;}
case 1752:cyc+=4;C=inc(C);
if(cyc>=evt){pc=1753;return;}
case 1753:cyc+=8;fz=(A>>5)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=1755;return;}
case 1755:cyc+=8;if(fz){cyc+=4;pc=1758;return;}
if(cyc>=evt){pc=1757;return;}
case 1757:cyc+=4;C=dec(C);
if(cyc>=evt){pc=1758;return;}
case 1758:cyc+=8;fz=(A>>6)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=1760;return;}
case 1760:cyc+=8;if(fz){cyc+=4;pc=1763;return;}
if(cyc>=evt){pc=1762;return;}
case 1762:cyc+=4;B=inc(B);
if(cyc>=evt){pc=1763;return;}
case 1763:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=1765;return;}
case 1765:cyc+=8;if(fz){cyc+=4;pc=1768;return;}
if(cyc>=evt){pc=1767;return;}
case 1767:cyc+=4;B=dec(B);
if(cyc>=evt){pc=1768;return;}
case 1768:cyc+=8;and(12);
if(cyc>=evt){pc=1770;return;}
case 1770:cyc+=8;if(!fz){cyc+=4;pc=1821;return;}
if(cyc>=evt){pc=1772;return;}
case 1772:cyc+=24;push(1775);pc=15014;return;
if(cyc>=evt){pc=1775;return;}
case 1775:cyc+=16;A=rd(49612);
if(cyc>=evt){pc=1778;return;}
case 1778:cyc+=4;add(C);
if(cyc>=evt){pc=1779;return;}
case 1779:cyc+=8;cp(8);
if(cyc>=evt){pc=1781;return;}
case 1781:cyc+=8;if(!fc){cyc+=4;pc=1737;return;}
if(cyc>=evt){pc=1783;return;}
case 1783:cyc+=16;wr(49612,A);
if(cyc>=evt){pc=1786;return;}
case 1786:cyc+=12;H=193;L=196;
if(cyc>=evt){pc=1789;return;}
case 1789:cyc+=4;add(L);
if(cyc>=evt){pc=1790;return;}
case 1790:cyc+=4;L=A;
if(cyc>=evt){pc=1791;return;}
case 1791:cyc+=8;if(!fc){cyc+=4;pc=1794;return;}
if(cyc>=evt){pc=1793;return;}
case 1793:cyc+=4;H=inc(H);
if(cyc>=evt){pc=1794;return;}
case 1794:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=1795;return;}
case 1795:cyc+=4;add(B);
if(cyc>=evt){pc=1796;return;}
case 1796:cyc+=8;cp(10);
if(cyc>=evt){pc=1798;return;}
case 1798:cyc+=8;if(fc){cyc+=4;pc=1808;return;}
if(cyc>=evt){pc=1800;return;}
case 1800:cyc+=8;add(10);
if(cyc>=evt){pc=1802;return;}
case 1802:cyc+=8;cp(10);
if(cyc>=evt){pc=1804;return;}
case 1804:cyc+=8;if(fc){cyc+=4;pc=1808;return;}
if(cyc>=evt){pc=1806;return;}
case 1806:cyc+=8;sub(20);
if(cyc>=evt){pc=1808;return;}
case 1808:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=1809;return;}
case 1809:cyc+=8;fz=(C>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=1811;return;}
case 1811:cyc+=12;if(!fz){cyc+=12;push(1814);pc=14707;return;}
if(cyc>=evt){pc=1814;return;}
case 1814:cyc+=8;fz=(B>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=1816;return;}
case 1816:cyc+=12;if(!fz){cyc+=12;push(1819);pc=13951;return;}
if(cyc>=evt){pc=1819;return;}
case 1819:cyc+=12;pc=1737;return;
case 1821:cyc+=24;push(1824);pc=14992;return;
if(cyc>=evt){pc=1824;return;}
case 1824:cyc+=8;A=13;
if(cyc>=evt){pc=1826;return;}
case 1826:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=1829;return;}
case 1829:cyc+=12;B=1;C=17;
if(cyc>=evt){pc=1832;return;}
case 1832:cyc+=8;E=1;
if(cyc>=evt){pc=1834;return;}
case 1834:cyc+=24;push(1837);pc=11964;return;
if(cyc>=evt){pc=1837;return;}
case 1837:cyc+=24;push(1840);pc=4990;return;
if(cyc>=evt){pc=1840;return;}
case 1840:cyc+=24;push(1843);pc=14031;return;
if(cyc>=evt){pc=1843;return;}
case 1843:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=1846;return;}
case 1846:cyc+=4;and(A);
if(cyc>=evt){pc=1847;return;}
case 1847:cyc+=12;if(fz){cyc+=12;push(1850);pc=12071;return;}
if(cyc>=evt){pc=1850;return;}
case 1850:cyc+=24;push(1853);pc=14912;return;
if(cyc>=evt){pc=1853;return;}
case 1853:cyc+=8;if(!fz){cyc+=4;pc=1840;return;}
if(cyc>=evt){pc=1855;return;}
case 1855:cyc+=24;push(1858);pc=14801;return;
if(cyc>=evt){pc=1858;return;}
case 1858:cyc+=12;if(!fz){cyc+=4;pc=2020;return;}
if(cyc>=evt){pc=1861;return;}
case 1861:cyc+=12;H=193;L=196;
if(cyc>=evt){pc=1864;return;}
case 1864:cyc+=12;B=0;C=11;
if(cyc>=evt){pc=1867;return;}
case 1867:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=1868;return;}
case 1868:cyc+=4;add(C);
if(cyc>=evt){pc=1869;return;}
case 1869:cyc+=4;C=A;
if(cyc>=evt){pc=1870;return;}
case 1870:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=1871;return;}
case 1871:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=1872;return;}
case 1872:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=1873;return;}
case 1873:cyc+=8;cp(2);
if(cyc>=evt){pc=1875;return;}
case 1875:cyc+=12;if(fc){cyc+=4;pc=2020;return;}
if(cyc>=evt){pc=1878;return;}
case 1878:cyc+=8;cp(15);
if(cyc>=evt){pc=1880;return;}
case 1880:cyc+=12;if(!fc){cyc+=4;pc=2020;return;}
if(cyc>=evt){pc=1883;return;}
case 1883:cyc+=8;cp(7);
if(cyc>=evt){pc=1885;return;}
case 1885:cyc+=12;if(fz){cyc+=4;pc=2020;return;}
if(cyc>=evt){pc=1888;return;}
case 1888:cyc+=16;wr(49481,A);
if(cyc>=evt){pc=1891;return;}
case 1891:cyc+=12;B=0;C=11;
if(cyc>=evt){pc=1894;return;}
case 1894:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=1895;return;}
case 1895:cyc+=4;add(C);
if(cyc>=evt){pc=1896;return;}
case 1896:cyc+=4;C=A;
if(cyc>=evt){pc=1897;return;}
case 1897:cyc+=8;A=rd(B<<8|C);
pc=1898;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 1898:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=1899;return;}
case 1899:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=1900;return;}
case 1900:cyc+=4;and(A);
if(cyc>=evt){pc=1901;return;}
case 1901:cyc+=8;if(fz){cyc+=4;pc=2020;return;}
if(cyc>=evt){pc=1903;return;}
case 1903:cyc+=8;cp(60);
if(cyc>=evt){pc=1905;return;}
case 1905:cyc+=8;if(!fc){cyc+=4;pc=2020;return;}
if(cyc>=evt){pc=1907;return;}
case 1907:cyc+=16;wr(49507,A);
if(cyc>=evt){pc=1910;return;}
case 1910:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=1911;return;}
case 1911:cyc+=16;wr(49502,A);
if(cyc>=evt){pc=1914;return;}
case 1914:cyc+=8;cp(3);
if(cyc>=evt){pc=1916;return;}
case 1916:cyc+=8;if(fc){cyc+=4;pc=2020;return;}
if(cyc>=evt){pc=1918;return;}
case 1918:cyc+=4;xor(A);
if(cyc>=evt){pc=1919;return;}
case 1919:cyc+=16;wr(49508,A);
if(cyc>=evt){pc=1922;return;}
case 1922:cyc+=24;push(1925);pc=14031;return;
if(cyc>=evt){pc=1925;return;}
case 1925:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=1928;return;}
case 1928:cyc+=4;and(A);
if(cyc>=evt){pc=1929;return;}
case 1929:cyc+=12;if(fz){cyc+=12;push(1932);pc=12071;return;}
if(cyc>=evt){pc=1932;return;}
case 1932:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=1935;return;}
case 1935:cyc+=8;cp(13);
if(cyc>=evt){pc=1937;return;}
case 1937:cyc+=8;if(fc){cyc+=4;pc=1944;return;}
if(cyc>=evt){pc=1939;return;}
case 1939:cyc+=24;push(1942);pc=14678;return;
if(cyc>=evt){pc=1942;return;}
case 1942:cyc+=12;pc=1922;return;
case 1944:cyc+=12;B=1;C=12;
if(cyc>=evt){pc=1947;return;}
case 1947:cyc+=8;E=0;
if(cyc>=evt){pc=1949;return;}
case 1949:cyc+=24;push(1952);pc=12020;return;
if(cyc>=evt){pc=1952;return;}
case 1952:cyc+=24;push(1955);pc=4990;return;
if(cyc>=evt){pc=1955;return;}
case 1955:cyc+=12;B=64;C=69;
if(cyc>=evt){pc=1958;return;}
case 1958:cyc+=24;push(1961);pc=15065;return;
if(cyc>=evt){pc=1961;return;}
case 1961:cyc+=24;push(1964);pc=14031;return;
if(cyc>=evt){pc=1964;return;}
case 1964:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=1967;return;}
case 1967:cyc+=4;and(A);
if(cyc>=evt){pc=1968;return;}
case 1968:cyc+=12;if(fz){cyc+=12;push(1971);pc=12071;return;}
if(cyc>=evt){pc=1971;return;}
case 1971:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=1974;return;}
case 1974:cyc+=8;cp(7);
if(cyc>=evt){pc=1976;return;}
case 1976:cyc+=8;if(fc){cyc+=4;pc=1983;return;}
if(cyc>=evt){pc=1978;return;}
case 1978:cyc+=24;push(1981);pc=14678;return;
if(cyc>=evt){pc=1981;return;}
case 1981:cyc+=12;pc=1961;return;
case 1983:cyc+=4;xor(A);
if(cyc>=evt){pc=1984;return;}
case 1984:cyc+=16;wr(49423,A);
if(cyc>=evt){pc=1987;return;}
case 1987:cyc+=8;A=104;
if(cyc>=evt){pc=1989;return;}
case 1989:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=1992;return;}
case 1992:cyc+=8;A=13;
if(cyc>=evt){pc=1994;return;}
case 1994:cyc+=24;push(1997);pc=14993;return;
if(cyc>=evt){pc=1997;return;}
case 1997:cyc+=24;push(2000);pc=14031;return;
if(cyc>=evt){pc=2000;return;}
case 2000:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=2003;return;}
case 2003:cyc+=4;and(A);
if(cyc>=evt){pc=2004;return;}
case 2004:cyc+=12;if(fz){cyc+=12;push(2007);pc=12071;return;}
if(cyc>=evt){pc=2007;return;}
case 2007:cyc+=24;push(2010);pc=8287;return;
if(cyc>=evt){pc=2010;return;}
case 2010:cyc+=8;if(!fz){cyc+=4;pc=2096;return;}
if(cyc>=evt){pc=2012;return;}
case 2012:cyc+=16;A=rd(49592);
if(cyc>=evt){pc=2015;return;}
case 2015:cyc+=4;and(A);
if(cyc>=evt){pc=2016;return;}
case 2016:cyc+=8;if(!fz){cyc+=4;pc=1997;return;}
if(cyc>=evt){pc=2018;return;}
case 2018:cyc+=12;pc=2096;return;
case 2020:cyc+=8;A=17;
if(cyc>=evt){pc=2022;return;}
case 2022:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=2025;return;}
case 2025:cyc+=24;push(2028);pc=14031;return;
if(cyc>=evt){pc=2028;return;}
case 2028:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=2031;return;}
case 2031:cyc+=4;and(A);
if(cyc>=evt){pc=2032;return;}
case 2032:cyc+=12;if(fz){cyc+=12;push(2035);pc=12071;return;}
if(cyc>=evt){pc=2035;return;}
case 2035:cyc+=24;push(2038);pc=14912;return;
if(cyc>=evt){pc=2038;return;}
case 2038:cyc+=8;if(!fz){cyc+=4;pc=2025;return;}
if(cyc>=evt){pc=2040;return;}
case 2040:cyc+=8;A=7;
if(cyc>=evt){pc=2042;return;}
case 2042:cyc+=24;push(2045);pc=14993;return;
if(cyc>=evt){pc=2045;return;}
case 2045:cyc+=24;push(2048);pc=14031;return;
if(cyc>=evt){pc=2048;return;}
case 2048:cyc+=24;push(2051);pc=4739;return;
if(cyc>=evt){pc=2051;return;}
case 2051:cyc+=12;A=rd(65420);
if(cyc>=evt){pc=2053;return;}
case 2053:cyc+=8;and(15);
if(cyc>=evt){pc=2055;return;}
case 2055:cyc+=8;if(fz){cyc+=4;pc=2045;return;}
if(cyc>=evt){pc=2057;return;}
case 2057:cyc+=16;pc=336;return;
case 2060:cyc+=8;A=3;
if(cyc>=evt){pc=2062;return;}
case 2062:cyc+=16;wr(49502,A);
if(cyc>=evt){pc=2065;return;}
case 2065:cyc+=4;xor(A);
if(cyc>=evt){pc=2066;return;}
case 2066:cyc+=16;wr(49508,A);
if(cyc>=evt){pc=2069;return;}
case 2069:cyc+=4;xor(A);
if(cyc>=evt){pc=2070;return;}
case 2070:cyc+=16;wr(49512,A);
if(cyc>=evt){pc=2073;return;}
case 2073:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=2076;return;}
case 2076:cyc+=4;A=inc(A);
if(cyc>=evt){pc=2077;return;}
case 2077:cyc+=16;wr(49481,A);
if(cyc>=evt){pc=2080;return;}
case 2080:cyc+=8;cp(17);
if(cyc>=evt){pc=2082;return;}
case 2082:cyc+=8;if(fc){cyc+=4;pc=2096;return;}
if(cyc>=evt){pc=2084;return;}
case 2084:cyc+=8;cp(19);
if(cyc>=evt){pc=2086;return;}
case 2086:cyc+=12;if(!fc){cyc+=4;pc=1465;return;}
if(cyc>=evt){pc=2089;return;}
case 2089:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=2092;return;}
case 2092:cyc+=4;or(A);
if(cyc>=evt){pc=2093;return;}
case 2093:cyc+=12;if(fz){cyc+=4;pc=1465;return;}
if(cyc>=evt){pc=2096;return;}
case 2096:cyc+=4;xor(A);
if(cyc>=evt){pc=2097;return;}
case 2097:cyc+=16;wr(49420,A);
if(cyc>=evt){pc=2100;return;}
case 2100:cyc+=16;wr(49421,A);
if(cyc>=evt){pc=2103;return;}
case 2103:cyc+=16;wr(49593,A);
if(cyc>=evt){pc=2106;return;}
case 2106:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=2109;return;}
case 2109:cyc+=16;wr(49482,A);
if(cyc>=evt){pc=2112;return;}
case 2112:cyc+=24;push(2115);pc=8304;return;
if(cyc>=evt){pc=2115;return;}
case 2115:cyc+=24;push(2118);pc=7275;return;
if(cyc>=evt){pc=2118;return;}
case 2118:cyc+=16;A=rd(49419);
if(cyc>=evt){pc=2121;return;}
case 2121:cyc+=16;wr(49418,A);
if(cyc>=evt){pc=2124;return;}
case 2124:cyc+=16;A=rd(49497);
if(cyc>=evt){pc=2127;return;}
case 2127:cyc+=4;and(A);
if(cyc>=evt){pc=2128;return;}
case 2128:cyc+=12;if(!fz){cyc+=12;push(2131);pc=4990;return;}
if(cyc>=evt){pc=2131;return;}
case 2131:cyc+=24;push(2134);pc=8287;return;
if(cyc>=evt){pc=2134;return;}
case 2134:cyc+=16;A=rd(49510);
if(cyc>=evt){pc=2137;return;}
case 2137:cyc+=4;and(A);
if(cyc>=evt){pc=2138;return;}
case 2138:cyc+=8;if(fz){cyc+=4;pc=2161;return;}
if(cyc>=evt){pc=2140;return;}
case 2140:cyc+=8;cp(1);
if(cyc>=evt){pc=2142;return;}
case 2142:cyc+=8;if(fz){cyc+=4;pc=2153;return;}
if(cyc>=evt){pc=2144;return;}
case 2144:cyc+=8;cp(5);
if(cyc>=evt){pc=2146;return;}
case 2146:cyc+=8;if(!fc){cyc+=4;pc=2216;return;}
if(cyc>=evt){pc=2148;return;}
case 2148:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=2150;return;}
case 2150:cyc+=4;and(A);
if(cyc>=evt){pc=2151;return;}
case 2151:cyc+=8;if(fz){cyc+=4;pc=2216;return;}
if(cyc>=evt){pc=2153;return;}
case 2153:cyc+=8;A=1;
if(cyc>=evt){pc=2155;return;}
case 2155:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=2158;return;}
case 2158:cyc+=16;wr(49499,A);
if(cyc>=evt){pc=2161;return;}
case 2161:cyc+=16;A=rd(49498);
if(cyc>=evt){pc=2164;return;}
case 2164:cyc+=4;and(A);
if(cyc>=evt){pc=2165;return;}
case 2165:cyc+=12;if(!fz){cyc+=12;push(2168);pc=13527;return;}
if(cyc>=evt){pc=2168;return;}
case 2168:cyc+=16;A=rd(49499);
if(cyc>=evt){pc=2171;return;}
case 2171:cyc+=4;and(A);
if(cyc>=evt){pc=2172;return;}
case 2172:cyc+=12;if(!fz){cyc+=12;push(2175);pc=13729;return;}
if(cyc>=evt){pc=2175;return;}
case 2175:cyc+=16;A=rd(49507);
if(cyc>=evt){pc=2178;return;}
case 2178:cyc+=4;and(A);
if(cyc>=evt){pc=2179;return;}
case 2179:cyc+=8;if(!fz){cyc+=4;pc=2216;return;}
if(cyc>=evt){pc=2181;return;}
case 2181:if(GK[2181]){pc=2181;if(ghooks[2181]())return;}
cyc+=24;push(2184);pc=7434;return;
if(cyc>=evt){pc=2184;return;}
case 2184:cyc+=24;push(2187);pc=7524;return;
if(cyc>=evt){pc=2187;return;}
case 2187:cyc+=8;A=1;
if(cyc>=evt){pc=2189;return;}
case 2189:cyc+=16;wr(49496,A);
if(cyc>=evt){pc=2192;return;}
case 2192:cyc+=8;C=2;
if(cyc>=evt){pc=2194;return;}
case 2194:cyc+=24;push(2197);pc=7722;return;
if(cyc>=evt){pc=2197;return;}
case 2197:cyc+=8;A=18;
if(cyc>=evt){pc=2199;return;}
case 2199:cyc+=24;push(2202);pc=14993;return;
if(cyc>=evt){pc=2202;return;}
case 2202:cyc+=4;xor(A);
if(cyc>=evt){pc=2203;return;}
case 2203:cyc+=12;wr(65346,A);
if(cyc>=evt){pc=2205;return;}
case 2205:cyc+=24;push(2208);pc=7275;return;
if(cyc>=evt){pc=2208;return;}
case 2208:cyc+=24;push(2211);pc=8287;return;
if(cyc>=evt){pc=2211;return;}
case 2211:cyc+=8;if(fz){cyc+=4;pc=2208;return;}
if(cyc>=evt){pc=2213;return;}
case 2213:cyc+=16;pc=336;return;
case 2216:cyc+=12;B=15;C=5;
if(cyc>=evt){pc=2219;return;}
case 2219:cyc+=24;push(2222);pc=14894;return;
if(cyc>=evt){pc=2222;return;}
case 2222:cyc+=12;if(!fz){cyc+=4;pc=2393;return;}
if(cyc>=evt){pc=2225;return;}
case 2225:if(GK[2225]){pc=2225;if(ghooks[2225]())return;}
cyc+=8;A=5;
if(cyc>=evt){pc=2227;return;}
case 2227:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=2230;return;}
case 2230:cyc+=8;A=1;
if(cyc>=evt){pc=2232;return;}
case 2232:cyc+=16;wr(49437,A);
if(cyc>=evt){pc=2235;return;}
case 2235:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=2238;return;}
case 2238:cyc+=8;A=164;
if(cyc>=evt){pc=2240;return;}
case 2240:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=2243;return;}
case 2243:cyc+=8;A=2;
if(cyc>=evt){pc=2245;return;}
case 2245:cyc+=24;push(2248);pc=14993;return;
if(cyc>=evt){pc=2248;return;}
case 2248:cyc+=24;push(2251);pc=14031;return;
if(cyc>=evt){pc=2251;return;}
case 2251:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=2254;return;}
case 2254:cyc+=4;and(A);
if(cyc>=evt){pc=2255;return;}
case 2255:cyc+=12;if(fz){cyc+=12;push(2258);pc=12071;return;}
if(cyc>=evt){pc=2258;return;}
case 2258:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=2261;return;}
case 2261:cyc+=8;cp(15);
if(cyc>=evt){pc=2263;return;}
case 2263:cyc+=8;if(fc){cyc+=4;pc=2270;return;}
if(cyc>=evt){pc=2265;return;}
case 2265:cyc+=24;push(2268);pc=14678;return;
if(cyc>=evt){pc=2268;return;}
case 2268:cyc+=12;pc=2248;return;
case 2270:cyc+=4;xor(A);
if(cyc>=evt){pc=2271;return;}
case 2271:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=2274;return;}
case 2274:cyc+=8;A=178;
if(cyc>=evt){pc=2276;return;}
case 2276:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=2279;return;}
case 2279:cyc+=24;push(2282);pc=14031;return;
if(cyc>=evt){pc=2282;return;}
case 2282:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=2285;return;}
case 2285:cyc+=4;and(A);
if(cyc>=evt){pc=2286;return;}
case 2286:cyc+=12;if(fz){cyc+=12;push(2289);pc=12071;return;}
if(cyc>=evt){pc=2289;return;}
case 2289:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=2292;return;}
case 2292:cyc+=8;cp(11);
if(cyc>=evt){pc=2294;return;}
case 2294:cyc+=8;if(fc){cyc+=4;pc=2301;return;}
if(cyc>=evt){pc=2296;return;}
case 2296:cyc+=24;push(2299);pc=14678;return;
if(cyc>=evt){pc=2299;return;}
case 2299:cyc+=12;pc=2279;return;
case 2301:cyc+=4;xor(A);
if(cyc>=evt){pc=2302;return;}
case 2302:cyc+=16;wr(49423,A);
if(cyc>=evt){pc=2305;return;}
case 2305:cyc+=8;A=8;
if(cyc>=evt){pc=2307;return;}
case 2307:cyc+=16;wr(49425,A);
if(cyc>=evt){pc=2310;return;}
case 2310:cyc+=8;A=179;
if(cyc>=evt){pc=2312;return;}
case 2312:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=2315;return;}
case 2315:cyc+=8;A=28;
if(cyc>=evt){pc=2317;return;}
case 2317:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=2320;return;}
case 2320:cyc+=8;A=1;
if(cyc>=evt){pc=2322;return;}
case 2322:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=2325;return;}
case 2325:cyc+=16;wr(49437,A);
if(cyc>=evt){pc=2328;return;}
case 2328:cyc+=24;push(2331);pc=14031;return;
if(cyc>=evt){pc=2331;return;}
case 2331:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=2334;return;}
case 2334:cyc+=4;and(A);
if(cyc>=evt){pc=2335;return;}
case 2335:cyc+=12;if(fz){cyc+=12;push(2338);pc=12071;return;}
if(cyc>=evt){pc=2338;return;}
case 2338:cyc+=8;E=176;
if(cyc>=evt){pc=2340;return;}
case 2340:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=2343;return;}
case 2343:cyc+=8;cp(10);
if(cyc>=evt){pc=2345;return;}
case 2345:cyc+=8;if(!fz){cyc+=4;pc=2348;return;}
if(cyc>=evt){pc=2347;return;}
case 2347:cyc+=4;E=inc(E);
if(cyc>=evt){pc=2348;return;}
case 2348:cyc+=4;A=E;
if(cyc>=evt){pc=2349;return;}
case 2349:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=2352;return;}
case 2352:cyc+=16;A=rd(49592);
if(cyc>=evt){pc=2355;return;}
case 2355:cyc+=4;and(A);
if(cyc>=evt){pc=2356;return;}
case 2356:cyc+=8;if(!fz){cyc+=4;pc=2328;return;}
if(cyc>=evt){pc=2358;return;}
case 2358:cyc+=24;push(2361);pc=7434;return;
if(cyc>=evt){pc=2361;return;}
case 2361:cyc+=24;push(2364);pc=7524;return;
if(cyc>=evt){pc=2364;return;}
case 2364:cyc+=8;A=1;
if(cyc>=evt){pc=2366;return;}
case 2366:cyc+=16;wr(49496,A);
if(cyc>=evt){pc=2369;return;}
case 2369:cyc+=8;C=3;
if(cyc>=evt){pc=2371;return;}
case 2371:cyc+=24;push(2374);pc=7722;return;
if(cyc>=evt){pc=2374;return;}
case 2374:cyc+=8;A=3;
if(cyc>=evt){pc=2376;return;}
case 2376:cyc+=24;push(2379);pc=14993;return;
if(cyc>=evt){pc=2379;return;}
case 2379:cyc+=4;xor(A);
if(cyc>=evt){pc=2380;return;}
case 2380:cyc+=12;wr(65346,A);
if(cyc>=evt){pc=2382;return;}
case 2382:cyc+=24;push(2385);pc=7275;return;
if(cyc>=evt){pc=2385;return;}
case 2385:cyc+=24;push(2388);pc=8287;return;
if(cyc>=evt){pc=2388;return;}
case 2388:cyc+=8;if(fz){cyc+=4;pc=2385;return;}
if(cyc>=evt){pc=2390;return;}
case 2390:cyc+=16;pc=336;return;
case 2393:cyc+=12;B=4;C=11;
if(cyc>=evt){pc=2396;return;}
case 2396:cyc+=24;push(2399);pc=14894;return;
if(cyc>=evt){pc=2399;return;}
case 2399:cyc+=8;if(!fz){cyc+=4;pc=2427;return;}
if(cyc>=evt){pc=2401;return;}
case 2401:cyc+=12;B=23;C=12;
if(cyc>=evt){pc=2404;return;}
case 2404:cyc+=24;push(2407);pc=12048;return;
if(cyc>=evt){pc=2407;return;}
case 2407:cyc+=8;cp(64);
if(cyc>=evt){pc=2409;return;}
case 2409:cyc+=8;if(fz){cyc+=4;pc=2427;return;}
if(cyc>=evt){pc=2411;return;}
case 2411:cyc+=12;B=3;C=3;
if(cyc>=evt){pc=2414;return;}
case 2414:cyc+=8;E=13;
if(cyc>=evt){pc=2416;return;}
case 2416:cyc+=24;push(2419);pc=11964;return;
if(cyc>=evt){pc=2419;return;}
case 2419:cyc+=12;B=3;C=2;
if(cyc>=evt){pc=2422;return;}
case 2422:cyc+=8;E=23;
pc=2424;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 2424:cyc+=24;push(2427);pc=11964;return;
if(cyc>=evt){pc=2427;return;}
case 2427:cyc+=24;push(2430);pc=14031;return;
if(cyc>=evt){pc=2430;return;}
case 2430:cyc+=16;A=rd(49587);
if(cyc>=evt){pc=2433;return;}
case 2433:cyc+=4;and(A);
if(cyc>=evt){pc=2434;return;}
case 2434:cyc+=8;if(fz){cyc+=4;pc=2451;return;}
if(cyc>=evt){pc=2436;return;}
case 2436:cyc+=8;A=1;
if(cyc>=evt){pc=2438;return;}
case 2438:cyc+=16;wr(49497,A);
if(cyc>=evt){pc=2441;return;}
case 2441:cyc+=12;B=64;C=57;
if(cyc>=evt){pc=2444;return;}
case 2444:cyc+=24;push(2447);pc=15065;return;
if(cyc>=evt){pc=2447;return;}
case 2447:cyc+=4;xor(A);
if(cyc>=evt){pc=2448;return;}
case 2448:cyc+=16;wr(49587,A);
if(cyc>=evt){pc=2451;return;}
case 2451:cyc+=12;A=rd(65420);
if(cyc>=evt){pc=2453;return;}
case 2453:cyc+=8;fz=(A>>3)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=2455;return;}
case 2455:cyc+=8;if(fz){cyc+=4;pc=2500;return;}
if(cyc>=evt){pc=2457;return;}
case 2457:cyc+=16;A=rd(49510);
if(cyc>=evt){pc=2460;return;}
case 2460:cyc+=8;cp(5);
if(cyc>=evt){pc=2462;return;}
case 2462:cyc+=8;if(!fc){cyc+=4;pc=2500;return;}
if(cyc>=evt){pc=2464;return;}
case 2464:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=2467;return;}
case 2467:cyc+=4;and(A);
if(cyc>=evt){pc=2468;return;}
case 2468:cyc+=8;if(!fz){cyc+=4;pc=2500;return;}
if(cyc>=evt){pc=2470;return;}
case 2470:cyc+=16;A=rd(49420);
if(cyc>=evt){pc=2473;return;}
case 2473:cyc+=8;xor(1);
if(cyc>=evt){pc=2475;return;}
case 2475:cyc+=16;wr(49420,A);
if(cyc>=evt){pc=2478;return;}
case 2478:cyc+=8;if(fz){cyc+=4;pc=2489;return;}
if(cyc>=evt){pc=2480;return;}
case 2480:cyc+=24;push(2483);pc=13900;return;
if(cyc>=evt){pc=2483;return;}
case 2483:cyc+=4;xor(A);
if(cyc>=evt){pc=2484;return;}
case 2484:cyc+=16;wr(49510,A);
if(cyc>=evt){pc=2487;return;}
case 2487:cyc+=12;pc=2500;return;
case 2489:cyc+=24;push(2492);pc=7894;return;
if(cyc>=evt){pc=2492;return;}
case 2492:cyc+=8;A=1;
if(cyc>=evt){pc=2494;return;}
case 2494:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=2497;return;}
case 2497:cyc+=16;wr(49499,A);
if(cyc>=evt){pc=2500;return;}
case 2500:cyc+=16;A=rd(49512);
if(cyc>=evt){pc=2503;return;}
case 2503:cyc+=4;and(A);
if(cyc>=evt){pc=2504;return;}
case 2504:cyc+=12;if(!fz){cyc+=4;pc=8940;return;}
if(cyc>=evt){pc=2507;return;}
case 2507:cyc+=8;B=180;
if(cyc>=evt){pc=2509;return;}
case 2509:cyc+=16;A=rd(49509);
if(cyc>=evt){pc=2512;return;}
case 2512:cyc+=8;cp(50);
if(cyc>=evt){pc=2514;return;}
case 2514:cyc+=8;if(fc){cyc+=4;pc=2518;return;}
if(cyc>=evt){pc=2516;return;}
case 2516:cyc+=8;B=230;
if(cyc>=evt){pc=2518;return;}
case 2518:cyc+=16;A=rd(49589);
if(cyc>=evt){pc=2521;return;}
case 2521:cyc+=16;wr(49590,A);
if(cyc>=evt){pc=2524;return;}
case 2524:cyc+=4;cp(B);
if(cyc>=evt){pc=2525;return;}
case 2525:cyc+=8;if(fz){cyc+=4;pc=2653;return;}
if(cyc>=evt){pc=2527;return;}
case 2527:cyc+=4;xor(A);
if(cyc>=evt){pc=2528;return;}
case 2528:cyc+=16;wr(49589,A);
if(cyc>=evt){pc=2531;return;}
case 2531:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=2534;return;}
case 2534:cyc+=12;H=0;L=7;
if(cyc>=evt){pc=2537;return;}
case 2537:cyc+=4;add(L);
if(cyc>=evt){pc=2538;return;}
case 2538:cyc+=4;L=A;
if(cyc>=evt){pc=2539;return;}
case 2539:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=2540;return;}
case 2540:cyc+=12;H=192;L=172;
if(cyc>=evt){pc=2543;return;}
case 2543:cyc+=4;add(L);
if(cyc>=evt){pc=2544;return;}
case 2544:cyc+=4;L=A;
if(cyc>=evt){pc=2545;return;}
case 2545:cyc+=8;C=0;
if(cyc>=evt){pc=2547;return;}
case 2547:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=2548;return;}
case 2548:cyc+=8;and(31);
if(cyc>=evt){pc=2550;return;}
case 2550:cyc+=8;cp(18);
if(cyc>=evt){pc=2552;return;}
case 2552:cyc+=8;if(!fz){cyc+=4;pc=2616;return;}
if(cyc>=evt){pc=2554;return;}
case 2554:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=2555;return;}
case 2555:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=2556;return;}
case 2556:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=2557;return;}
case 2557:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=2560;return;}
case 2560:cyc+=8;A=sla(A);
if(cyc>=evt){pc=2562;return;}
case 2562:cyc+=12;B=0;C=97;
if(cyc>=evt){pc=2565;return;}
case 2565:cyc+=4;add(C);
if(cyc>=evt){pc=2566;return;}
case 2566:cyc+=4;C=A;
if(cyc>=evt){pc=2567;return;}
case 2567:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=2568;return;}
case 2568:cyc+=8;{const t=(B<<8|C)+1;B=(t>>8)&255;C=t&255;}
if(cyc>=evt){pc=2569;return;}
case 2569:cyc+=4;L=A;
if(cyc>=evt){pc=2570;return;}
case 2570:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=2571;return;}
case 2571:cyc+=4;H=A;
if(cyc>=evt){pc=2572;return;}
case 2572:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=2573;return;}
case 2573:cyc+=4;A=C;
if(cyc>=evt){pc=2574;return;}
case 2574:cyc+=8;A=sla(A);
if(cyc>=evt){pc=2576;return;}
case 2576:cyc+=4;add(L);
if(cyc>=evt){pc=2577;return;}
case 2577:cyc+=4;L=A;
if(cyc>=evt){pc=2578;return;}
case 2578:cyc+=8;if(!fc){cyc+=4;pc=2581;return;}
if(cyc>=evt){pc=2580;return;}
case 2580:cyc+=4;H=inc(H);
if(cyc>=evt){pc=2581;return;}
case 2581:cyc+=16;A=rd(49513);
if(cyc>=evt){pc=2584;return;}
case 2584:cyc+=4;add(B);
if(cyc>=evt){pc=2585;return;}
case 2585:cyc+=4;E=A;
if(cyc>=evt){pc=2586;return;}
case 2586:cyc+=16;A=rd(49514);
if(cyc>=evt){pc=2589;return;}
case 2589:cyc+=4;D=A;
if(cyc>=evt){pc=2590;return;}
case 2590:cyc+=8;if(!fc){cyc+=4;pc=2593;return;}
if(cyc>=evt){pc=2592;return;}
case 2592:cyc+=4;D=inc(D);
if(cyc>=evt){pc=2593;return;}
case 2593:cyc+=16;A=rd(49515);
if(cyc>=evt){pc=2596;return;}
case 2596:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=2599;return;}
case 2599:cyc+=12;B=2;C=5;
if(cyc>=evt){pc=2602;return;}
case 2602:cyc+=24;push(2605);pc=4953;return;
if(cyc>=evt){pc=2605;return;}
case 2605:cyc+=8;A=1;
if(cyc>=evt){pc=2607;return;}
case 2607:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=2610;return;}
case 2610:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=2611;return;}
case 2611:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=2612;return;}
case 2612:cyc+=4;A=B;
if(cyc>=evt){pc=2613;return;}
case 2613:cyc+=16;wr(49589,A);
if(cyc>=evt){pc=2616;return;}
case 2616:cyc+=4;C=inc(C);
if(cyc>=evt){pc=2617;return;}
case 2617:cyc+=4;A=C;
if(cyc>=evt){pc=2618;return;}
case 2618:cyc+=8;cp(10);
if(cyc>=evt){pc=2620;return;}
case 2620:cyc+=8;if(!fz){cyc+=4;pc=2547;return;}
if(cyc>=evt){pc=2622;return;}
case 2622:cyc+=16;A=rd(49589);
if(cyc>=evt){pc=2625;return;}
case 2625:cyc+=4;and(A);
if(cyc>=evt){pc=2626;return;}
case 2626:cyc+=8;if(fz){cyc+=4;pc=2642;return;}
if(cyc>=evt){pc=2628;return;}
case 2628:cyc+=16;A=rd(49590);
if(cyc>=evt){pc=2631;return;}
case 2631:cyc+=4;and(A);
if(cyc>=evt){pc=2632;return;}
case 2632:cyc+=8;if(fz){cyc+=4;pc=2653;return;}
if(cyc>=evt){pc=2634;return;}
case 2634:cyc+=12;B=64;C=80;
if(cyc>=evt){pc=2637;return;}
case 2637:cyc+=24;push(2640);pc=15065;return;
if(cyc>=evt){pc=2640;return;}
case 2640:cyc+=12;pc=2653;return;
case 2642:cyc+=16;A=rd(49590);
if(cyc>=evt){pc=2645;return;}
case 2645:cyc+=4;and(A);
if(cyc>=evt){pc=2646;return;}
case 2646:cyc+=8;if(fz){cyc+=4;pc=2653;return;}
if(cyc>=evt){pc=2648;return;}
case 2648:cyc+=8;A=1;
if(cyc>=evt){pc=2650;return;}
case 2650:cyc+=16;wr(49497,A);
if(cyc>=evt){pc=2653;return;}
case 2653:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=2656;return;}
case 2656:cyc+=8;cp(105);
if(cyc>=evt){pc=2658;return;}
case 2658:cyc+=12;if(fz){cyc+=4;pc=3726;return;}
if(cyc>=evt){pc=2661;return;}
case 2661:cyc+=16;A=rd(49589);
if(cyc>=evt){pc=2664;return;}
case 2664:cyc+=8;cp(180);
if(cyc>=evt){pc=2666;return;}
case 2666:cyc+=8;if(fz){cyc+=4;pc=2777;return;}
if(cyc>=evt){pc=2668;return;}
case 2668:cyc+=24;push(2671);pc=13304;return;
if(cyc>=evt){pc=2671;return;}
case 2671:cyc+=8;cp(18);
if(cyc>=evt){pc=2673;return;}
case 2673:cyc+=8;if(!fz){cyc+=4;pc=2718;return;}
if(cyc>=evt){pc=2675;return;}
case 2675:cyc+=12;H=193;L=103;
if(cyc>=evt){pc=2678;return;}
case 2678:cyc+=16;wr((H<<8|L),rd((H<<8|L))&253);
if(cyc>=evt){pc=2680;return;}
case 2680:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=2683;return;}
case 2683:cyc+=8;and(254);
if(cyc>=evt){pc=2685;return;}
case 2685:cyc+=16;wr(49425,A);
if(cyc>=evt){pc=2688;return;}
case 2688:cyc+=8;E=18;
if(cyc>=evt){pc=2690;return;}
case 2690:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=2693;return;}
case 2693:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=2695;return;}
case 2695:cyc+=8;if(fz){cyc+=4;pc=2698;return;}
if(cyc>=evt){pc=2697;return;}
case 2697:cyc+=4;E=inc(E);
if(cyc>=evt){pc=2698;return;}
case 2698:cyc+=4;xor(A);
if(cyc>=evt){pc=2699;return;}
case 2699:cyc+=16;wr(49462,A);
if(cyc>=evt){pc=2702;return;}
case 2702:cyc+=16;wr(49501,A);
if(cyc>=evt){pc=2705;return;}
case 2705:cyc+=8;A=1;
if(cyc>=evt){pc=2707;return;}
case 2707:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=2710;return;}
case 2710:cyc+=24;push(2713);pc=10425;return;
if(cyc>=evt){pc=2713;return;}
case 2713:cyc+=8;A=7;
if(cyc>=evt){pc=2715;return;}
case 2715:cyc+=24;push(2718);pc=14993;return;
if(cyc>=evt){pc=2718;return;}
case 2718:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=2721;return;}
case 2721:cyc+=8;cp(1);
if(cyc>=evt){pc=2723;return;}
case 2723:cyc+=8;if(!fz){cyc+=4;pc=2777;return;}
if(cyc>=evt){pc=2725;return;}
case 2725:cyc+=24;push(2728);pc=13332;return;
if(cyc>=evt){pc=2728;return;}
case 2728:cyc+=8;cp(18);
if(cyc>=evt){pc=2730;return;}
case 2730:cyc+=8;if(!fz){cyc+=4;pc=2777;return;}
if(cyc>=evt){pc=2732;return;}
case 2732:cyc+=12;H=193;L=26;
if(cyc>=evt){pc=2735;return;}
case 2735:cyc+=16;wr((H<<8|L),rd((H<<8|L))&254);
if(cyc>=evt){pc=2737;return;}
case 2737:cyc+=24;push(2740);pc=13282;return;
if(cyc>=evt){pc=2740;return;}
case 2740:cyc+=12;B=64;C=86;
if(cyc>=evt){pc=2743;return;}
case 2743:cyc+=24;push(2746);pc=15065;return;
if(cyc>=evt){pc=2746;return;}
case 2746:cyc+=4;xor(A);
if(cyc>=evt){pc=2747;return;}
case 2747:cyc+=16;wr(49463,A);
if(cyc>=evt){pc=2750;return;}
case 2750:cyc+=16;wr(49462,A);
if(cyc>=evt){pc=2753;return;}
case 2753:cyc+=16;wr(49504,A);
if(cyc>=evt){pc=2756;return;}
case 2756:cyc+=8;A=128;
if(cyc>=evt){pc=2758;return;}
case 2758:cyc+=16;wr(49429,A);
if(cyc>=evt){pc=2761;return;}
case 2761:cyc+=8;A=1;
if(cyc>=evt){pc=2763;return;}
case 2763:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=2766;return;}
case 2766:cyc+=24;push(2769);pc=10773;return;
if(cyc>=evt){pc=2769;return;}
case 2769:cyc+=8;A=21;
if(cyc>=evt){pc=2771;return;}
case 2771:cyc+=24;push(2774);pc=14993;return;
if(cyc>=evt){pc=2774;return;}
case 2774:cyc+=16;pc=4307;return;
case 2777:cyc+=24;push(2780);pc=11607;return;
if(cyc>=evt){pc=2780;return;}
case 2780:cyc+=12;B=3;C=1;
if(cyc>=evt){pc=2783;return;}
case 2783:cyc+=24;push(2786);pc=14894;return;
if(cyc>=evt){pc=2786;return;}
case 2786:cyc+=8;if(!fz){cyc+=4;pc=2877;return;}
if(cyc>=evt){pc=2788;return;}
case 2788:cyc+=12;B=5;C=23;
if(cyc>=evt){pc=2791;return;}
case 2791:cyc+=24;push(2794);pc=12048;return;
if(cyc>=evt){pc=2794;return;}
case 2794:cyc+=8;cp(64);
if(cyc>=evt){pc=2796;return;}
case 2796:cyc+=8;if(fz){cyc+=4;pc=2877;return;}
if(cyc>=evt){pc=2798;return;}
case 2798:cyc+=16;A=rd(49459);
if(cyc>=evt){pc=2801;return;}
case 2801:cyc+=8;cp(119);
if(cyc>=evt){pc=2803;return;}
case 2803:cyc+=8;if(!fz){cyc+=4;pc=2823;return;}
if(cyc>=evt){pc=2805;return;}
case 2805:cyc+=16;A=rd(49463);
if(cyc>=evt){pc=2808;return;}
case 2808:cyc+=4;and(A);
if(cyc>=evt){pc=2809;return;}
case 2809:cyc+=8;if(!fz){cyc+=4;pc=2877;return;}
if(cyc>=evt){pc=2811;return;}
case 2811:cyc+=8;A=3;
if(cyc>=evt){pc=2813;return;}
case 2813:cyc+=16;wr(49429,A);
if(cyc>=evt){pc=2816;return;}
case 2816:cyc+=8;A=1;
if(cyc>=evt){pc=2818;return;}
case 2818:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=2821;return;}
case 2821:cyc+=12;pc=2877;return;
case 2823:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=2826;return;}
case 2826:cyc+=8;cp(1);
if(cyc>=evt){pc=2828;return;}
case 2828:cyc+=8;if(!fz){cyc+=4;pc=2877;return;}
if(cyc>=evt){pc=2830;return;}
case 2830:cyc+=24;push(2833);pc=14912;return;
if(cyc>=evt){pc=2833;return;}
case 2833:cyc+=8;if(!fz){cyc+=4;pc=2877;return;}
if(cyc>=evt){pc=2835;return;}
case 2835:cyc+=12;B=0;C=17;
if(cyc>=evt){pc=2838;return;}
case 2838:cyc+=24;push(2841);pc=13485;return;
if(cyc>=evt){pc=2841;return;}
case 2841:cyc+=8;cp(21);
if(cyc>=evt){pc=2843;return;}
case 2843:cyc+=8;if(!fz){cyc+=4;pc=2877;return;}
if(cyc>=evt){pc=2845;return;}
case 2845:cyc+=12;B=0;C=16;
if(cyc>=evt){pc=2848;return;}
case 2848:cyc+=8;E=1;
if(cyc>=evt){pc=2850;return;}
case 2850:cyc+=24;push(2853);pc=11964;return;
if(cyc>=evt){pc=2853;return;}
case 2853:cyc+=4;xor(A);
if(cyc>=evt){pc=2854;return;}
case 2854:cyc+=8;A=12;
if(cyc>=evt){pc=2856;return;}
case 2856:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=2859;return;}
case 2859:cyc+=8;A=1;
if(cyc>=evt){pc=2861;return;}
case 2861:cyc+=16;wr(49437,A);
if(cyc>=evt){pc=2864;return;}
case 2864:cyc+=8;A=119;
if(cyc>=evt){pc=2866;return;}
case 2866:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=2869;return;}
case 2869:cyc+=8;A=1;
if(cyc>=evt){pc=2871;return;}
case 2871:cyc+=24;push(2874);pc=14993;return;
if(cyc>=evt){pc=2874;return;}
case 2874:cyc+=16;pc=4307;return;
case 2877:cyc+=24;push(2880);pc=9234;return;
if(cyc>=evt){pc=2880;return;}
case 2880:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=2883;return;}
case 2883:cyc+=4;and(A);
if(cyc>=evt){pc=2884;return;}
case 2884:cyc+=12;if(fz){cyc+=4;pc=3747;return;}
if(cyc>=evt){pc=2887;return;}
case 2887:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=2889;return;}
case 2889:cyc+=8;if(fz){cyc+=4;pc=2898;return;}
if(cyc>=evt){pc=2891;return;}
case 2891:cyc+=4;C=A;
if(cyc>=evt){pc=2892;return;}
case 2892:cyc+=24;push(2895);pc=13282;return;
if(cyc>=evt){pc=2895;return;}
case 2895:cyc+=16;pc=4307;return;
case 2898:cyc+=24;push(2901);pc=14907;return;
if(cyc>=evt){pc=2901;return;}
case 2901:cyc+=12;if(!fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=2904;return;}
case 2904:cyc+=16;A=rd(49459);
if(cyc>=evt){pc=2907;return;}
case 2907:cyc+=8;cp(123);
if(cyc>=evt){pc=2909;return;}
case 2909:cyc+=8;if(!fz){cyc+=4;pc=2946;return;}
if(cyc>=evt){pc=2911;return;}
case 2911:cyc+=4;xor(A);
pc=2912;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 2912:cyc+=16;wr(49429,A);
if(cyc>=evt){pc=2915;return;}
case 2915:cyc+=8;C=13;
if(cyc>=evt){pc=2917;return;}
case 2917:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=2920;return;}
case 2920:cyc+=8;cp(2);
if(cyc>=evt){pc=2922;return;}
case 2922:cyc+=8;if(!fz){cyc+=4;pc=2926;return;}
if(cyc>=evt){pc=2924;return;}
case 2924:cyc+=8;C=C|16;
if(cyc>=evt){pc=2926;return;}
case 2926:cyc+=4;A=C;
if(cyc>=evt){pc=2927;return;}
case 2927:cyc+=16;wr(50997,A);
if(cyc>=evt){pc=2930;return;}
case 2930:cyc+=8;A=21;
if(cyc>=evt){pc=2932;return;}
case 2932:cyc+=12;if(fz){cyc+=12;push(2935);pc=14993;return;}
if(cyc>=evt){pc=2935;return;}
case 2935:cyc+=8;A=107;
if(cyc>=evt){pc=2937;return;}
case 2937:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=2940;return;}
case 2940:cyc+=24;push(2943);pc=10773;return;
if(cyc>=evt){pc=2943;return;}
case 2943:cyc+=16;pc=4307;return;
case 2946:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=2949;return;}
case 2949:cyc+=12;H=193;L=29;
if(cyc>=evt){pc=2952;return;}
case 2952:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=2953;return;}
case 2953:cyc+=8;if(fz){cyc+=4;pc=2963;return;}
if(cyc>=evt){pc=2955;return;}
case 2955:cyc+=8;A=108;
if(cyc>=evt){pc=2957;return;}
case 2957:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=2960;return;}
case 2960:cyc+=16;pc=3232;return;
case 2963:cyc+=8;C=0;
if(cyc>=evt){pc=2965;return;}
case 2965:cyc+=12;H=193;L=28;
if(cyc>=evt){pc=2968;return;}
case 2968:cyc+=12;fz=(rd((H<<8|L))>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=2970;return;}
case 2970:cyc+=8;if(!fz){cyc+=4;pc=2979;return;}
if(cyc>=evt){pc=2972;return;}
case 2972:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=2975;return;}
case 2975:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=2976;return;}
case 2976:cyc+=8;if(!fc){cyc+=4;pc=2979;return;}
if(cyc>=evt){pc=2978;return;}
case 2978:cyc+=4;C=inc(C);
if(cyc>=evt){pc=2979;return;}
case 2979:cyc+=4;A=C;
if(cyc>=evt){pc=2980;return;}
case 2980:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=2983;return;}
case 2983:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=2986;return;}
case 2986:cyc+=8;cp(37);
if(cyc>=evt){pc=2988;return;}
case 2988:cyc+=8;if(fz){cyc+=4;pc=2994;return;}
if(cyc>=evt){pc=2990;return;}
case 2990:cyc+=8;cp(38);
if(cyc>=evt){pc=2992;return;}
case 2992:cyc+=8;if(!fz){cyc+=4;pc=3022;return;}
if(cyc>=evt){pc=2994;return;}
case 2994:cyc+=4;xor(A);
if(cyc>=evt){pc=2995;return;}
case 2995:cyc+=16;wr(49501,A);
if(cyc>=evt){pc=2998;return;}
case 2998:cyc+=8;A=1;
if(cyc>=evt){pc=3000;return;}
case 3000:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=3003;return;}
case 3003:cyc+=12;B=64;C=26;
if(cyc>=evt){pc=3006;return;}
case 3006:cyc+=24;push(3009);pc=15065;return;
if(cyc>=evt){pc=3009;return;}
case 3009:cyc+=8;A=105;
if(cyc>=evt){pc=3011;return;}
case 3011:cyc+=16;wr(49458,A);
if(cyc>=evt){pc=3014;return;}
case 3014:cyc+=8;A=18;
if(cyc>=evt){pc=3016;return;}
case 3016:cyc+=24;push(3019);pc=14993;return;
if(cyc>=evt){pc=3019;return;}
case 3019:cyc+=16;pc=4307;return;
case 3022:cyc+=24;push(3025);pc=11855;return;
if(cyc>=evt){pc=3025;return;}
case 3025:cyc+=8;cp(10);
if(cyc>=evt){pc=3027;return;}
case 3027:cyc+=8;if(!fc){cyc+=4;pc=2955;return;}
if(cyc>=evt){pc=3029;return;}
case 3029:cyc+=16;A=rd(49511);
if(cyc>=evt){pc=3032;return;}
case 3032:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3034;return;}
case 3034:cyc+=12;if(!fz){cyc+=4;pc=3232;return;}
if(cyc>=evt){pc=3037;return;}
case 3037:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3039;return;}
case 3039:cyc+=8;if(fz){cyc+=4;pc=3091;return;}
if(cyc>=evt){pc=3041;return;}
case 3041:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=3044;return;}
case 3044:cyc+=8;cp(0);
if(cyc>=evt){pc=3046;return;}
case 3046:cyc+=8;if(!fz){cyc+=4;pc=3091;return;}
if(cyc>=evt){pc=3048;return;}
case 3048:cyc+=12;H=193;L=53;
if(cyc>=evt){pc=3051;return;}
case 3051:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=3052;return;}
case 3052:cyc+=8;if(!fz){cyc+=4;pc=3091;return;}
if(cyc>=evt){pc=3054;return;}
case 3054:cyc+=8;A=3;
if(cyc>=evt){pc=3056;return;}
case 3056:cyc+=16;wr(49511,A);
if(cyc>=evt){pc=3059;return;}
case 3059:cyc+=8;E=22;
if(cyc>=evt){pc=3061;return;}
case 3061:cyc+=24;push(3064);pc=10425;return;
if(cyc>=evt){pc=3064;return;}
case 3064:cyc+=8;C=1;
if(cyc>=evt){pc=3066;return;}
case 3066:cyc+=12;H=193;L=28;
if(cyc>=evt){pc=3069;return;}
case 3069:cyc+=12;fz=(rd((H<<8|L))>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3071;return;}
case 3071:cyc+=8;if(!fz){cyc+=4;pc=3080;return;}
if(cyc>=evt){pc=3073;return;}
case 3073:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=3076;return;}
case 3076:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=3077;return;}
case 3077:cyc+=8;if(!fc){cyc+=4;pc=3080;return;}
if(cyc>=evt){pc=3079;return;}
case 3079:cyc+=4;C=dec(C);
if(cyc>=evt){pc=3080;return;}
case 3080:cyc+=4;A=C;
if(cyc>=evt){pc=3081;return;}
case 3081:cyc+=16;wr(49423,A);
if(cyc>=evt){pc=3084;return;}
case 3084:cyc+=4;xor(A);
if(cyc>=evt){pc=3085;return;}
case 3085:cyc+=16;wr(49424,A);
if(cyc>=evt){pc=3088;return;}
case 3088:cyc+=16;pc=4307;return;
case 3091:cyc+=16;A=rd(49459);
if(cyc>=evt){pc=3094;return;}
case 3094:cyc+=8;cp(112);
if(cyc>=evt){pc=3096;return;}
case 3096:cyc+=8;if(fz){cyc+=4;pc=3102;return;}
if(cyc>=evt){pc=3098;return;}
case 3098:cyc+=8;cp(36);
if(cyc>=evt){pc=3100;return;}
case 3100:cyc+=8;if(!fz){cyc+=4;pc=3142;return;}
if(cyc>=evt){pc=3102;return;}
case 3102:cyc+=16;A=rd(49501);
if(cyc>=evt){pc=3105;return;}
case 3105:cyc+=4;and(A);
if(cyc>=evt){pc=3106;return;}
case 3106:cyc+=12;if(fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=3109;return;}
case 3109:cyc+=4;xor(A);
if(cyc>=evt){pc=3110;return;}
case 3110:cyc+=16;wr(49501,A);
if(cyc>=evt){pc=3113;return;}
case 3113:cyc+=8;A=1;
if(cyc>=evt){pc=3115;return;}
case 3115:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=3118;return;}
case 3118:cyc+=8;A=108;
if(cyc>=evt){pc=3120;return;}
case 3120:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3123;return;}
case 3123:cyc+=12;B=64;C=26;
if(cyc>=evt){pc=3126;return;}
case 3126:cyc+=24;push(3129);pc=15065;return;
if(cyc>=evt){pc=3129;return;}
case 3129:cyc+=8;A=105;
if(cyc>=evt){pc=3131;return;}
case 3131:cyc+=16;wr(49458,A);
if(cyc>=evt){pc=3134;return;}
case 3134:cyc+=8;A=18;
if(cyc>=evt){pc=3136;return;}
case 3136:cyc+=24;push(3139);pc=14993;return;
if(cyc>=evt){pc=3139;return;}
case 3139:cyc+=16;pc=4307;return;
case 3142:cyc+=8;cp(111);
if(cyc>=evt){pc=3144;return;}
case 3144:cyc+=8;if(!fz){cyc+=4;pc=3192;return;}
if(cyc>=evt){pc=3146;return;}
case 3146:cyc+=8;A=112;
if(cyc>=evt){pc=3148;return;}
case 3148:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3151;return;}
case 3151:cyc+=8;A=2;
if(cyc>=evt){pc=3153;return;}
case 3153:cyc+=16;wr(49493,A);
if(cyc>=evt){pc=3156;return;}
case 3156:cyc+=24;push(3159);pc=11413;return;
if(cyc>=evt){pc=3159;return;}
case 3159:cyc+=8;if(!fz){cyc+=4;pc=3174;return;}
if(cyc>=evt){pc=3161;return;}
case 3161:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=3164;return;}
case 3164:cyc+=12;H=193;L=29;
if(cyc>=evt){pc=3167;return;}
case 3167:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=3168;return;}
case 3168:cyc+=8;if(!fz){cyc+=4;pc=3189;return;}
if(cyc>=evt){pc=3170;return;}
case 3170:cyc+=8;E=46;
if(cyc>=evt){pc=3172;return;}
case 3172:cyc+=12;pc=3186;return;
case 3174:cyc+=4;xor(A);
if(cyc>=evt){pc=3175;return;}
case 3175:cyc+=16;wr(49462,A);
if(cyc>=evt){pc=3178;return;}
case 3178:cyc+=12;B=64;C=124;
if(cyc>=evt){pc=3181;return;}
case 3181:cyc+=24;push(3184);pc=15065;return;
if(cyc>=evt){pc=3184;return;}
case 3184:cyc+=8;E=38;
if(cyc>=evt){pc=3186;return;}
case 3186:cyc+=24;push(3189);pc=10425;return;
if(cyc>=evt){pc=3189;return;}
case 3189:cyc+=16;pc=4307;return;
case 3192:cyc+=24;push(3195);pc=11855;return;
if(cyc>=evt){pc=3195;return;}
case 3195:cyc+=8;cp(5);
if(cyc>=evt){pc=3197;return;}
case 3197:cyc+=8;if(!fc){cyc+=4;pc=3211;return;}
if(cyc>=evt){pc=3199;return;}
case 3199:cyc+=8;A=111;
if(cyc>=evt){pc=3201;return;}
case 3201:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3204;return;}
case 3204:cyc+=4;xor(A);
if(cyc>=evt){pc=3205;return;}
case 3205:cyc+=16;wr(49463,A);
if(cyc>=evt){pc=3208;return;}
case 3208:cyc+=16;pc=4307;return;
case 3211:cyc+=8;cp(8);
if(cyc>=evt){pc=3213;return;}
case 3213:cyc+=8;if(!fc){cyc+=4;pc=3224;return;}
if(cyc>=evt){pc=3215;return;}
case 3215:cyc+=24;push(3218);pc=14907;return;
if(cyc>=evt){pc=3218;return;}
case 3218:cyc+=12;if(!fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=3221;return;}
case 3221:cyc+=16;pc=3450;return;
case 3224:cyc+=8;A=109;
if(cyc>=evt){pc=3226;return;}
case 3226:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3229;return;}
case 3229:cyc+=16;pc=4307;return;
case 3232:cyc+=24;push(3235);pc=14907;return;
if(cyc>=evt){pc=3235;return;}
case 3235:cyc+=12;if(!fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=3238;return;}
case 3238:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=3241;return;}
case 3241:cyc+=8;cp(32);
if(cyc>=evt){pc=3243;return;}
case 3243:cyc+=8;if(fz){cyc+=4;pc=3277;return;}
if(cyc>=evt){pc=3245;return;}
case 3245:cyc+=8;cp(34);
if(cyc>=evt){pc=3247;return;}
case 3247:cyc+=8;if(!fz){cyc+=4;pc=3290;return;}
if(cyc>=evt){pc=3249;return;}
case 3249:cyc+=24;push(3252);pc=14864;return;
if(cyc>=evt){pc=3252;return;}
case 3252:cyc+=24;push(3255);pc=14879;return;
if(cyc>=evt){pc=3255;return;}
case 3255:cyc+=8;if(!fz){cyc+=4;pc=3277;return;}
if(cyc>=evt){pc=3257;return;}
case 3257:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=3260;return;}
case 3260:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3262;return;}
case 3262:cyc+=8;if(!fz){cyc+=4;pc=3277;return;}
if(cyc>=evt){pc=3264;return;}
case 3264:cyc+=8;A=124;
if(cyc>=evt){pc=3266;return;}
case 3266:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3269;return;}
case 3269:cyc+=8;E=23;
if(cyc>=evt){pc=3271;return;}
case 3271:cyc+=24;push(3274);pc=10425;return;
if(cyc>=evt){pc=3274;return;}
case 3274:cyc+=16;pc=4307;return;
case 3277:cyc+=8;E=23;
if(cyc>=evt){pc=3279;return;}
case 3279:cyc+=24;push(3282);pc=10425;return;
if(cyc>=evt){pc=3282;return;}
case 3282:cyc+=8;A=109;
if(cyc>=evt){pc=3284;return;}
case 3284:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3287;return;}
case 3287:cyc+=16;pc=4307;return;
case 3290:cyc+=8;A=109;
if(cyc>=evt){pc=3292;return;}
case 3292:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3295;return;}
case 3295:cyc+=16;A=rd(49459);
if(cyc>=evt){pc=3298;return;}
case 3298:cyc+=8;cp(124);
if(cyc>=evt){pc=3300;return;}
case 3300:cyc+=8;if(!fz){cyc+=4;pc=3363;return;}
if(cyc>=evt){pc=3302;return;}
case 3302:cyc+=4;xor(A);
if(cyc>=evt){pc=3303;return;}
case 3303:cyc+=16;wr(49504,A);
if(cyc>=evt){pc=3306;return;}
case 3306:cyc+=8;A=1;
if(cyc>=evt){pc=3308;return;}
case 3308:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=3311;return;}
case 3311:cyc+=8;A=128;
if(cyc>=evt){pc=3313;return;}
case 3313:cyc+=16;wr(49429,A);
if(cyc>=evt){pc=3316;return;}
case 3316:cyc+=12;H=193;L=28;
if(cyc>=evt){pc=3319;return;}
case 3319:cyc+=16;wr((H<<8|L),rd((H<<8|L))|1);
if(cyc>=evt){pc=3321;return;}
case 3321:cyc+=24;push(3324);pc=13282;return;
if(cyc>=evt){pc=3324;return;}
case 3324:cyc+=12;B=64;C=26;
if(cyc>=evt){pc=3327;return;}
case 3327:cyc+=24;push(3330);pc=15065;return;
if(cyc>=evt){pc=3330;return;}
case 3330:cyc+=24;push(3333);pc=10773;return;
if(cyc>=evt){pc=3333;return;}
case 3333:cyc+=8;A=21;
if(cyc>=evt){pc=3335;return;}
case 3335:cyc+=24;push(3338);pc=14993;return;
if(cyc>=evt){pc=3338;return;}
case 3338:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=3341;return;}
case 3341:cyc+=8;cp(13);
if(cyc>=evt){pc=3343;return;}
case 3343:cyc+=12;if(!fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=3346;return;}
case 3346:cyc+=12;B=2;C=13;
if(cyc>=evt){pc=3349;return;}
case 3349:cyc+=8;E=0;
if(cyc>=evt){pc=3351;return;}
case 3351:cyc+=24;push(3354);pc=12020;return;
if(cyc>=evt){pc=3354;return;}
case 3354:cyc+=12;B=64;C=69;
if(cyc>=evt){pc=3357;return;}
case 3357:cyc+=24;push(3360);pc=15065;return;
if(cyc>=evt){pc=3360;return;}
case 3360:cyc+=16;pc=4307;return;
case 3363:cyc+=8;cp(116);
if(cyc>=evt){pc=3365;return;}
case 3365:cyc+=8;if(fz){cyc+=4;pc=3375;return;}
if(cyc>=evt){pc=3367;return;}
case 3367:cyc+=8;cp(33);
if(cyc>=evt){pc=3369;return;}
case 3369:cyc+=8;if(fz){cyc+=4;pc=3386;return;}
if(cyc>=evt){pc=3371;return;}
case 3371:cyc+=8;cp(117);
if(cyc>=evt){pc=3373;return;}
case 3373:cyc+=8;if(!fz){cyc+=4;pc=3394;return;}
if(cyc>=evt){pc=3375;return;}
case 3375:cyc+=24;push(3378);pc=14879;return;
if(cyc>=evt){pc=3378;return;}
case 3378:cyc+=8;A=109;
if(cyc>=evt){pc=3380;return;}
case 3380:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3383;return;}
case 3383:cyc+=16;pc=4307;return;
case 3386:cyc+=24;push(3389);pc=14864;return;
if(cyc>=evt){pc=3389;return;}
case 3389:cyc+=8;if(!fz){cyc+=4;pc=3378;return;}
if(cyc>=evt){pc=3391;return;}
case 3391:cyc+=16;pc=3703;return;
case 3394:cyc+=8;cp(109);
if(cyc>=evt){pc=3396;return;}
case 3396:cyc+=8;if(!fz){cyc+=4;pc=3504;return;}
if(cyc>=evt){pc=3398;return;}
case 3398:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3401;return;}
case 3401:cyc+=12;H=193;L=24;
if(cyc>=evt){pc=3404;return;}
case 3404:cyc+=12;wr((H<<8|L),inc(rd((H<<8|L))));
if(cyc>=evt){pc=3405;return;}
case 3405:cyc+=16;A=rd(49433);
if(cyc>=evt){pc=3408;return;}
case 3408:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=3409;return;}
case 3409:cyc+=12;if(!fc){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=3412;return;}
case 3412:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=3415;return;}
case 3415:cyc+=8;cp(27);
if(cyc>=evt){pc=3417;return;}
case 3417:cyc+=12;if(fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=3420;return;}
case 3420:cyc+=8;cp(22);
if(cyc>=evt){pc=3422;return;}
case 3422:cyc+=8;if(fz){cyc+=4;pc=3487;return;}
if(cyc>=evt){pc=3424;return;}
case 3424:cyc+=24;push(3427);pc=11855;return;
if(cyc>=evt){pc=3427;return;}
case 3427:cyc+=8;cp(6);
if(cyc>=evt){pc=3429;return;}
case 3429:cyc+=8;if(!fc){cyc+=4;pc=3450;return;}
if(cyc>=evt){pc=3431;return;}
case 3431:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=3434;return;}
case 3434:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3436;return;}
case 3436:cyc+=8;if(!fz){cyc+=4;pc=3487;return;}
if(cyc>=evt){pc=3438;return;}
case 3438:cyc+=8;A=111;
pc=3440;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 3440:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3443;return;}
case 3443:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=3445;return;}
case 3445:cyc+=16;wr(49417,A);
if(cyc>=evt){pc=3448;return;}
case 3448:cyc+=12;pc=3487;return;
case 3450:cyc+=16;A=rd(49434);
if(cyc>=evt){pc=3453;return;}
case 3453:cyc+=4;and(A);
if(cyc>=evt){pc=3454;return;}
case 3454:cyc+=8;if(fz){cyc+=4;pc=3461;return;}
if(cyc>=evt){pc=3456;return;}
case 3456:cyc+=24;push(3459);pc=13362;return;
if(cyc>=evt){pc=3459;return;}
case 3459:cyc+=12;pc=3464;return;
case 3461:cyc+=24;push(3464);pc=13444;return;
if(cyc>=evt){pc=3464;return;}
case 3464:cyc+=24;push(3467);pc=13498;return;
if(cyc>=evt){pc=3467;return;}
case 3467:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3469;return;}
case 3469:cyc+=12;if(!fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=3472;return;}
case 3472:cyc+=8;fz=(A>>5)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3474;return;}
case 3474:cyc+=12;if(!fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=3477;return;}
case 3477:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3479;return;}
case 3479:cyc+=12;if(fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=3482;return;}
case 3482:cyc+=8;A=110;
if(cyc>=evt){pc=3484;return;}
case 3484:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3487;return;}
case 3487:cyc+=16;A=rd(49431);
if(cyc>=evt){pc=3490;return;}
case 3490:cyc+=16;wr(49433,A);
if(cyc>=evt){pc=3493;return;}
case 3493:cyc+=24;push(3496);pc=7618;return;
if(cyc>=evt){pc=3496;return;}
case 3496:cyc+=8;and(3);
if(cyc>=evt){pc=3498;return;}
case 3498:cyc+=16;wr(49432,A);
if(cyc>=evt){pc=3501;return;}
case 3501:cyc+=16;pc=4307;return;
case 3504:cyc+=8;cp(111);
if(cyc>=evt){pc=3506;return;}
case 3506:cyc+=8;if(!fz){cyc+=4;pc=3487;return;}
if(cyc>=evt){pc=3508;return;}
case 3508:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=3511;return;}
case 3511:cyc+=8;cp(106);
if(cyc>=evt){pc=3513;return;}
case 3513:cyc+=8;if(fz){cyc+=4;pc=3588;return;}
if(cyc>=evt){pc=3515;return;}
case 3515:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=3517;return;}
case 3517:cyc+=12;H=193;L=9;
if(cyc>=evt){pc=3520;return;}
case 3520:cyc+=8;xor(rd((H<<8|L)));
if(cyc>=evt){pc=3521;return;}
case 3521:cyc+=8;and(66);
if(cyc>=evt){pc=3523;return;}
case 3523:cyc+=8;if(fz){cyc+=4;pc=3588;return;}
if(cyc>=evt){pc=3525;return;}
case 3525:cyc+=8;A=113;
if(cyc>=evt){pc=3527;return;}
case 3527:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3530;return;}
case 3530:cyc+=8;E=29;
if(cyc>=evt){pc=3532;return;}
case 3532:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=3535;return;}
case 3535:cyc+=4;and(A);
if(cyc>=evt){pc=3536;return;}
case 3536:cyc+=8;if(!fz){cyc+=4;pc=3562;return;}
if(cyc>=evt){pc=3538;return;}
case 3538:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=3541;return;}
case 3541:cyc+=8;cp(2);
if(cyc>=evt){pc=3543;return;}
case 3543:cyc+=8;if(fc){cyc+=4;pc=3559;return;}
if(cyc>=evt){pc=3545;return;}
case 3545:cyc+=24;push(3548);pc=13346;return;
if(cyc>=evt){pc=3548;return;}
case 3548:cyc+=24;push(3551);pc=13498;return;
if(cyc>=evt){pc=3551;return;}
case 3551:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3553;return;}
case 3553:cyc+=8;if(!fz){cyc+=4;pc=3559;return;}
if(cyc>=evt){pc=3555;return;}
case 3555:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3557;return;}
case 3557:cyc+=8;if(!fz){cyc+=4;pc=3583;return;}
if(cyc>=evt){pc=3559;return;}
case 3559:cyc+=4;E=inc(E);
if(cyc>=evt){pc=3560;return;}
case 3560:cyc+=12;pc=3583;return;
case 3562:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=3565;return;}
case 3565:cyc+=8;cp(17);
if(cyc>=evt){pc=3567;return;}
case 3567:cyc+=8;if(!fc){cyc+=4;pc=3559;return;}
if(cyc>=evt){pc=3569;return;}
case 3569:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3571;return;}
case 3571:cyc+=8;if(!fz){cyc+=4;pc=3578;return;}
if(cyc>=evt){pc=3573;return;}
case 3573:cyc+=24;push(3576);pc=13304;return;
if(cyc>=evt){pc=3576;return;}
case 3576:cyc+=12;pc=3548;return;
case 3578:cyc+=24;push(3581);pc=13422;return;
if(cyc>=evt){pc=3581;return;}
case 3581:cyc+=12;pc=3548;return;
case 3583:cyc+=24;push(3586);pc=10425;return;
if(cyc>=evt){pc=3586;return;}
case 3586:cyc+=12;pc=3487;return;
case 3588:cyc+=24;push(3591);pc=11855;return;
if(cyc>=evt){pc=3591;return;}
case 3591:cyc+=8;cp(6);
if(cyc>=evt){pc=3593;return;}
case 3593:cyc+=8;if(!fc){cyc+=4;pc=3718;return;}
if(cyc>=evt){pc=3595;return;}
case 3595:cyc+=8;cp(5);
if(cyc>=evt){pc=3597;return;}
case 3597:cyc+=8;if(!fz){cyc+=4;pc=3606;return;}
if(cyc>=evt){pc=3599;return;}
case 3599:cyc+=16;A=rd(49456);
if(cyc>=evt){pc=3602;return;}
case 3602:cyc+=8;cp(25);
if(cyc>=evt){pc=3604;return;}
case 3604:cyc+=8;if(fz){cyc+=4;pc=3718;return;}
if(cyc>=evt){pc=3606;return;}
case 3606:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=3609;return;}
case 3609:cyc+=8;cp(106);
if(cyc>=evt){pc=3611;return;}
case 3611:cyc+=8;if(fz){cyc+=4;pc=3636;return;}
if(cyc>=evt){pc=3613;return;}
case 3613:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=3615;return;}
case 3615:cyc+=12;H=193;L=9;
if(cyc>=evt){pc=3618;return;}
case 3618:cyc+=8;xor(rd((H<<8|L)));
if(cyc>=evt){pc=3619;return;}
case 3619:cyc+=8;and(1);
if(cyc>=evt){pc=3621;return;}
case 3621:cyc+=8;if(fz){cyc+=4;pc=3636;return;}
if(cyc>=evt){pc=3623;return;}
case 3623:cyc+=8;E=34;
if(cyc>=evt){pc=3625;return;}
case 3625:cyc+=16;A=rd(49501);
if(cyc>=evt){pc=3628;return;}
case 3628:cyc+=8;cp(2);
if(cyc>=evt){pc=3630;return;}
case 3630:cyc+=8;if(fc){cyc+=4;pc=3703;return;}
if(cyc>=evt){pc=3632;return;}
case 3632:cyc+=12;pc=3709;return;
case 3636:cyc+=8;E=32;
if(cyc>=evt){pc=3638;return;}
case 3638:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=3641;return;}
case 3641:cyc+=4;and(A);
if(cyc>=evt){pc=3642;return;}
case 3642:cyc+=8;if(!fz){cyc+=4;pc=3668;return;}
if(cyc>=evt){pc=3644;return;}
case 3644:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=3647;return;}
case 3647:cyc+=8;cp(2);
if(cyc>=evt){pc=3649;return;}
case 3649:cyc+=8;if(fc){cyc+=4;pc=3665;return;}
if(cyc>=evt){pc=3651;return;}
case 3651:cyc+=24;push(3654);pc=13346;return;
if(cyc>=evt){pc=3654;return;}
case 3654:cyc+=24;push(3657);pc=13498;return;
if(cyc>=evt){pc=3657;return;}
case 3657:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3659;return;}
case 3659:cyc+=8;if(!fz){cyc+=4;pc=3665;return;}
if(cyc>=evt){pc=3661;return;}
case 3661:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3663;return;}
case 3663:cyc+=8;if(!fz){cyc+=4;pc=3698;return;}
if(cyc>=evt){pc=3665;return;}
case 3665:cyc+=4;E=inc(E);
if(cyc>=evt){pc=3666;return;}
case 3666:cyc+=12;pc=3698;return;
case 3668:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=3671;return;}
case 3671:cyc+=8;cp(17);
if(cyc>=evt){pc=3673;return;}
case 3673:cyc+=8;if(!fc){cyc+=4;pc=3665;return;}
if(cyc>=evt){pc=3675;return;}
case 3675:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=3677;return;}
case 3677:cyc+=8;if(!fz){cyc+=4;pc=3684;return;}
if(cyc>=evt){pc=3679;return;}
case 3679:cyc+=24;push(3682);pc=13304;return;
if(cyc>=evt){pc=3682;return;}
case 3682:cyc+=12;pc=3687;return;
case 3684:cyc+=24;push(3687);pc=13422;return;
if(cyc>=evt){pc=3687;return;}
case 3687:cyc+=8;cp(11);
if(cyc>=evt){pc=3689;return;}
case 3689:cyc+=8;if(!fz){cyc+=4;pc=3654;return;}
if(cyc>=evt){pc=3691;return;}
case 3691:cyc+=12;H=193;L=17;
if(cyc>=evt){pc=3694;return;}
case 3694:cyc+=16;wr((H<<8|L),rd((H<<8|L))&254);
if(cyc>=evt){pc=3696;return;}
case 3696:cyc+=12;pc=3654;return;
case 3698:cyc+=24;push(3701);pc=14864;return;
if(cyc>=evt){pc=3701;return;}
case 3701:cyc+=8;if(!fz){cyc+=4;pc=3709;return;}
if(cyc>=evt){pc=3703;return;}
case 3703:cyc+=4;xor(A);
if(cyc>=evt){pc=3704;return;}
case 3704:cyc+=16;wr(49462,A);
if(cyc>=evt){pc=3707;return;}
case 3707:cyc+=8;E=37;
if(cyc>=evt){pc=3709;return;}
case 3709:cyc+=24;push(3712);pc=10425;return;
if(cyc>=evt){pc=3712;return;}
case 3712:cyc+=12;B=64;C=124;
if(cyc>=evt){pc=3715;return;}
case 3715:cyc+=24;push(3718);pc=15065;return;
if(cyc>=evt){pc=3718;return;}
case 3718:cyc+=8;A=112;
if(cyc>=evt){pc=3720;return;}
case 3720:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3723;return;}
case 3723:cyc+=16;pc=3487;return;
case 3726:if(GK[3726]){pc=3726;if(ghooks[3726]())return;}
cyc+=8;A=1;
if(cyc>=evt){pc=3728;return;}
case 3728:cyc+=16;wr(49499,A);
if(cyc>=evt){pc=3731;return;}
case 3731:cyc+=16;A=rd(49503);
if(cyc>=evt){pc=3734;return;}
case 3734:cyc+=16;wr(49502,A);
if(cyc>=evt){pc=3737;return;}
case 3737:cyc+=12;A=rd(65420);
if(cyc>=evt){pc=3739;return;}
case 3739:cyc+=8;and(12);
if(cyc>=evt){pc=3741;return;}
case 3741:cyc+=12;if(!fz){cyc+=4;pc=2096;return;}
if(cyc>=evt){pc=3744;return;}
case 3744:cyc+=16;pc=4307;return;
case 3747:cyc+=12;B=4;C=4;
if(cyc>=evt){pc=3750;return;}
case 3750:cyc+=24;push(3753);pc=14894;return;
if(cyc>=evt){pc=3753;return;}
case 3753:cyc+=12;if(!fz){cyc+=4;pc=3906;return;}
if(cyc>=evt){pc=3756;return;}
case 3756:cyc+=24;push(3759);pc=14907;return;
if(cyc>=evt){pc=3759;return;}
case 3759:cyc+=12;if(!fz){cyc+=4;pc=3906;return;}
if(cyc>=evt){pc=3762;return;}
case 3762:cyc+=24;push(3765);pc=14923;return;
if(cyc>=evt){pc=3765;return;}
case 3765:cyc+=12;if(!fz){cyc+=4;pc=3906;return;}
if(cyc>=evt){pc=3768;return;}
case 3768:cyc+=12;B=64;C=0;
if(cyc>=evt){pc=3771;return;}
case 3771:cyc+=24;push(3774);pc=14962;return;
if(cyc>=evt){pc=3774;return;}
case 3774:cyc+=12;if(!fz){cyc+=4;pc=3906;return;}
if(cyc>=evt){pc=3777;return;}
case 3777:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=3780;return;}
case 3780:cyc+=4;and(A);
if(cyc>=evt){pc=3781;return;}
case 3781:cyc+=8;if(!fz){cyc+=4;pc=3906;return;}
if(cyc>=evt){pc=3783;return;}
case 3783:cyc+=16;wr(49437,A);
if(cyc>=evt){pc=3786;return;}
case 3786:cyc+=16;A=rd(49327);
if(cyc>=evt){pc=3789;return;}
case 3789:cyc+=8;cp(13);
if(cyc>=evt){pc=3791;return;}
case 3791:cyc+=8;if(!fz){cyc+=4;pc=3906;return;}
if(cyc>=evt){pc=3793;return;}
case 3793:cyc+=4;xor(A);
if(cyc>=evt){pc=3794;return;}
case 3794:cyc+=16;wr(49505,A);
if(cyc>=evt){pc=3797;return;}
case 3797:cyc+=16;A=rd(49462);
if(cyc>=evt){pc=3800;return;}
case 3800:cyc+=4;and(A);
if(cyc>=evt){pc=3801;return;}
case 3801:cyc+=8;if(!fz){cyc+=4;pc=3906;return;}
if(cyc>=evt){pc=3803;return;}
case 3803:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=3806;return;}
case 3806:cyc+=8;xor(1);
if(cyc>=evt){pc=3808;return;}
case 3808:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=3811;return;}
case 3811:cyc+=8;A=sla(A);
if(cyc>=evt){pc=3813;return;}
case 3813:cyc+=4;C=A;
if(cyc>=evt){pc=3814;return;}
case 3814:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=3817;return;}
case 3817:cyc+=8;sub(8);
if(cyc>=evt){pc=3819;return;}
case 3819:cyc+=8;cp(4);
if(cyc>=evt){pc=3821;return;}
case 3821:cyc+=8;if(!fc){cyc+=4;pc=3836;return;}
if(cyc>=evt){pc=3823;return;}
case 3823:cyc+=8;xor(255);
if(cyc>=evt){pc=3825;return;}
case 3825:cyc+=4;A=inc(A);
if(cyc>=evt){pc=3826;return;}
case 3826:cyc+=8;add(8);
if(cyc>=evt){pc=3828;return;}
case 3828:cyc+=4;sub(C);
if(cyc>=evt){pc=3829;return;}
case 3829:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=3832;return;}
case 3832:cyc+=8;cp(6);
if(cyc>=evt){pc=3834;return;}
case 3834:cyc+=8;if(!fc){cyc+=4;pc=3840;return;}
if(cyc>=evt){pc=3836;return;}
case 3836:cyc+=8;A=107;
if(cyc>=evt){pc=3838;return;}
case 3838:cyc+=12;pc=3843;return;
case 3840:cyc+=16;A=rd(49456);
if(cyc>=evt){pc=3843;return;}
case 3843:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3846;return;}
case 3846:cyc+=16;A=rd(49456);
if(cyc>=evt){pc=3849;return;}
case 3849:cyc+=8;cp(96);
if(cyc>=evt){pc=3851;return;}
case 3851:cyc+=12;if(!fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=3854;return;}
case 3854:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=3857;return;}
case 3857:cyc+=8;cp(10);
if(cyc>=evt){pc=3859;return;}
case 3859:cyc+=12;if(!fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=3862;return;}
case 3862:cyc+=8;A=8;
if(cyc>=evt){pc=3864;return;}
case 3864:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=3867;return;}
case 3867:cyc+=12;H=64;L=1;
if(cyc>=evt){pc=3870;return;}
case 3870:cyc+=24;push(3873);pc=14918;return;
if(cyc>=evt){pc=3873;return;}
case 3873:cyc+=12;B=3;C=3;
if(cyc>=evt){pc=3876;return;}
case 3876:cyc+=8;E=5;
if(cyc>=evt){pc=3878;return;}
case 3878:cyc+=24;push(3881);pc=11964;return;
if(cyc>=evt){pc=3881;return;}
case 3881:cyc+=12;B=3;C=2;
if(cyc>=evt){pc=3884;return;}
case 3884:cyc+=8;E=0;
if(cyc>=evt){pc=3886;return;}
case 3886:cyc+=24;push(3889);pc=11964;return;
if(cyc>=evt){pc=3889;return;}
case 3889:cyc+=8;A=1;
if(cyc>=evt){pc=3891;return;}
case 3891:cyc+=16;wr(49501,A);
if(cyc>=evt){pc=3894;return;}
case 3894:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=3897;return;}
case 3897:cyc+=12;B=64;C=161;
if(cyc>=evt){pc=3900;return;}
case 3900:cyc+=24;push(3903);pc=15065;return;
if(cyc>=evt){pc=3903;return;}
case 3903:cyc+=16;pc=4307;return;
case 3906:cyc+=24;push(3909);pc=13304;return;
if(cyc>=evt){pc=3909;return;}
case 3909:cyc+=8;cp(31);
if(cyc>=evt){pc=3911;return;}
case 3911:cyc+=8;if(!fz){cyc+=4;pc=3927;return;}
if(cyc>=evt){pc=3913;return;}
case 3913:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=3916;return;}
case 3916:cyc+=24;push(3919);pc=11870;return;
if(cyc>=evt){pc=3919;return;}
case 3919:cyc+=8;E=1;
if(cyc>=evt){pc=3921;return;}
case 3921:cyc+=24;push(3924);pc=11964;return;
if(cyc>=evt){pc=3924;return;}
case 3924:cyc+=16;pc=4307;return;
case 3927:cyc+=12;B=6;C=1;
if(cyc>=evt){pc=3930;return;}
case 3930:cyc+=24;push(3933);pc=14894;return;
if(cyc>=evt){pc=3933;return;}
case 3933:cyc+=8;if(!fz){cyc+=4;pc=3979;return;}
if(cyc>=evt){pc=3935;return;}
case 3935:cyc+=24;push(3938);pc=14907;return;
if(cyc>=evt){pc=3938;return;}
case 3938:cyc+=8;if(!fz){cyc+=4;pc=3979;return;}
if(cyc>=evt){pc=3940;return;}
case 3940:cyc+=24;push(3943);pc=14923;return;
if(cyc>=evt){pc=3943;return;}
case 3943:cyc+=8;if(!fz){cyc+=4;pc=3979;return;}
if(cyc>=evt){pc=3945;return;}
case 3945:cyc+=12;B=64;C=0;
if(cyc>=evt){pc=3948;return;}
case 3948:cyc+=24;push(3951);pc=14962;return;
if(cyc>=evt){pc=3951;return;}
case 3951:cyc+=8;if(!fz){cyc+=4;pc=3979;return;}
if(cyc>=evt){pc=3953;return;}
case 3953:cyc+=8;A=0;
if(cyc>=evt){pc=3955;return;}
case 3955:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=3958;return;}
case 3958:cyc+=8;A=1;
if(cyc>=evt){pc=3960;return;}
case 3960:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=3963;return;}
case 3963:cyc+=16;wr(49437,A);
if(cyc>=evt){pc=3966;return;}
case 3966:cyc+=24;push(3969);pc=13406;return;
if(cyc>=evt){pc=3969;return;}
case 3969:cyc+=8;cp(4);
pc=3971;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 3971:cyc+=8;if(!fz){cyc+=4;pc=3979;return;}
if(cyc>=evt){pc=3973;return;}
case 3973:cyc+=12;H=64;L=11;
if(cyc>=evt){pc=3976;return;}
case 3976:cyc+=24;push(3979);pc=14918;return;
if(cyc>=evt){pc=3979;return;}
case 3979:cyc+=12;B=5;C=24;
if(cyc>=evt){pc=3982;return;}
case 3982:cyc+=24;push(3985);pc=14894;return;
if(cyc>=evt){pc=3985;return;}
case 3985:cyc+=8;if(!fz){cyc+=4;pc=4063;return;}
if(cyc>=evt){pc=3987;return;}
case 3987:cyc+=12;B=23;C=1;
if(cyc>=evt){pc=3990;return;}
case 3990:cyc+=24;push(3993);pc=12048;return;
if(cyc>=evt){pc=3993;return;}
case 3993:cyc+=8;cp(64);
if(cyc>=evt){pc=3995;return;}
case 3995:cyc+=8;if(fz){cyc+=4;pc=4063;return;}
if(cyc>=evt){pc=3997;return;}
case 3997:cyc+=24;push(4000);pc=14907;return;
if(cyc>=evt){pc=4000;return;}
case 4000:cyc+=8;if(!fz){cyc+=4;pc=4063;return;}
if(cyc>=evt){pc=4002;return;}
case 4002:cyc+=24;push(4005);pc=14923;return;
if(cyc>=evt){pc=4005;return;}
case 4005:cyc+=8;if(!fz){cyc+=4;pc=4063;return;}
if(cyc>=evt){pc=4007;return;}
case 4007:cyc+=12;B=64;C=0;
if(cyc>=evt){pc=4010;return;}
case 4010:cyc+=24;push(4013);pc=14962;return;
if(cyc>=evt){pc=4013;return;}
case 4013:cyc+=8;if(!fz){cyc+=4;pc=4028;return;}
if(cyc>=evt){pc=4015;return;}
case 4015:cyc+=8;A=255;
if(cyc>=evt){pc=4017;return;}
case 4017:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=4020;return;}
case 4020:cyc+=12;H=64;L=14;
if(cyc>=evt){pc=4023;return;}
case 4023:cyc+=24;push(4026);pc=14918;return;
if(cyc>=evt){pc=4026;return;}
case 4026:cyc+=12;pc=4063;return;
case 4028:cyc+=12;B=64;C=18;
if(cyc>=evt){pc=4031;return;}
case 4031:cyc+=24;push(4034);pc=14962;return;
if(cyc>=evt){pc=4034;return;}
case 4034:cyc+=8;if(!fz){cyc+=4;pc=4049;return;}
if(cyc>=evt){pc=4036;return;}
case 4036:cyc+=24;push(4039);pc=14952;return;
if(cyc>=evt){pc=4039;return;}
case 4039:cyc+=12;B=23;C=2;
if(cyc>=evt){pc=4042;return;}
case 4042:cyc+=8;E=1;
if(cyc>=evt){pc=4044;return;}
case 4044:cyc+=24;push(4047);pc=11964;return;
if(cyc>=evt){pc=4047;return;}
case 4047:cyc+=12;pc=4063;return;
case 4049:cyc+=12;B=64;C=21;
if(cyc>=evt){pc=4052;return;}
case 4052:cyc+=24;push(4055);pc=14962;return;
if(cyc>=evt){pc=4055;return;}
case 4055:cyc+=8;if(!fz){cyc+=4;pc=4063;return;}
if(cyc>=evt){pc=4057;return;}
case 4057:cyc+=24;push(4060);pc=14952;return;
if(cyc>=evt){pc=4060;return;}
case 4060:cyc+=24;push(4063);pc=11099;return;
if(cyc>=evt){pc=4063;return;}
case 4063:cyc+=12;B=8;C=16;
if(cyc>=evt){pc=4066;return;}
case 4066:cyc+=24;push(4069);pc=14894;return;
if(cyc>=evt){pc=4069;return;}
case 4069:cyc+=8;if(!fz){cyc+=4;pc=4157;return;}
if(cyc>=evt){pc=4071;return;}
case 4071:cyc+=12;B=2;C=21;
if(cyc>=evt){pc=4074;return;}
case 4074:cyc+=24;push(4077);pc=12048;return;
if(cyc>=evt){pc=4077;return;}
case 4077:cyc+=8;cp(64);
if(cyc>=evt){pc=4079;return;}
case 4079:cyc+=8;if(fz){cyc+=4;pc=4157;return;}
if(cyc>=evt){pc=4081;return;}
case 4081:cyc+=24;push(4084);pc=14907;return;
if(cyc>=evt){pc=4084;return;}
case 4084:cyc+=8;if(!fz){cyc+=4;pc=4157;return;}
if(cyc>=evt){pc=4086;return;}
case 4086:cyc+=24;push(4089);pc=14923;return;
if(cyc>=evt){pc=4089;return;}
case 4089:cyc+=8;if(!fz){cyc+=4;pc=4157;return;}
if(cyc>=evt){pc=4091;return;}
case 4091:cyc+=12;B=64;C=0;
if(cyc>=evt){pc=4094;return;}
case 4094:cyc+=24;push(4097);pc=14962;return;
if(cyc>=evt){pc=4097;return;}
case 4097:cyc+=8;if(!fz){cyc+=4;pc=4143;return;}
if(cyc>=evt){pc=4099;return;}
case 4099:cyc+=12;B=15;C=3;
if(cyc>=evt){pc=4102;return;}
case 4102:cyc+=24;push(4105);pc=12048;return;
if(cyc>=evt){pc=4105;return;}
case 4105:cyc+=8;cp(64);
if(cyc>=evt){pc=4107;return;}
case 4107:cyc+=8;if(!fz){cyc+=4;pc=4157;return;}
if(cyc>=evt){pc=4109;return;}
case 4109:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=4112;return;}
case 4112:cyc+=8;cp(6);
if(cyc>=evt){pc=4114;return;}
case 4114:cyc+=8;if(!fz){cyc+=4;pc=4157;return;}
if(cyc>=evt){pc=4116;return;}
case 4116:cyc+=8;A=26;
if(cyc>=evt){pc=4118;return;}
case 4118:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=4121;return;}
case 4121:cyc+=8;A=1;
if(cyc>=evt){pc=4123;return;}
case 4123:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=4126;return;}
case 4126:cyc+=4;xor(A);
if(cyc>=evt){pc=4127;return;}
case 4127:cyc+=16;wr(49505,A);
if(cyc>=evt){pc=4130;return;}
case 4130:cyc+=12;H=64;L=27;
if(cyc>=evt){pc=4133;return;}
case 4133:cyc+=24;push(4136);pc=14918;return;
if(cyc>=evt){pc=4136;return;}
case 4136:cyc+=8;A=10;
if(cyc>=evt){pc=4138;return;}
case 4138:cyc+=16;wr(49510,A);
if(cyc>=evt){pc=4141;return;}
case 4141:cyc+=12;pc=4157;return;
case 4143:cyc+=12;B=64;C=34;
if(cyc>=evt){pc=4146;return;}
case 4146:cyc+=24;push(4149);pc=14962;return;
if(cyc>=evt){pc=4149;return;}
case 4149:cyc+=8;if(!fz){cyc+=4;pc=4157;return;}
if(cyc>=evt){pc=4151;return;}
case 4151:cyc+=24;push(4154);pc=14952;return;
if(cyc>=evt){pc=4154;return;}
case 4154:cyc+=24;push(4157);pc=11099;return;
if(cyc>=evt){pc=4157;return;}
case 4157:cyc+=12;B=12;C=15;
if(cyc>=evt){pc=4160;return;}
case 4160:cyc+=24;push(4163);pc=14894;return;
if(cyc>=evt){pc=4163;return;}
case 4163:cyc+=12;if(!fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=4166;return;}
case 4166:cyc+=24;push(4169);pc=14907;return;
if(cyc>=evt){pc=4169;return;}
case 4169:cyc+=12;if(!fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=4172;return;}
case 4172:cyc+=24;push(4175);pc=14923;return;
if(cyc>=evt){pc=4175;return;}
case 4175:cyc+=12;if(!fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=4178;return;}
case 4178:cyc+=12;B=64;C=0;
if(cyc>=evt){pc=4181;return;}
case 4181:cyc+=24;push(4184);pc=14962;return;
if(cyc>=evt){pc=4184;return;}
case 4184:cyc+=8;if(!fz){cyc+=4;pc=4206;return;}
if(cyc>=evt){pc=4186;return;}
case 4186:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=4189;return;}
case 4189:cyc+=8;cp(2);
if(cyc>=evt){pc=4191;return;}
case 4191:cyc+=8;if(!fc){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=4193;return;}
case 4193:cyc+=8;A=255;
if(cyc>=evt){pc=4195;return;}
case 4195:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=4198;return;}
case 4198:cyc+=12;H=64;L=40;
if(cyc>=evt){pc=4201;return;}
case 4201:cyc+=24;push(4204);pc=14918;return;
if(cyc>=evt){pc=4204;return;}
case 4204:cyc+=12;pc=4307;return;
case 4206:cyc+=12;B=64;C=43;
if(cyc>=evt){pc=4209;return;}
case 4209:cyc+=24;push(4212);pc=14962;return;
if(cyc>=evt){pc=4212;return;}
case 4212:cyc+=8;if(!fz){cyc+=4;pc=4232;return;}
if(cyc>=evt){pc=4214;return;}
case 4214:cyc+=24;push(4217);pc=14952;return;
if(cyc>=evt){pc=4217;return;}
case 4217:cyc+=8;A=1;
if(cyc>=evt){pc=4219;return;}
case 4219:cyc+=24;push(4222);pc=14993;return;
if(cyc>=evt){pc=4222;return;}
case 4222:cyc+=12;B=14;C=1;
if(cyc>=evt){pc=4225;return;}
case 4225:cyc+=8;E=1;
if(cyc>=evt){pc=4227;return;}
case 4227:cyc+=24;push(4230);pc=11964;return;
if(cyc>=evt){pc=4230;return;}
case 4230:cyc+=12;pc=4307;return;
case 4232:cyc+=12;B=64;C=45;
if(cyc>=evt){pc=4235;return;}
case 4235:cyc+=24;push(4238);pc=14962;return;
if(cyc>=evt){pc=4238;return;}
case 4238:cyc+=8;if(!fz){cyc+=4;pc=4250;return;}
if(cyc>=evt){pc=4240;return;}
case 4240:cyc+=24;push(4243);pc=14952;return;
if(cyc>=evt){pc=4243;return;}
case 4243:cyc+=8;A=5;
if(cyc>=evt){pc=4245;return;}
case 4245:cyc+=16;wr(49429,A);
if(cyc>=evt){pc=4248;return;}
case 4248:cyc+=12;pc=4307;return;
case 4250:cyc+=12;B=64;C=46;
if(cyc>=evt){pc=4253;return;}
case 4253:cyc+=24;push(4256);pc=14962;return;
if(cyc>=evt){pc=4256;return;}
case 4256:cyc+=8;if(!fz){cyc+=4;pc=4287;return;}
if(cyc>=evt){pc=4258;return;}
case 4258:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=4261;return;}
case 4261:cyc+=8;cp(0);
if(cyc>=evt){pc=4263;return;}
case 4263:cyc+=8;if(!fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=4265;return;}
case 4265:cyc+=24;push(4268);pc=11855;return;
if(cyc>=evt){pc=4268;return;}
case 4268:cyc+=8;add(2);
if(cyc>=evt){pc=4270;return;}
case 4270:cyc+=8;and(254);
if(cyc>=evt){pc=4272;return;}
case 4272:cyc+=4;E=A;
if(cyc>=evt){pc=4273;return;}
case 4273:cyc+=12;H=64;L=57;
if(cyc>=evt){pc=4276;return;}
case 4276:cyc+=4;A=L;
if(cyc>=evt){pc=4277;return;}
case 4277:cyc+=4;sub(E);
if(cyc>=evt){pc=4278;return;}
case 4278:cyc+=4;L=A;
if(cyc>=evt){pc=4279;return;}
case 4279:cyc+=8;if(!fc){cyc+=4;pc=4282;return;}
if(cyc>=evt){pc=4281;return;}
case 4281:cyc+=4;H=dec(H);
if(cyc>=evt){pc=4282;return;}
case 4282:cyc+=24;push(4285);pc=14918;return;
if(cyc>=evt){pc=4285;return;}
case 4285:cyc+=12;pc=4307;return;
case 4287:cyc+=12;B=64;C=58;
if(cyc>=evt){pc=4290;return;}
case 4290:cyc+=24;push(4293);pc=14962;return;
if(cyc>=evt){pc=4293;return;}
case 4293:cyc+=8;if(!fz){cyc+=4;pc=4307;return;}
if(cyc>=evt){pc=4295;return;}
case 4295:cyc+=24;push(4298);pc=14952;return;
if(cyc>=evt){pc=4298;return;}
case 4298:cyc+=24;push(4301);pc=11099;return;
if(cyc>=evt){pc=4301;return;}
case 4301:cyc+=12;B=64;C=161;
if(cyc>=evt){pc=4304;return;}
case 4304:cyc+=24;push(4307);pc=15065;return;
if(cyc>=evt){pc=4307;return;}
case 4307:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=4310;return;}
case 4310:cyc+=4;and(A);
if(cyc>=evt){pc=4311;return;}
case 4311:cyc+=8;if(!fz){cyc+=4;pc=4316;return;}
if(cyc>=evt){pc=4313;return;}
case 4313:cyc+=24;push(4316);pc=12071;return;
if(cyc>=evt){pc=4316;return;}
case 4316:cyc+=4;pc=4317;halted=1;return;
case 4317:cyc+=16;pc=2124;return;
case 4320:cyc+=4;ime=0;
if(cyc>=evt){pc=4321;return;}
case 4321:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=4322;return;}
case 4322:cyc+=16;pushaf();
if(cyc>=evt){pc=4323;return;}
case 4323:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=4324;return;}
case 4324:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=4325;return;}
case 4325:cyc+=16;A=rd(32767);
if(cyc>=evt){pc=4328;return;}
case 4328:cyc+=16;pushaf();
if(cyc>=evt){pc=4329;return;}
case 4329:cyc+=8;A=1;
if(cyc>=evt){pc=4331;return;}
case 4331:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=4334;return;}
case 4334:cyc+=16;A=rd(49496);
if(cyc>=evt){pc=4337;return;}
case 4337:cyc+=4;and(A);
if(cyc>=evt){pc=4338;return;}
case 4338:cyc+=8;if(!fz){cyc+=4;pc=4363;return;}
if(cyc>=evt){pc=4340;return;}
case 4340:cyc+=12;A=rd(65348);
if(cyc>=evt){pc=4342;return;}
case 4342:cyc+=8;cp(124);
if(cyc>=evt){pc=4344;return;}
case 4344:cyc+=8;if(fc){cyc+=4;pc=4340;return;}
if(cyc>=evt){pc=4346;return;}
case 4346:cyc+=8;A=147;
if(cyc>=evt){pc=4348;return;}
case 4348:cyc+=12;wr(65344,A);
if(cyc>=evt){pc=4350;return;}
case 4350:cyc+=12;A=rd(65348);
if(cyc>=evt){pc=4352;return;}
case 4352:cyc+=8;cp(144);
if(cyc>=evt){pc=4354;return;}
case 4354:cyc+=8;if(fc){cyc+=4;pc=4350;return;}
if(cyc>=evt){pc=4356;return;}
case 4356:cyc+=8;A=131;
if(cyc>=evt){pc=4358;return;}
case 4358:cyc+=12;wr(65344,A);
if(cyc>=evt){pc=4360;return;}
case 4360:cyc+=16;pc=4565;return;
case 4363:cyc+=12;D=194;E=0;
if(cyc>=evt){pc=4366;return;}
case 4366:cyc+=12;H=133;L=240;
if(cyc>=evt){pc=4369;return;}
case 4369:cyc+=12;B=103;C=19;
if(cyc>=evt){pc=4372;return;}
case 4372:cyc+=12;A=rd(65348);
if(cyc>=evt){pc=4374;return;}
case 4374:cyc+=4;cp(B);
if(cyc>=evt){pc=4375;return;}
case 4375:cyc+=8;if(fz){cyc+=4;pc=4372;return;}
if(cyc>=evt){pc=4377;return;}
case 4377:cyc+=4;B=A;
if(cyc>=evt){pc=4378;return;}
case 4378:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=4380;return;}
case 4380:cyc+=8;and(3);
if(cyc>=evt){pc=4382;return;}
case 4382:cyc+=8;if(!fz){cyc+=4;pc=4378;return;}
if(cyc>=evt){pc=4384;return;}
case 4384:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4385;return;}
case 4385:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4386;return;}
case 4386:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4387;return;}
case 4387:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4388;return;}
case 4388:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4389;return;}
case 4389:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4390;return;}
case 4390:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4391;return;}
case 4391:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4392;return;}
case 4392:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4393;return;}
case 4393:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4394;return;}
case 4394:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4395;return;}
case 4395:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4396;return;}
case 4396:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4397;return;}
case 4397:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4398;return;}
case 4398:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4399;return;}
case 4399:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4400;return;}
case 4400:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4401;return;}
case 4401:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4402;return;}
case 4402:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4403;return;}
case 4403:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4404;return;}
case 4404:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4405;return;}
case 4405:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4406;return;}
case 4406:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4407;return;}
case 4407:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4408;return;}
case 4408:cyc+=4;C=dec(C);
if(cyc>=evt){pc=4409;return;}
case 4409:cyc+=8;if(!fz){cyc+=4;pc=4372;return;}
if(cyc>=evt){pc=4411;return;}
case 4411:cyc+=12;A=rd(65348);
if(cyc>=evt){pc=4413;return;}
case 4413:cyc+=4;cp(B);
if(cyc>=evt){pc=4414;return;}
case 4414:cyc+=8;if(fz){cyc+=4;pc=4411;return;}
if(cyc>=evt){pc=4416;return;}
case 4416:cyc+=4;B=A;
if(cyc>=evt){pc=4417;return;}
case 4417:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=4419;return;}
case 4419:cyc+=8;and(3);
if(cyc>=evt){pc=4421;return;}
case 4421:cyc+=8;if(!fz){cyc+=4;pc=4417;return;}
if(cyc>=evt){pc=4423;return;}
case 4423:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4424;return;}
case 4424:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4425;return;}
case 4425:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4426;return;}
case 4426:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4427;return;}
case 4427:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4428;return;}
case 4428:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4429;return;}
case 4429:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4430;return;}
case 4430:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4431;return;}
case 4431:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4432;return;}
case 4432:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4433;return;}
case 4433:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4434;return;}
case 4434:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4435;return;}
case 4435:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4436;return;}
case 4436:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4437;return;}
case 4437:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4438;return;}
case 4438:cyc+=8;A=rd(D<<8|E);
pc=4439;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 4439:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4440;return;}
case 4440:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4441;return;}
case 4441:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4442;return;}
case 4442:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4443;return;}
case 4443:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4444;return;}
case 4444:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4445;return;}
case 4445:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4446;return;}
case 4446:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4447;return;}
case 4447:cyc+=8;A=147;
if(cyc>=evt){pc=4449;return;}
case 4449:cyc+=12;wr(65344,A);
if(cyc>=evt){pc=4451;return;}
case 4451:cyc+=8;C=20;
if(cyc>=evt){pc=4453;return;}
case 4453:cyc+=12;A=rd(65348);
if(cyc>=evt){pc=4455;return;}
case 4455:cyc+=4;cp(B);
if(cyc>=evt){pc=4456;return;}
case 4456:cyc+=8;if(fz){cyc+=4;pc=4453;return;}
if(cyc>=evt){pc=4458;return;}
case 4458:cyc+=4;B=A;
if(cyc>=evt){pc=4459;return;}
case 4459:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=4461;return;}
case 4461:cyc+=8;and(3);
if(cyc>=evt){pc=4463;return;}
case 4463:cyc+=8;if(!fz){cyc+=4;pc=4459;return;}
if(cyc>=evt){pc=4465;return;}
case 4465:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4466;return;}
case 4466:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4467;return;}
case 4467:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4468;return;}
case 4468:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4469;return;}
case 4469:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4470;return;}
case 4470:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4471;return;}
case 4471:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4472;return;}
case 4472:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4473;return;}
case 4473:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4474;return;}
case 4474:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4475;return;}
case 4475:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4476;return;}
case 4476:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4477;return;}
case 4477:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4478;return;}
case 4478:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4479;return;}
case 4479:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4480;return;}
case 4480:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4481;return;}
case 4481:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4482;return;}
case 4482:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4483;return;}
case 4483:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4484;return;}
case 4484:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4485;return;}
case 4485:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4486;return;}
case 4486:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4487;return;}
case 4487:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4488;return;}
case 4488:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4489;return;}
case 4489:cyc+=8;if(!fz){cyc+=4;pc=4492;return;}
if(cyc>=evt){pc=4491;return;}
case 4491:cyc+=4;D=inc(D);
if(cyc>=evt){pc=4492;return;}
case 4492:cyc+=4;C=dec(C);
if(cyc>=evt){pc=4493;return;}
case 4493:cyc+=8;if(!fz){cyc+=4;pc=4453;return;}
if(cyc>=evt){pc=4495;return;}
case 4495:cyc+=12;A=rd(65348);
if(cyc>=evt){pc=4497;return;}
case 4497:cyc+=4;cp(B);
if(cyc>=evt){pc=4498;return;}
case 4498:cyc+=8;if(fz){cyc+=4;pc=4495;return;}
if(cyc>=evt){pc=4500;return;}
case 4500:cyc+=4;B=A;
if(cyc>=evt){pc=4501;return;}
case 4501:cyc+=24;push(4504);pc=65408;return;
if(cyc>=evt){pc=4504;return;}
case 4504:cyc+=8;A=131;
if(cyc>=evt){pc=4506;return;}
case 4506:cyc+=12;wr(65344,A);
if(cyc>=evt){pc=4508;return;}
case 4508:cyc+=8;C=11;
if(cyc>=evt){pc=4510;return;}
case 4510:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4511;return;}
case 4511:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4512;return;}
case 4512:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4513;return;}
case 4513:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4514;return;}
case 4514:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4515;return;}
case 4515:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4516;return;}
case 4516:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4517;return;}
case 4517:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4518;return;}
case 4518:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4519;return;}
case 4519:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4520;return;}
case 4520:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4521;return;}
case 4521:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4522;return;}
case 4522:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4523;return;}
case 4523:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4524;return;}
case 4524:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4525;return;}
case 4525:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4526;return;}
case 4526:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4527;return;}
case 4527:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4528;return;}
case 4528:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4529;return;}
case 4529:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4530;return;}
case 4530:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4531;return;}
case 4531:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4532;return;}
case 4532:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4533;return;}
case 4533:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4534;return;}
case 4534:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4535;return;}
case 4535:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4536;return;}
case 4536:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4537;return;}
case 4537:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4538;return;}
case 4538:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4539;return;}
case 4539:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4540;return;}
case 4540:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4541;return;}
case 4541:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4542;return;}
case 4542:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4543;return;}
case 4543:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4544;return;}
case 4544:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4545;return;}
case 4545:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4546;return;}
case 4546:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4547;return;}
case 4547:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4548;return;}
case 4548:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4549;return;}
case 4549:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4550;return;}
case 4550:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4551;return;}
case 4551:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4552;return;}
case 4552:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4553;return;}
case 4553:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4554;return;}
case 4554:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4555;return;}
case 4555:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4556;return;}
case 4556:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4557;return;}
case 4557:cyc+=4;E=inc(E);
if(cyc>=evt){pc=4558;return;}
case 4558:cyc+=4;C=dec(C);
if(cyc>=evt){pc=4559;return;}
case 4559:cyc+=8;if(!fz){cyc+=4;pc=4510;return;}
if(cyc>=evt){pc=4561;return;}
case 4561:cyc+=4;xor(A);
if(cyc>=evt){pc=4562;return;}
case 4562:cyc+=16;wr(49496,A);
if(cyc>=evt){pc=4565;return;}
case 4565:cyc+=16;A=rd(49420);
if(cyc>=evt){pc=4568;return;}
case 4568:cyc+=4;and(A);
if(cyc>=evt){pc=4569;return;}
case 4569:cyc+=12;if(!fz){cyc+=4;pc=4729;return;}
if(cyc>=evt){pc=4572;return;}
case 4572:cyc+=16;A=rd(49592);
if(cyc>=evt){pc=4575;return;}
case 4575:cyc+=4;and(A);
if(cyc>=evt){pc=4576;return;}
case 4576:cyc+=8;if(fz){cyc+=4;pc=4599;return;}
if(cyc>=evt){pc=4578;return;}
case 4578:cyc+=8;A=15;
if(cyc>=evt){pc=4580;return;}
case 4580:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=4583;return;}
case 4583:cyc+=24;push(4586);pc=25088;return;
if(cyc>=evt){pc=4586;return;}
case 4586:cyc+=8;A=1;
if(cyc>=evt){pc=4588;return;}
case 4588:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=4591;return;}
case 4591:cyc+=12;H=193;L=186;
if(cyc>=evt){pc=4594;return;}
case 4594:cyc+=12;wr((H<<8|L),inc(rd((H<<8|L))));
if(cyc>=evt){pc=4595;return;}
case 4595:cyc+=8;if(!fz){cyc+=4;pc=4599;return;}
if(cyc>=evt){pc=4597;return;}
case 4597:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=4598;return;}
case 4598:cyc+=12;wr((H<<8|L),inc(rd((H<<8|L))));
if(cyc>=evt){pc=4599;return;}
case 4599:cyc+=16;A=rd(49410);
if(cyc>=evt){pc=4602;return;}
case 4602:cyc+=4;A=inc(A);
if(cyc>=evt){pc=4603;return;}
case 4603:cyc+=16;wr(49410,A);
if(cyc>=evt){pc=4606;return;}
case 4606:cyc+=8;and(3);
if(cyc>=evt){pc=4608;return;}
case 4608:cyc+=8;if(!fz){cyc+=4;pc=4615;return;}
if(cyc>=evt){pc=4610;return;}
case 4610:cyc+=8;A=1;
if(cyc>=evt){pc=4612;return;}
case 4612:cyc+=16;wr(49500,A);
if(cyc>=evt){pc=4615;return;}
case 4615:cyc+=16;A=rd(49418);
if(cyc>=evt){pc=4618;return;}
case 4618:cyc+=4;A=inc(A);
if(cyc>=evt){pc=4619;return;}
case 4619:cyc+=16;wr(49418,A);
if(cyc>=evt){pc=4622;return;}
case 4622:cyc+=16;A=rd(49482);
if(cyc>=evt){pc=4625;return;}
case 4625:cyc+=4;and(A);
if(cyc>=evt){pc=4626;return;}
case 4626:cyc+=8;if(fz){cyc+=4;pc=4729;return;}
if(cyc>=evt){pc=4628;return;}
case 4628:cyc+=16;A=rd(49509);
if(cyc>=evt){pc=4631;return;}
case 4631:cyc+=4;A=inc(A);
if(cyc>=evt){pc=4632;return;}
case 4632:cyc+=8;cp(60);
if(cyc>=evt){pc=4634;return;}
case 4634:cyc+=8;if(fc){cyc+=4;pc=4726;return;}
if(cyc>=evt){pc=4636;return;}
case 4636:cyc+=12;H=193;L=121;
if(cyc>=evt){pc=4639;return;}
case 4639:cyc+=8;C=20;
if(cyc>=evt){pc=4641;return;}
case 4641:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=4642;return;}
case 4642:cyc+=4;and(A);
if(cyc>=evt){pc=4643;return;}
case 4643:cyc+=8;if(fz){cyc+=4;pc=4673;return;}
if(cyc>=evt){pc=4645;return;}
case 4645:cyc+=4;A=dec(A);
if(cyc>=evt){pc=4646;return;}
case 4646:cyc+=4;and(A);
if(cyc>=evt){pc=4647;return;}
case 4647:cyc+=8;if(!fz){cyc+=4;pc=4673;return;}
if(cyc>=evt){pc=4649;return;}
case 4649:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=4650;return;}
case 4650:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=4651;return;}
case 4651:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=4652;return;}
case 4652:cyc+=4;C=A;
if(cyc>=evt){pc=4653;return;}
case 4653:cyc+=4;xor(A);
if(cyc>=evt){pc=4654;return;}
case 4654:cyc+=8;wr((H<<8|L),A);if(!L)H=(H-1)&255;L=(L-1)&255;
if(cyc>=evt){pc=4655;return;}
case 4655:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=4656;return;}
case 4656:cyc+=4;B=A;
if(cyc>=evt){pc=4657;return;}
case 4657:cyc+=4;xor(A);
if(cyc>=evt){pc=4658;return;}
case 4658:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=4659;return;}
case 4659:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=4660;return;}
case 4660:cyc+=8;E=64;
if(cyc>=evt){pc=4662;return;}
case 4662:cyc+=24;push(4665);pc=12020;return;
if(cyc>=evt){pc=4665;return;}
case 4665:cyc+=8;A=1;
if(cyc>=evt){pc=4667;return;}
case 4667:cyc+=16;wr(49587,A);
if(cyc>=evt){pc=4670;return;}
case 4670:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=4671;return;}
case 4671:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=4672;return;}
case 4672:cyc+=4;xor(A);
if(cyc>=evt){pc=4673;return;}
case 4673:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4674;return;}
case 4674:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=4675;return;}
case 4675:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=4676;return;}
case 4676:cyc+=4;C=dec(C);
if(cyc>=evt){pc=4677;return;}
case 4677:cyc+=8;if(!fz){cyc+=4;pc=4641;return;}
if(cyc>=evt){pc=4679;return;}
case 4679:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=4682;return;}
case 4682:cyc+=8;cp(14);
if(cyc>=evt){pc=4684;return;}
case 4684:cyc+=8;if(!fc){cyc+=4;pc=4710;return;}
if(cyc>=evt){pc=4686;return;}
case 4686:cyc+=16;A=rd(49508);
if(cyc>=evt){pc=4689;return;}
case 4689:cyc+=4;A=inc(A);
if(cyc>=evt){pc=4690;return;}
case 4690:cyc+=8;cp(60);
if(cyc>=evt){pc=4692;return;}
case 4692:cyc+=8;if(fc){cyc+=4;pc=4711;return;}
if(cyc>=evt){pc=4694;return;}
case 4694:cyc+=8;A=1;
if(cyc>=evt){pc=4696;return;}
case 4696:cyc+=16;wr(49499,A);
if(cyc>=evt){pc=4699;return;}
case 4699:cyc+=16;A=rd(49507);
if(cyc>=evt){pc=4702;return;}
case 4702:cyc+=4;A=dec(A);
if(cyc>=evt){pc=4703;return;}
case 4703:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=4705;return;}
case 4705:cyc+=8;if(!fz){cyc+=4;pc=4729;return;}
if(cyc>=evt){pc=4707;return;}
case 4707:cyc+=16;wr(49507,A);
if(cyc>=evt){pc=4710;return;}
case 4710:cyc+=4;xor(A);
if(cyc>=evt){pc=4711;return;}
case 4711:cyc+=16;wr(49508,A);
if(cyc>=evt){pc=4714;return;}
case 4714:cyc+=16;A=rd(49510);
if(cyc>=evt){pc=4717;return;}
case 4717:cyc+=4;A=dec(A);
if(cyc>=evt){pc=4718;return;}
case 4718:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=4720;return;}
case 4720:cyc+=8;if(!fz){cyc+=4;pc=4725;return;}
if(cyc>=evt){pc=4722;return;}
case 4722:cyc+=16;wr(49510,A);
if(cyc>=evt){pc=4725;return;}
case 4725:cyc+=4;xor(A);
if(cyc>=evt){pc=4726;return;}
case 4726:cyc+=16;wr(49509,A);
if(cyc>=evt){pc=4729;return;}
case 4729:cyc+=12;popaf();
if(cyc>=evt){pc=4730;return;}
case 4730:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=4733;return;}
case 4733:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=4734;return;}
case 4734:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=4735;return;}
case 4735:cyc+=12;popaf();
if(cyc>=evt){pc=4736;return;}
case 4736:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=4737;return;}
case 4737:cyc+=4;eiPend=1;
case 4738:cyc+=16;pc=pop();ime=1;return;
case 4739:cyc+=8;A=32;
if(cyc>=evt){pc=4741;return;}
case 4741:cyc+=12;wr(65280,A);
if(cyc>=evt){pc=4743;return;}
case 4743:cyc+=12;A=rd(65280);
if(cyc>=evt){pc=4745;return;}
case 4745:cyc+=12;A=rd(65280);
if(cyc>=evt){pc=4747;return;}
case 4747:cyc+=4;A^=255;fn=1;fh=1;
if(cyc>=evt){pc=4748;return;}
case 4748:cyc+=8;and(15);
if(cyc>=evt){pc=4750;return;}
case 4750:cyc+=8;A=swap(A);
if(cyc>=evt){pc=4752;return;}
case 4752:cyc+=4;B=A;
if(cyc>=evt){pc=4753;return;}
case 4753:cyc+=8;A=16;
if(cyc>=evt){pc=4755;return;}
case 4755:cyc+=12;wr(65280,A);
if(cyc>=evt){pc=4757;return;}
case 4757:cyc+=12;A=rd(65280);
if(cyc>=evt){pc=4759;return;}
case 4759:cyc+=12;A=rd(65280);
if(cyc>=evt){pc=4761;return;}
case 4761:cyc+=12;A=rd(65280);
if(cyc>=evt){pc=4763;return;}
case 4763:cyc+=12;A=rd(65280);
if(cyc>=evt){pc=4765;return;}
case 4765:cyc+=12;A=rd(65280);
if(cyc>=evt){pc=4767;return;}
case 4767:cyc+=12;A=rd(65280);
if(cyc>=evt){pc=4769;return;}
case 4769:cyc+=4;A^=255;fn=1;fh=1;
if(cyc>=evt){pc=4770;return;}
case 4770:cyc+=8;and(15);
if(cyc>=evt){pc=4772;return;}
case 4772:cyc+=4;or(B);
pc=4773;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 4773:cyc+=4;C=A;
if(cyc>=evt){pc=4774;return;}
case 4774:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=4776;return;}
case 4776:cyc+=4;xor(C);
if(cyc>=evt){pc=4777;return;}
case 4777:cyc+=4;and(C);
if(cyc>=evt){pc=4778;return;}
case 4778:cyc+=12;wr(65420,A);
if(cyc>=evt){pc=4780;return;}
case 4780:cyc+=4;A=C;
if(cyc>=evt){pc=4781;return;}
case 4781:cyc+=12;wr(65419,A);
if(cyc>=evt){pc=4783;return;}
case 4783:cyc+=8;A=48;
if(cyc>=evt){pc=4785;return;}
case 4785:cyc+=12;wr(65280,A);
if(cyc>=evt){pc=4787;return;}
case 4787:cyc+=16;pc=pop();return;
case 4788:cyc+=8;C=128;
if(cyc>=evt){pc=4790;return;}
case 4790:cyc+=8;B=10;
if(cyc>=evt){pc=4792;return;}
case 4792:cyc+=12;H=18;L=194;
if(cyc>=evt){pc=4795;return;}
case 4795:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4796;return;}
case 4796:cyc+=8;wr(0xFF00|C,A);
if(cyc>=evt){pc=4797;return;}
case 4797:cyc+=4;C=inc(C);
if(cyc>=evt){pc=4798;return;}
case 4798:cyc+=4;B=dec(B);
if(cyc>=evt){pc=4799;return;}
case 4799:cyc+=8;if(!fz){cyc+=4;pc=4795;return;}
if(cyc>=evt){pc=4801;return;}
case 4801:cyc+=16;pc=pop();return;
case 4824:cyc+=12;A=rd(65535);
if(cyc>=evt){pc=4826;return;}
case 4826:cyc+=12;wr(65433,A);
if(cyc>=evt){pc=4828;return;}
case 4828:cyc+=8;A=A&254;
if(cyc>=evt){pc=4830;return;}
case 4830:cyc+=12;wr(65535,A);
if(cyc>=evt){pc=4832;return;}
case 4832:cyc+=12;A=rd(65348);
if(cyc>=evt){pc=4834;return;}
case 4834:cyc+=8;cp(145);
if(cyc>=evt){pc=4836;return;}
case 4836:cyc+=8;if(!fz){cyc+=4;pc=4832;return;}
if(cyc>=evt){pc=4838;return;}
case 4838:cyc+=12;A=rd(65344);
if(cyc>=evt){pc=4840;return;}
case 4840:cyc+=8;and(127);
if(cyc>=evt){pc=4842;return;}
case 4842:cyc+=12;wr(65344,A);
if(cyc>=evt){pc=4844;return;}
case 4844:cyc+=12;A=rd(65433);
if(cyc>=evt){pc=4846;return;}
case 4846:cyc+=12;wr(65535,A);
if(cyc>=evt){pc=4848;return;}
case 4848:cyc+=16;pc=pop();return;
case 4849:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=4850;return;}
case 4850:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=4851;return;}
case 4851:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=4852;return;}
case 4852:cyc+=8;{const t=(B<<8|C)-1;B=(t>>8)&255;C=t&255;}
if(cyc>=evt){pc=4853;return;}
case 4853:cyc+=4;A=B;
if(cyc>=evt){pc=4854;return;}
case 4854:cyc+=4;or(C);
if(cyc>=evt){pc=4855;return;}
case 4855:cyc+=8;if(!fz){cyc+=4;pc=4849;return;}
if(cyc>=evt){pc=4857;return;}
case 4857:cyc+=16;pc=pop();return;
case 4858:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=4860;return;}
case 4860:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=4862;return;}
case 4862:cyc+=8;if(!fz){cyc+=4;pc=4858;return;}
if(cyc>=evt){pc=4864;return;}
case 4864:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=4865;return;}
case 4865:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=4866;return;}
case 4866:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=4868;return;}
case 4868:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=4870;return;}
case 4870:cyc+=8;if(!fz){cyc+=4;pc=4858;return;}
if(cyc>=evt){pc=4872;return;}
case 4872:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=4873;return;}
case 4873:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=4874;return;}
case 4874:cyc+=8;{const t=(B<<8|C)-1;B=(t>>8)&255;C=t&255;}
if(cyc>=evt){pc=4875;return;}
case 4875:cyc+=4;A=B;
if(cyc>=evt){pc=4876;return;}
case 4876:cyc+=4;or(C);
if(cyc>=evt){pc=4877;return;}
case 4877:cyc+=8;if(!fz){cyc+=4;pc=4858;return;}
if(cyc>=evt){pc=4879;return;}
case 4879:cyc+=16;pc=pop();return;
case 4880:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=4882;return;}
case 4882:cyc+=4;C=A;
if(cyc>=evt){pc=4883;return;}
case 4883:cyc+=12;H=193;L=8;
if(cyc>=evt){pc=4886;return;}
case 4886:cyc+=8;xor(rd((H<<8|L)));
if(cyc>=evt){pc=4887;return;}
case 4887:cyc+=4;and(C);
if(cyc>=evt){pc=4888;return;}
case 4888:cyc+=16;wr(49415,A);
if(cyc>=evt){pc=4891;return;}
case 4891:cyc+=4;A=C;
if(cyc>=evt){pc=4892;return;}
case 4892:cyc+=8;and(15);
if(cyc>=evt){pc=4894;return;}
case 4894:cyc+=16;wr(49416,A);
if(cyc>=evt){pc=4897;return;}
case 4897:cyc+=16;A=rd(49415);
if(cyc>=evt){pc=4900;return;}
case 4900:cyc+=16;pc=pop();return;
case 4901:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=4903;return;}
case 4903:cyc+=4;C=A;
if(cyc>=evt){pc=4904;return;}
case 4904:cyc+=12;H=193;L=8;
if(cyc>=evt){pc=4907;return;}
case 4907:cyc+=8;xor(rd((H<<8|L)));
if(cyc>=evt){pc=4908;return;}
case 4908:cyc+=4;and(C);
if(cyc>=evt){pc=4909;return;}
case 4909:cyc+=16;wr(49415,A);
if(cyc>=evt){pc=4912;return;}
case 4912:cyc+=4;A=C;
if(cyc>=evt){pc=4913;return;}
case 4913:cyc+=8;and(207);
if(cyc>=evt){pc=4915;return;}
case 4915:cyc+=16;wr(49416,A);
if(cyc>=evt){pc=4918;return;}
case 4918:cyc+=16;A=rd(49415);
if(cyc>=evt){pc=4921;return;}
case 4921:cyc+=16;pc=pop();return;
case 4922:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=4923;return;}
case 4923:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=4924;return;}
case 4924:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=4926;return;}
case 4926:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=4928;return;}
case 4928:cyc+=8;if(!fz){cyc+=4;pc=4924;return;}
if(cyc>=evt){pc=4930;return;}
case 4930:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=4931;return;}
case 4931:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=4932;return;}
case 4932:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=4934;return;}
case 4934:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=4936;return;}
case 4936:cyc+=8;if(!fz){cyc+=4;pc=4924;return;}
if(cyc>=evt){pc=4938;return;}
case 4938:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=4939;return;}
case 4939:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=4940;return;}
case 4940:cyc+=4;B=dec(B);
if(cyc>=evt){pc=4941;return;}
case 4941:cyc+=8;if(!fz){cyc+=4;pc=4924;return;}
if(cyc>=evt){pc=4943;return;}
case 4943:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=4944;return;}
case 4944:cyc+=12;B=0;C=32;
if(cyc>=evt){pc=4947;return;}
case 4947:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=4948;return;}
case 4948:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=4949;return;}
case 4949:cyc+=4;C=dec(C);
if(cyc>=evt){pc=4950;return;}
case 4950:cyc+=8;if(!fz){cyc+=4;pc=4922;return;}
if(cyc>=evt){pc=4952;return;}
case 4952:cyc+=16;pc=pop();return;
case 4953:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=4956;return;}
case 4956:cyc+=8;cp(17);
if(cyc>=evt){pc=4958;return;}
case 4958:cyc+=8;if(!fz){cyc+=4;pc=4986;return;}
if(cyc>=evt){pc=4960;return;}
case 4960:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=4961;return;}
case 4961:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=4962;return;}
case 4962:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=4963;return;}
case 4963:cyc+=4;A=E;
if(cyc>=evt){pc=4964;return;}
case 4964:cyc+=8;add(232);
if(cyc>=evt){pc=4966;return;}
case 4966:cyc+=4;E=A;
if(cyc>=evt){pc=4967;return;}
case 4967:cyc+=4;A=D;
if(cyc>=evt){pc=4968;return;}
case 4968:cyc+=8;adc(3);
if(cyc>=evt){pc=4970;return;}
case 4970:cyc+=4;D=A;
if(cyc>=evt){pc=4971;return;}
case 4971:cyc+=8;A=1;
if(cyc>=evt){pc=4973;return;}
case 4973:cyc+=12;wr(65359,A);
if(cyc>=evt){pc=4975;return;}
case 4975:cyc+=4;
if(cyc>=evt){pc=4976;return;}
case 4976:cyc+=24;push(4979);pc=4922;return;
if(cyc>=evt){pc=4979;return;}
case 4979:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=4980;return;}
case 4980:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=4981;return;}
case 4981:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=4982;return;}
case 4982:cyc+=4;xor(A);
if(cyc>=evt){pc=4983;return;}
case 4983:cyc+=12;wr(65359,A);
if(cyc>=evt){pc=4985;return;}
case 4985:cyc+=4;
if(cyc>=evt){pc=4986;return;}
case 4986:cyc+=24;push(4989);pc=4922;return;
if(cyc>=evt){pc=4989;return;}
case 4989:cyc+=16;pc=pop();return;
case 4990:cyc+=4;xor(A);
if(cyc>=evt){pc=4991;return;}
case 4991:cyc+=16;wr(49492,A);
if(cyc>=evt){pc=4994;return;}
case 4994:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=4997;return;}
case 4997:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=4999;return;}
case 4999:cyc+=8;if(fz){cyc+=4;pc=5048;return;}
if(cyc>=evt){pc=5001;return;}
case 5001:cyc+=8;A=0;
if(cyc>=evt){pc=5003;return;}
case 5003:cyc+=24;push(5006);pc=5849;return;
if(cyc>=evt){pc=5006;return;}
case 5006:cyc+=12;H=58;L=124;
if(cyc>=evt){pc=5009;return;}
case 5009:cyc+=24;push(5012);pc=5276;return;
if(cyc>=evt){pc=5012;return;}
case 5012:cyc+=8;A=0;
if(cyc>=evt){pc=5014;return;}
case 5014:cyc+=24;push(5017);pc=5849;return;
if(cyc>=evt){pc=5017;return;}
case 5017:cyc+=12;H=58;L=124;
if(cyc>=evt){pc=5020;return;}
case 5020:cyc+=24;push(5023);pc=5276;return;
if(cyc>=evt){pc=5023;return;}
case 5023:cyc+=8;A=0;
if(cyc>=evt){pc=5025;return;}
case 5025:cyc+=24;push(5028);pc=5849;return;
if(cyc>=evt){pc=5028;return;}
case 5028:cyc+=12;H=58;L=124;
if(cyc>=evt){pc=5031;return;}
case 5031:cyc+=24;push(5034);pc=5276;return;
if(cyc>=evt){pc=5034;return;}
case 5034:cyc+=8;A=1;
if(cyc>=evt){pc=5036;return;}
case 5036:cyc+=24;push(5039);pc=5849;return;
if(cyc>=evt){pc=5039;return;}
case 5039:cyc+=12;H=58;L=134;
if(cyc>=evt){pc=5042;return;}
case 5042:cyc+=24;push(5045);pc=5276;return;
if(cyc>=evt){pc=5045;return;}
case 5045:cyc+=16;pc=5234;return;
case 5048:cyc+=8;A=sla(A);
if(cyc>=evt){pc=5050;return;}
case 5050:cyc+=8;A=sla(A);
if(cyc>=evt){pc=5052;return;}
case 5052:cyc+=12;D=198;E=210;
if(cyc>=evt){pc=5055;return;}
case 5055:cyc+=4;add(E);
if(cyc>=evt){pc=5056;return;}
case 5056:cyc+=4;E=A;
if(cyc>=evt){pc=5057;return;}
case 5057:cyc+=8;if(!fc){cyc+=4;pc=5060;return;}
if(cyc>=evt){pc=5059;return;}
case 5059:cyc+=4;D=inc(D);
if(cyc>=evt){pc=5060;return;}
case 5060:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5061;return;}
case 5061:cyc+=8;and(127);
if(cyc>=evt){pc=5063;return;}
case 5063:cyc+=8;if(!fz){cyc+=4;pc=5069;return;}
if(cyc>=evt){pc=5065;return;}
case 5065:cyc+=8;A=1;
if(cyc>=evt){pc=5067;return;}
case 5067:cyc+=12;pc=5073;return;
case 5069:cyc+=4;A=dec(A);
if(cyc>=evt){pc=5070;return;}
case 5070:cyc+=24;push(5073);pc=5889;return;
if(cyc>=evt){pc=5073;return;}
case 5073:cyc+=24;push(5076);pc=5849;return;
if(cyc>=evt){pc=5076;return;}
case 5076:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=5079;return;}
case 5079:cyc+=8;A=sla(A);
if(cyc>=evt){pc=5081;return;}
case 5081:cyc+=8;A=sla(A);
if(cyc>=evt){pc=5083;return;}
case 5083:cyc+=12;D=198;E=210;
if(cyc>=evt){pc=5086;return;}
case 5086:cyc+=4;add(E);
if(cyc>=evt){pc=5087;return;}
case 5087:cyc+=4;E=A;
if(cyc>=evt){pc=5088;return;}
case 5088:cyc+=8;if(!fc){cyc+=4;pc=5091;return;}
if(cyc>=evt){pc=5090;return;}
case 5090:cyc+=4;D=inc(D);
if(cyc>=evt){pc=5091;return;}
case 5091:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5092;return;}
case 5092:cyc+=8;and(127);
if(cyc>=evt){pc=5094;return;}
case 5094:cyc+=8;if(!fz){cyc+=4;pc=5101;return;}
if(cyc>=evt){pc=5096;return;}
case 5096:cyc+=12;H=58;L=134;
if(cyc>=evt){pc=5099;return;}
case 5099:cyc+=12;pc=5112;return;
case 5101:cyc+=4;A=dec(A);
if(cyc>=evt){pc=5102;return;}
case 5102:cyc+=12;B=0;C=30;
if(cyc>=evt){pc=5105;return;}
case 5105:cyc+=24;push(5108);pc=7544;return;
if(cyc>=evt){pc=5108;return;}
case 5108:cyc+=12;B=196;C=20;
if(cyc>=evt){pc=5111;return;}
case 5111:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=5112;return;}
case 5112:cyc+=24;push(5115);pc=5276;return;
if(cyc>=evt){pc=5115;return;}
case 5115:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=5118;return;}
case 5118:cyc+=24;push(5121);pc=5889;return;
if(cyc>=evt){pc=5121;return;}
case 5121:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=5124;return;}
case 5124:cyc+=12;B=0;C=30;
if(cyc>=evt){pc=5127;return;}
case 5127:cyc+=24;push(5130);pc=7544;return;
if(cyc>=evt){pc=5130;return;}
case 5130:cyc+=12;B=196;C=0;
if(cyc>=evt){pc=5133;return;}
case 5133:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=5134;return;}
case 5134:cyc+=16;A=rd(49487);
if(cyc>=evt){pc=5137;return;}
case 5137:cyc+=24;push(5140);pc=5849;return;
if(cyc>=evt){pc=5140;return;}
case 5140:cyc+=24;push(5143);pc=5276;return;
if(cyc>=evt){pc=5143;return;}
case 5143:cyc+=16;A=rd(49488);
if(cyc>=evt){pc=5146;return;}
case 5146:cyc+=24;push(5149);pc=5849;return;
if(cyc>=evt){pc=5149;return;}
case 5149:cyc+=24;push(5152);pc=5276;return;
if(cyc>=evt){pc=5152;return;}
case 5152:cyc+=16;A=rd(49489);
if(cyc>=evt){pc=5155;return;}
case 5155:cyc+=24;push(5158);pc=5849;return;
if(cyc>=evt){pc=5158;return;}
case 5158:cyc+=24;push(5161);pc=5276;return;
if(cyc>=evt){pc=5161;return;}
case 5161:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=5164;return;}
case 5164:cyc+=8;A=sla(A);
if(cyc>=evt){pc=5166;return;}
case 5166:cyc+=8;A=sla(A);
if(cyc>=evt){pc=5168;return;}
case 5168:cyc+=12;D=198;E=211;
if(cyc>=evt){pc=5171;return;}
case 5171:cyc+=4;add(E);
if(cyc>=evt){pc=5172;return;}
case 5172:cyc+=4;E=A;
if(cyc>=evt){pc=5173;return;}
case 5173:cyc+=8;if(!fc){cyc+=4;pc=5176;return;}
if(cyc>=evt){pc=5175;return;}
case 5175:cyc+=4;D=inc(D);
if(cyc>=evt){pc=5176;return;}
case 5176:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5177;return;}
case 5177:cyc+=8;and(127);
if(cyc>=evt){pc=5179;return;}
case 5179:cyc+=8;if(!fz){cyc+=4;pc=5185;return;}
if(cyc>=evt){pc=5181;return;}
case 5181:cyc+=8;A=20;
if(cyc>=evt){pc=5183;return;}
case 5183:cyc+=12;pc=5189;return;
case 5185:cyc+=4;A=dec(A);
if(cyc>=evt){pc=5186;return;}
case 5186:cyc+=24;push(5189);pc=5889;return;
if(cyc>=evt){pc=5189;return;}
case 5189:cyc+=16;A=rd(49487);
if(cyc>=evt){pc=5192;return;}
case 5192:cyc+=24;push(5195);pc=5849;return;
if(cyc>=evt){pc=5195;return;}
case 5195:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=5198;return;}
case 5198:cyc+=8;A=sla(A);
if(cyc>=evt){pc=5200;return;}
case 5200:cyc+=8;A=sla(A);
if(cyc>=evt){pc=5202;return;}
case 5202:cyc+=12;D=198;E=211;
if(cyc>=evt){pc=5205;return;}
case 5205:cyc+=4;add(E);
if(cyc>=evt){pc=5206;return;}
case 5206:cyc+=4;E=A;
if(cyc>=evt){pc=5207;return;}
case 5207:cyc+=8;if(!fc){cyc+=4;pc=5210;return;}
if(cyc>=evt){pc=5209;return;}
case 5209:cyc+=4;D=inc(D);
if(cyc>=evt){pc=5210;return;}
case 5210:cyc+=8;A=rd(D<<8|E);
pc=5211;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 5211:cyc+=8;and(127);
if(cyc>=evt){pc=5213;return;}
case 5213:cyc+=8;if(!fz){cyc+=4;pc=5220;return;}
if(cyc>=evt){pc=5215;return;}
case 5215:cyc+=12;H=58;L=134;
if(cyc>=evt){pc=5218;return;}
case 5218:cyc+=12;pc=5231;return;
case 5220:cyc+=4;A=dec(A);
if(cyc>=evt){pc=5221;return;}
case 5221:cyc+=12;B=0;C=30;
if(cyc>=evt){pc=5224;return;}
case 5224:cyc+=24;push(5227);pc=7544;return;
if(cyc>=evt){pc=5227;return;}
case 5227:cyc+=12;B=196;C=0;
if(cyc>=evt){pc=5230;return;}
case 5230:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=5231;return;}
case 5231:cyc+=24;push(5234);pc=5276;return;
if(cyc>=evt){pc=5234;return;}
case 5234:cyc+=16;A=rd(49515);
if(cyc>=evt){pc=5237;return;}
case 5237:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=5240;return;}
case 5240:cyc+=12;H=152;L=0;
if(cyc>=evt){pc=5243;return;}
case 5243:cyc+=12;D=192;E=160;
if(cyc>=evt){pc=5246;return;}
case 5246:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5247;return;}
case 5247:cyc+=8;and(31);
if(cyc>=evt){pc=5249;return;}
case 5249:cyc+=16;wr(49490,A);
if(cyc>=evt){pc=5252;return;}
case 5252:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5253;return;}
case 5253:cyc+=24;push(5256);pc=5349;return;
if(cyc>=evt){pc=5256;return;}
case 5256:cyc+=4;A=E;
if(cyc>=evt){pc=5257;return;}
case 5257:cyc+=8;cp(204);
if(cyc>=evt){pc=5259;return;}
case 5259:cyc+=8;if(fc){cyc+=4;pc=5246;return;}
if(cyc>=evt){pc=5261;return;}
case 5261:cyc+=8;A=1;
if(cyc>=evt){pc=5263;return;}
case 5263:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=5266;return;}
case 5266:cyc+=8;A=1;
if(cyc>=evt){pc=5268;return;}
case 5268:cyc+=16;wr(49500,A);
if(cyc>=evt){pc=5271;return;}
case 5271:cyc+=4;xor(A);
if(cyc>=evt){pc=5272;return;}
case 5272:cyc+=16;wr(49497,A);
if(cyc>=evt){pc=5275;return;}
case 5275:cyc+=16;pc=pop();return;
case 5276:cyc+=8;C=10;
if(cyc>=evt){pc=5278;return;}
case 5278:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=5279;return;}
case 5279:cyc+=4;B=A;
if(cyc>=evt){pc=5280;return;}
case 5280:cyc+=8;and(31);
if(cyc>=evt){pc=5282;return;}
case 5282:cyc+=8;cp(19);
if(cyc>=evt){pc=5284;return;}
case 5284:cyc+=8;if(!fz){cyc+=4;pc=5312;return;}
if(cyc>=evt){pc=5286;return;}
case 5286:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=5287;return;}
case 5287:cyc+=8;and(31);
if(cyc>=evt){pc=5289;return;}
case 5289:cyc+=8;cp(18);
if(cyc>=evt){pc=5291;return;}
case 5291:cyc+=8;if(fz){cyc+=4;pc=5308;return;}
if(cyc>=evt){pc=5293;return;}
case 5293:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=5294;return;}
case 5294:cyc+=12;H=0;L=21;
if(cyc>=evt){pc=5297;return;}
case 5297:cyc+=4;add(L);
if(cyc>=evt){pc=5298;return;}
case 5298:cyc+=4;L=A;
if(cyc>=evt){pc=5299;return;}
case 5299:cyc+=8;if(!fc){cyc+=4;pc=5302;return;}
if(cyc>=evt){pc=5301;return;}
case 5301:cyc+=4;H=inc(H);
if(cyc>=evt){pc=5302;return;}
case 5302:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=5303;return;}
case 5303:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=5304;return;}
case 5304:cyc+=8;and(192);
if(cyc>=evt){pc=5306;return;}
case 5306:cyc+=8;if(fz){cyc+=4;pc=5341;return;}
if(cyc>=evt){pc=5308;return;}
case 5308:cyc+=8;B=1;
if(cyc>=evt){pc=5310;return;}
case 5310:cyc+=12;pc=5341;return;
case 5312:cyc+=8;cp(3);
if(cyc>=evt){pc=5314;return;}
case 5314:cyc+=8;if(!fz){cyc+=4;pc=5327;return;}
if(cyc>=evt){pc=5316;return;}
case 5316:cyc+=16;A=rd(49490);
if(cyc>=evt){pc=5319;return;}
case 5319:cyc+=8;cp(4);
if(cyc>=evt){pc=5321;return;}
case 5321:cyc+=8;if(!fz){cyc+=4;pc=5341;return;}
if(cyc>=evt){pc=5323;return;}
case 5323:cyc+=8;B=1;
if(cyc>=evt){pc=5325;return;}
case 5325:cyc+=12;pc=5341;return;
case 5327:cyc+=16;A=rd(49490);
if(cyc>=evt){pc=5330;return;}
case 5330:cyc+=8;cp(12);
if(cyc>=evt){pc=5332;return;}
case 5332:cyc+=8;if(!fz){cyc+=4;pc=5341;return;}
if(cyc>=evt){pc=5334;return;}
case 5334:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=5335;return;}
case 5335:cyc+=8;cp(26);
if(cyc>=evt){pc=5337;return;}
case 5337:cyc+=8;if(!fz){cyc+=4;pc=5341;return;}
if(cyc>=evt){pc=5339;return;}
case 5339:cyc+=8;B=27;
if(cyc>=evt){pc=5341;return;}
case 5341:cyc+=4;A=B;
if(cyc>=evt){pc=5342;return;}
case 5342:cyc+=24;push(5345);pc=5849;return;
if(cyc>=evt){pc=5345;return;}
case 5345:cyc+=4;C=dec(C);
if(cyc>=evt){pc=5346;return;}
case 5346:cyc+=8;if(!fz){cyc+=4;pc=5278;return;}
if(cyc>=evt){pc=5348;return;}
case 5348:cyc+=16;pc=pop();return;
case 5349:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5350;return;}
case 5350:cyc+=24;push(5353);pc=5443;return;
if(cyc>=evt){pc=5353;return;}
case 5353:cyc+=16;A=rd(49491);
if(cyc>=evt){pc=5356;return;}
case 5356:cyc+=8;cp(4);
if(cyc>=evt){pc=5358;return;}
case 5358:cyc+=8;if(!fz){cyc+=4;pc=5392;return;}
if(cyc>=evt){pc=5360;return;}
case 5360:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=5361;return;}
case 5361:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=5362;return;}
case 5362:cyc+=8;{const t=(D<<8|E)-1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5363;return;}
case 5363:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5364;return;}
case 5364:cyc+=8;and(224);
if(cyc>=evt){pc=5366;return;}
case 5366:cyc+=8;cp(64);
if(cyc>=evt){pc=5368;return;}
case 5368:cyc+=8;if(!fz){cyc+=4;pc=5428;return;}
if(cyc>=evt){pc=5370;return;}
case 5370:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=5371;return;}
case 5371:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=5372;return;}
case 5372:cyc+=16;A=rd(49513);
if(cyc>=evt){pc=5375;return;}
case 5375:cyc+=8;add(32);
if(cyc>=evt){pc=5377;return;}
case 5377:cyc+=4;E=A;
if(cyc>=evt){pc=5378;return;}
case 5378:cyc+=16;A=rd(49514);
if(cyc>=evt){pc=5381;return;}
case 5381:cyc+=8;adc(3);
if(cyc>=evt){pc=5383;return;}
case 5383:cyc+=4;D=A;
if(cyc>=evt){pc=5384;return;}
case 5384:cyc+=12;B=1;C=4;
if(cyc>=evt){pc=5387;return;}
case 5387:cyc+=24;push(5390);pc=4953;return;
if(cyc>=evt){pc=5390;return;}
case 5390:cyc+=12;pc=5428;return;
case 5392:cyc+=8;cp(17);
if(cyc>=evt){pc=5394;return;}
case 5394:cyc+=8;if(!fz){cyc+=4;pc=5430;return;}
if(cyc>=evt){pc=5396;return;}
case 5396:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=5397;return;}
case 5397:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=5398;return;}
case 5398:cyc+=8;{const t=(D<<8|E)-1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5399;return;}
case 5399:cyc+=8;{const t=(D<<8|E)-1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5400;return;}
case 5400:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5401;return;}
case 5401:cyc+=8;and(224);
if(cyc>=evt){pc=5403;return;}
case 5403:cyc+=8;cp(64);
if(cyc>=evt){pc=5405;return;}
case 5405:cyc+=8;if(!fz){cyc+=4;pc=5428;return;}
if(cyc>=evt){pc=5407;return;}
case 5407:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=5408;return;}
case 5408:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=5409;return;}
case 5409:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=5410;return;}
case 5410:cyc+=16;A=rd(49513);
if(cyc>=evt){pc=5413;return;}
case 5413:cyc+=8;add(118);
if(cyc>=evt){pc=5415;return;}
case 5415:cyc+=4;E=A;
if(cyc>=evt){pc=5416;return;}
case 5416:cyc+=16;A=rd(49514);
if(cyc>=evt){pc=5419;return;}
case 5419:cyc+=8;adc(2);
if(cyc>=evt){pc=5421;return;}
case 5421:cyc+=4;D=A;
if(cyc>=evt){pc=5422;return;}
case 5422:cyc+=12;B=3;C=4;
if(cyc>=evt){pc=5425;return;}
case 5425:cyc+=24;push(5428);pc=4953;return;
if(cyc>=evt){pc=5428;return;}
case 5428:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=5429;return;}
case 5429:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=5430;return;}
case 5430:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5431;return;}
case 5431:cyc+=4;A=L;
if(cyc>=evt){pc=5432;return;}
case 5432:cyc+=8;and(31);
if(cyc>=evt){pc=5434;return;}
case 5434:cyc+=8;cp(20);
if(cyc>=evt){pc=5436;return;}
case 5436:cyc+=8;if(fc){cyc+=4;pc=5349;return;}
if(cyc>=evt){pc=5438;return;}
case 5438:cyc+=12;B=0;C=140;
if(cyc>=evt){pc=5441;return;}
case 5441:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=5442;return;}
case 5442:cyc+=16;pc=pop();return;
case 5443:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=5444;return;}
case 5444:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=5445;return;}
case 5445:cyc+=8;and(31);
if(cyc>=evt){pc=5447;return;}
case 5447:cyc+=16;pushaf();
if(cyc>=evt){pc=5448;return;}
case 5448:cyc+=4;C=A;
if(cyc>=evt){pc=5449;return;}
case 5449:cyc+=8;B=0;
if(cyc>=evt){pc=5451;return;}
case 5451:cyc+=8;C=sla(C);
if(cyc>=evt){pc=5453;return;}
case 5453:cyc+=8;B=rl(B);
if(cyc>=evt){pc=5455;return;}
case 5455:cyc+=8;C=sla(C);
if(cyc>=evt){pc=5457;return;}
case 5457:cyc+=8;B=rl(B);
if(cyc>=evt){pc=5459;return;}
case 5459:cyc+=8;C=sla(C);
if(cyc>=evt){pc=5461;return;}
case 5461:cyc+=8;B=rl(B);
if(cyc>=evt){pc=5463;return;}
case 5463:cyc+=8;C=sla(C);
if(cyc>=evt){pc=5465;return;}
case 5465:cyc+=8;B=rl(B);
if(cyc>=evt){pc=5467;return;}
case 5467:cyc+=8;C=sla(C);
if(cyc>=evt){pc=5469;return;}
case 5469:cyc+=8;B=rl(B);
if(cyc>=evt){pc=5471;return;}
case 5471:cyc+=16;A=rd(49490);
if(cyc>=evt){pc=5474;return;}
case 5474:cyc+=16;wr(49491,A);
if(cyc>=evt){pc=5477;return;}
case 5477:cyc+=4;add(C);
if(cyc>=evt){pc=5478;return;}
case 5478:cyc+=4;C=A;
if(cyc>=evt){pc=5479;return;}
case 5479:cyc+=8;if(!fc){cyc+=4;pc=5482;return;}
if(cyc>=evt){pc=5481;return;}
case 5481:cyc+=4;B=inc(B);
if(cyc>=evt){pc=5482;return;}
case 5482:cyc+=12;popaf();
if(cyc>=evt){pc=5483;return;}
case 5483:cyc+=16;wr(49490,A);
if(cyc>=evt){pc=5486;return;}
case 5486:cyc+=12;H=200;L=0;
if(cyc>=evt){pc=5489;return;}
case 5489:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=5490;return;}
case 5490:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=5491;return;}
case 5491:cyc+=4;C=A;
if(cyc>=evt){pc=5492;return;}
case 5492:cyc+=4;and(A);
if(cyc>=evt){pc=5493;return;}
case 5493:cyc+=8;if(!fz){cyc+=4;pc=5532;return;}
if(cyc>=evt){pc=5495;return;}
case 5495:cyc+=8;{const t=(D<<8|E)-1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5496;return;}
case 5496:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5497;return;}
case 5497:cyc+=8;and(31);
if(cyc>=evt){pc=5499;return;}
case 5499:cyc+=12;if(!fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5502;return;}
case 5502:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5503;return;}
case 5503:cyc+=8;and(224);
if(cyc>=evt){pc=5505;return;}
case 5505:cyc+=12;if(fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5508;return;}
case 5508:cyc+=8;C=32;
if(cyc>=evt){pc=5510;return;}
case 5510:cyc+=8;cp(96);
if(cyc>=evt){pc=5512;return;}
case 5512:cyc+=12;if(fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5515;return;}
case 5515:cyc+=8;C=31;
if(cyc>=evt){pc=5517;return;}
case 5517:cyc+=8;cp(32);
if(cyc>=evt){pc=5519;return;}
case 5519:cyc+=12;if(fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5522;return;}
case 5522:cyc+=8;cp(64);
if(cyc>=evt){pc=5524;return;}
case 5524:cyc+=12;if(fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5527;return;}
case 5527:cyc+=8;C=0;
if(cyc>=evt){pc=5529;return;}
case 5529:cyc+=16;pc=5693;return;
case 5532:cyc+=8;cp(1);
if(cyc>=evt){pc=5534;return;}
case 5534:cyc+=8;if(!fz){cyc+=4;pc=5567;return;}
if(cyc>=evt){pc=5536;return;}
case 5536:cyc+=8;{const t=(D<<8|E)-1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5537;return;}
case 5537:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5538;return;}
case 5538:cyc+=8;and(31);
if(cyc>=evt){pc=5540;return;}
case 5540:cyc+=8;cp(1);
if(cyc>=evt){pc=5542;return;}
case 5542:cyc+=12;if(!fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5545;return;}
case 5545:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5546;return;}
case 5546:cyc+=8;and(224);
if(cyc>=evt){pc=5548;return;}
case 5548:cyc+=12;if(fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5551;return;}
case 5551:cyc+=8;C=30;
if(cyc>=evt){pc=5553;return;}
case 5553:cyc+=8;cp(32);
if(cyc>=evt){pc=5555;return;}
case 5555:cyc+=12;if(fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5558;return;}
case 5558:cyc+=8;cp(64);
if(cyc>=evt){pc=5560;return;}
case 5560:cyc+=12;if(fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5563;return;}
case 5563:cyc+=8;C=1;
if(cyc>=evt){pc=5565;return;}
case 5565:cyc+=12;pc=5693;return;
case 5567:cyc+=8;cp(33);
if(cyc>=evt){pc=5569;return;}
case 5569:cyc+=8;if(!fz){cyc+=4;pc=5586;return;}
if(cyc>=evt){pc=5571;return;}
case 5571:cyc+=4;A=E;
if(cyc>=evt){pc=5572;return;}
case 5572:cyc+=8;add(10);
if(cyc>=evt){pc=5574;return;}
case 5574:cyc+=4;E=A;
if(cyc>=evt){pc=5575;return;}
case 5575:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5576;return;}
case 5576:cyc+=8;and(31);
if(cyc>=evt){pc=5578;return;}
case 5578:cyc+=8;cp(20);
if(cyc>=evt){pc=5580;return;}
case 5580:cyc+=8;if(!fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5582;return;}
case 5582:cyc+=8;C=83;
if(cyc>=evt){pc=5584;return;}
case 5584:cyc+=12;pc=5693;return;
case 5586:cyc+=8;cp(52);
if(cyc>=evt){pc=5588;return;}
case 5588:cyc+=8;if(!fz){cyc+=4;pc=5613;return;}
if(cyc>=evt){pc=5590;return;}
case 5590:cyc+=4;A=E;
if(cyc>=evt){pc=5591;return;}
case 5591:cyc+=8;add(10);
if(cyc>=evt){pc=5593;return;}
case 5593:cyc+=4;E=A;
if(cyc>=evt){pc=5594;return;}
case 5594:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5595;return;}
case 5595:cyc+=8;and(31);
if(cyc>=evt){pc=5597;return;}
case 5597:cyc+=8;cp(4);
if(cyc>=evt){pc=5599;return;}
case 5599:cyc+=8;if(!fz){cyc+=4;pc=5605;return;}
if(cyc>=evt){pc=5601;return;}
case 5601:cyc+=8;C=51;
if(cyc>=evt){pc=5603;return;}
case 5603:cyc+=12;pc=5693;return;
case 5605:cyc+=8;cp(20);
if(cyc>=evt){pc=5607;return;}
case 5607:cyc+=8;if(!fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5609;return;}
case 5609:cyc+=8;C=82;
if(cyc>=evt){pc=5611;return;}
case 5611:cyc+=12;pc=5693;return;
case 5613:cyc+=8;cp(67);
if(cyc>=evt){pc=5615;return;}
case 5615:cyc+=8;if(!fz){cyc+=4;pc=5632;return;}
if(cyc>=evt){pc=5617;return;}
case 5617:cyc+=4;A=E;
if(cyc>=evt){pc=5618;return;}
case 5618:cyc+=8;add(10);
if(cyc>=evt){pc=5620;return;}
case 5620:cyc+=4;E=A;
if(cyc>=evt){pc=5621;return;}
case 5621:cyc+=8;A=rd(D<<8|E);
pc=5622;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 5622:cyc+=8;and(31);
if(cyc>=evt){pc=5624;return;}
case 5624:cyc+=8;cp(20);
if(cyc>=evt){pc=5626;return;}
case 5626:cyc+=8;if(!fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5628;return;}
case 5628:cyc+=8;C=81;
if(cyc>=evt){pc=5630;return;}
case 5630:cyc+=12;pc=5693;return;
case 5632:cyc+=8;cp(68);
if(cyc>=evt){pc=5634;return;}
case 5634:cyc+=8;if(!fz){cyc+=4;pc=5655;return;}
if(cyc>=evt){pc=5636;return;}
case 5636:cyc+=4;A=E;
if(cyc>=evt){pc=5637;return;}
case 5637:cyc+=8;add(10);
if(cyc>=evt){pc=5639;return;}
case 5639:cyc+=4;E=A;
if(cyc>=evt){pc=5640;return;}
case 5640:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5641;return;}
case 5641:cyc+=8;and(31);
if(cyc>=evt){pc=5643;return;}
case 5643:cyc+=8;cp(7);
if(cyc>=evt){pc=5645;return;}
case 5645:cyc+=8;if(fz){cyc+=4;pc=5651;return;}
if(cyc>=evt){pc=5647;return;}
case 5647:cyc+=8;cp(12);
if(cyc>=evt){pc=5649;return;}
case 5649:cyc+=8;if(!fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5651;return;}
case 5651:cyc+=8;C=45;
if(cyc>=evt){pc=5653;return;}
case 5653:cyc+=12;pc=5693;return;
case 5655:cyc+=8;cp(37);
if(cyc>=evt){pc=5657;return;}
case 5657:cyc+=8;if(!fz){cyc+=4;pc=5674;return;}
if(cyc>=evt){pc=5659;return;}
case 5659:cyc+=4;A=E;
if(cyc>=evt){pc=5660;return;}
case 5660:cyc+=8;add(10);
if(cyc>=evt){pc=5662;return;}
case 5662:cyc+=4;E=A;
if(cyc>=evt){pc=5663;return;}
case 5663:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5664;return;}
case 5664:cyc+=8;and(31);
if(cyc>=evt){pc=5666;return;}
case 5666:cyc+=8;cp(20);
if(cyc>=evt){pc=5668;return;}
case 5668:cyc+=8;if(!fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5670;return;}
case 5670:cyc+=8;C=41;
if(cyc>=evt){pc=5672;return;}
case 5672:cyc+=12;pc=5693;return;
case 5674:cyc+=8;cp(44);
if(cyc>=evt){pc=5676;return;}
case 5676:cyc+=8;if(!fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5678;return;}
case 5678:cyc+=4;A=E;
if(cyc>=evt){pc=5679;return;}
case 5679:cyc+=8;add(10);
if(cyc>=evt){pc=5681;return;}
case 5681:cyc+=4;E=A;
if(cyc>=evt){pc=5682;return;}
case 5682:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5683;return;}
case 5683:cyc+=8;and(31);
if(cyc>=evt){pc=5685;return;}
case 5685:cyc+=8;cp(20);
if(cyc>=evt){pc=5687;return;}
case 5687:cyc+=8;if(!fz){cyc+=4;pc=5693;return;}
if(cyc>=evt){pc=5689;return;}
case 5689:cyc+=8;C=91;
if(cyc>=evt){pc=5691;return;}
case 5691:cyc+=12;pc=5693;return;
case 5693:cyc+=4;A=C;
if(cyc>=evt){pc=5694;return;}
case 5694:cyc+=12;B=0;C=10;
if(cyc>=evt){pc=5697;return;}
case 5697:cyc+=24;push(5700);pc=7544;return;
if(cyc>=evt){pc=5700;return;}
case 5700:cyc+=16;A=rd(49513);
if(cyc>=evt){pc=5703;return;}
case 5703:cyc+=4;C=A;
if(cyc>=evt){pc=5704;return;}
case 5704:cyc+=16;A=rd(49514);
if(cyc>=evt){pc=5707;return;}
case 5707:cyc+=4;B=A;
if(cyc>=evt){pc=5708;return;}
case 5708:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=5709;return;}
case 5709:cyc+=4;E=L;
if(cyc>=evt){pc=5710;return;}
case 5710:cyc+=4;D=H;
if(cyc>=evt){pc=5711;return;}
case 5711:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=5712;return;}
case 5712:cyc+=8;A=5;
if(cyc>=evt){pc=5714;return;}
case 5714:cyc+=16;wr(49485,A);
if(cyc>=evt){pc=5717;return;}
case 5717:cyc+=12;B=0;C=30;
if(cyc>=evt){pc=5720;return;}
case 5720:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=5723;return;}
case 5723:cyc+=8;cp(17);
if(cyc>=evt){pc=5725;return;}
case 5725:cyc+=8;if(fz){cyc+=4;pc=5766;return;}
if(cyc>=evt){pc=5727;return;}
case 5727:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=5729;return;}
case 5729:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=5731;return;}
case 5731:cyc+=8;if(!fz){cyc+=4;pc=5727;return;}
if(cyc>=evt){pc=5733;return;}
case 5733:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5734;return;}
case 5734:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=5735;return;}
case 5735:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5736;return;}
case 5736:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5737;return;}
case 5737:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=5738;return;}
case 5738:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=5740;return;}
case 5740:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=5742;return;}
case 5742:cyc+=8;if(fz){cyc+=4;pc=5749;return;}
if(cyc>=evt){pc=5744;return;}
case 5744:cyc+=8;{const t=(D<<8|E)-1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5745;return;}
case 5745:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=5746;return;}
case 5746:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=5747;return;}
case 5747:cyc+=12;pc=5727;return;
case 5749:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5750;return;}
case 5750:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=5751;return;}
case 5751:cyc+=16;A=rd(49485);
if(cyc>=evt){pc=5754;return;}
case 5754:cyc+=4;A=dec(A);
if(cyc>=evt){pc=5755;return;}
case 5755:cyc+=16;wr(49485,A);
if(cyc>=evt){pc=5758;return;}
case 5758:cyc+=8;if(!fz){cyc+=4;pc=5727;return;}
if(cyc>=evt){pc=5760;return;}
case 5760:cyc+=12;B=255;C=98;
if(cyc>=evt){pc=5763;return;}
case 5763:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=5764;return;}
case 5764:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=5765;return;}
case 5765:cyc+=16;pc=pop();return;
case 5766:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=5767;return;}
case 5767:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=5768;return;}
case 5768:cyc+=4;A=E;
if(cyc>=evt){pc=5769;return;}
case 5769:cyc+=8;add(232);
if(cyc>=evt){pc=5771;return;}
case 5771:cyc+=4;E=A;
if(cyc>=evt){pc=5772;return;}
case 5772:cyc+=4;A=D;
if(cyc>=evt){pc=5773;return;}
case 5773:cyc+=8;adc(3);
if(cyc>=evt){pc=5775;return;}
case 5775:cyc+=4;D=A;
if(cyc>=evt){pc=5776;return;}
case 5776:cyc+=8;A=1;
if(cyc>=evt){pc=5778;return;}
case 5778:cyc+=12;wr(65359,A);
if(cyc>=evt){pc=5780;return;}
case 5780:cyc+=4;
if(cyc>=evt){pc=5781;return;}
case 5781:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=5783;return;}
case 5783:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=5785;return;}
case 5785:cyc+=8;if(!fz){cyc+=4;pc=5781;return;}
if(cyc>=evt){pc=5787;return;}
case 5787:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5788;return;}
case 5788:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=5789;return;}
case 5789:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5790;return;}
case 5790:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5791;return;}
case 5791:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=5792;return;}
case 5792:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=5794;return;}
case 5794:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=5796;return;}
case 5796:cyc+=8;if(fz){cyc+=4;pc=5803;return;}
if(cyc>=evt){pc=5798;return;}
case 5798:cyc+=8;{const t=(D<<8|E)-1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5799;return;}
case 5799:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=5800;return;}
case 5800:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=5801;return;}
case 5801:cyc+=12;pc=5781;return;
case 5803:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5804;return;}
case 5804:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=5805;return;}
case 5805:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=5806;return;}
case 5806:cyc+=4;xor(A);
if(cyc>=evt){pc=5807;return;}
case 5807:cyc+=12;wr(65359,A);
if(cyc>=evt){pc=5809;return;}
case 5809:cyc+=4;
if(cyc>=evt){pc=5810;return;}
case 5810:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=5812;return;}
case 5812:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=5814;return;}
case 5814:cyc+=8;if(!fz){cyc+=4;pc=5810;return;}
if(cyc>=evt){pc=5816;return;}
case 5816:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5817;return;}
case 5817:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=5818;return;}
case 5818:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5819;return;}
case 5819:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5820;return;}
case 5820:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=5821;return;}
case 5821:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=5823;return;}
case 5823:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=5825;return;}
case 5825:cyc+=8;if(fz){cyc+=4;pc=5832;return;}
if(cyc>=evt){pc=5827;return;}
case 5827:cyc+=8;{const t=(D<<8|E)-1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5828;return;}
case 5828:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=5829;return;}
case 5829:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=5830;return;}
case 5830:cyc+=12;pc=5810;return;
case 5832:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=5833;return;}
case 5833:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=5834;return;}
case 5834:cyc+=16;A=rd(49485);
if(cyc>=evt){pc=5837;return;}
case 5837:cyc+=4;A=dec(A);
if(cyc>=evt){pc=5838;return;}
case 5838:cyc+=16;wr(49485,A);
if(cyc>=evt){pc=5841;return;}
case 5841:cyc+=8;if(!fz){cyc+=4;pc=5766;return;}
if(cyc>=evt){pc=5843;return;}
case 5843:cyc+=12;B=255;C=98;
if(cyc>=evt){pc=5846;return;}
case 5846:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=5847;return;}
case 5847:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=5848;return;}
case 5848:cyc+=16;pc=pop();return;
case 5849:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=5850;return;}
case 5850:cyc+=16;pushaf();
if(cyc>=evt){pc=5851;return;}
case 5851:cyc+=12;H=192;L=160;
if(cyc>=evt){pc=5854;return;}
case 5854:cyc+=16;A=rd(49492);
if(cyc>=evt){pc=5857;return;}
case 5857:cyc+=4;add(L);
if(cyc>=evt){pc=5858;return;}
case 5858:cyc+=4;L=A;
if(cyc>=evt){pc=5859;return;}
case 5859:cyc+=12;popaf();
if(cyc>=evt){pc=5860;return;}
case 5860:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=5861;return;}
case 5861:cyc+=8;and(31);
if(cyc>=evt){pc=5863;return;}
case 5863:cyc+=16;wr(49490,A);
if(cyc>=evt){pc=5866;return;}
case 5866:cyc+=12;H=193;L=84;
if(cyc>=evt){pc=5869;return;}
case 5869:cyc+=12;wr((H<<8|L),inc(rd((H<<8|L))));
if(cyc>=evt){pc=5870;return;}
case 5870:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=5871;return;}
case 5871:cyc+=16;pc=pop();return;
case 5872:cyc+=4;C=A;
if(cyc>=evt){pc=5873;return;}
case 5873:cyc+=12;H=192;L=171;
if(cyc>=evt){pc=5876;return;}
case 5876:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=5877;return;}
case 5877:cyc+=8;and(31);
if(cyc>=evt){pc=5879;return;}
case 5879:cyc+=4;cp(C);
if(cyc>=evt){pc=5880;return;}
case 5880:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=5881;return;}
case 5881:cyc+=4;A=L;
if(cyc>=evt){pc=5882;return;}
case 5882:cyc+=8;cp(204);
if(cyc>=evt){pc=5884;return;}
case 5884:cyc+=8;if(!fz){cyc+=4;pc=5876;return;}
if(cyc>=evt){pc=5886;return;}
case 5886:cyc+=8;or(255);
if(cyc>=evt){pc=5888;return;}
case 5888:cyc+=16;pc=pop();return;
case 5889:cyc+=8;A=sla(A);
if(cyc>=evt){pc=5891;return;}
case 5891:cyc+=8;A=sla(A);
if(cyc>=evt){pc=5893;return;}
case 5893:cyc+=12;D=198;E=208;
if(cyc>=evt){pc=5896;return;}
case 5896:cyc+=4;add(E);
if(cyc>=evt){pc=5897;return;}
case 5897:cyc+=4;E=A;
if(cyc>=evt){pc=5898;return;}
case 5898:cyc+=8;if(!fc){cyc+=4;pc=5901;return;}
if(cyc>=evt){pc=5900;return;}
case 5900:cyc+=4;D=inc(D);
if(cyc>=evt){pc=5901;return;}
case 5901:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=5902;return;}
case 5902:cyc+=8;and(127);
if(cyc>=evt){pc=5904;return;}
case 5904:cyc+=8;if(!fz){cyc+=4;pc=5915;return;}
if(cyc>=evt){pc=5906;return;}
case 5906:cyc+=8;A=20;
if(cyc>=evt){pc=5908;return;}
case 5908:cyc+=12;H=193;L=79;
if(cyc>=evt){pc=5911;return;}
case 5911:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=5912;return;}
case 5912:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=5913;return;}
case 5913:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=5914;return;}
case 5914:cyc+=16;pc=pop();return;
case 5915:cyc+=4;A=dec(A);
if(cyc>=evt){pc=5916;return;}
case 5916:cyc+=12;B=0;C=30;
if(cyc>=evt){pc=5919;return;}
case 5919:cyc+=24;push(5922);pc=7544;return;
if(cyc>=evt){pc=5922;return;}
case 5922:cyc+=12;B=196;C=9;
if(cyc>=evt){pc=5925;return;}
case 5925:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=5926;return;}
case 5926:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=5927;return;}
case 5927:cyc+=16;wr(49487,A);
if(cyc>=evt){pc=5930;return;}
case 5930:cyc+=12;B=0;C=10;
if(cyc>=evt){pc=5933;return;}
case 5933:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=5934;return;}
case 5934:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=5935;return;}
case 5935:cyc+=16;wr(49488,A);
if(cyc>=evt){pc=5938;return;}
case 5938:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=5939;return;}
case 5939:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=5940;return;}
case 5940:cyc+=16;wr(49489,A);
if(cyc>=evt){pc=5943;return;}
case 5943:cyc+=16;pc=pop();return;
case 5944:cyc+=16;A=rd(49462);
if(cyc>=evt){pc=5947;return;}
case 5947:cyc+=4;and(A);
if(cyc>=evt){pc=5948;return;}
case 5948:cyc+=12;if(!fz){cyc+=4;pc=6221;return;}
if(cyc>=evt){pc=5951;return;}
case 5951:cyc+=16;A=rd(49456);
if(cyc>=evt){pc=5954;return;}
case 5954:cyc+=8;cp(106);
if(cyc>=evt){pc=5956;return;}
case 5956:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=5957;return;}
case 5957:cyc+=16;pushaf();
if(cyc>=evt){pc=5958;return;}
case 5958:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=5961;return;}
case 5961:cyc+=16;wr(49461,A);
if(cyc>=evt){pc=5964;return;}
case 5964:cyc+=12;popaf();
if(cyc>=evt){pc=5965;return;}
case 5965:cyc+=16;wr(49458,A);
if(cyc>=evt){pc=5968;return;}
case 5968:cyc+=8;cp(59);
if(cyc>=evt){pc=5970;return;}
case 5970:cyc+=8;if(fc){cyc+=4;pc=5978;return;}
if(cyc>=evt){pc=5972;return;}
case 5972:cyc+=8;cp(77);
if(cyc>=evt){pc=5974;return;}
case 5974:cyc+=8;if(!fc){cyc+=4;pc=5978;return;}
if(cyc>=evt){pc=5976;return;}
case 5976:cyc+=8;sub(18);
if(cyc>=evt){pc=5978;return;}
case 5978:cyc+=16;wr(49460,A);
if(cyc>=evt){pc=5981;return;}
case 5981:cyc+=8;cp(105);
if(cyc>=evt){pc=5983;return;}
case 5983:cyc+=8;if(!fz){cyc+=4;pc=5995;return;}
if(cyc>=evt){pc=5985;return;}
case 5985:cyc+=4;xor(A);
if(cyc>=evt){pc=5986;return;}
case 5986:cyc+=16;wr(49462,A);
if(cyc>=evt){pc=5989;return;}
case 5989:cyc+=8;A=106;
if(cyc>=evt){pc=5991;return;}
case 5991:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=5994;return;}
case 5994:cyc+=16;pc=pop();return;
case 5995:cyc+=8;A=10;
pc=5997;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 5997:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=6000;return;}
case 6000:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=6003;return;}
case 6003:cyc+=4;E=A;
if(cyc>=evt){pc=6004;return;}
case 6004:cyc+=8;D=0;
if(cyc>=evt){pc=6006;return;}
case 6006:cyc+=12;H=71;L=8;
if(cyc>=evt){pc=6009;return;}
case 6009:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6010;return;}
case 6010:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=6011;return;}
case 6011:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6013;return;}
case 6013:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6015;return;}
case 6015:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6017;return;}
case 6017:cyc+=12;H=193;L=103;
if(cyc>=evt){pc=6020;return;}
case 6020:cyc+=12;fz=(rd((H<<8|L))>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=6022;return;}
case 6022:cyc+=8;if(fz){cyc+=4;pc=6026;return;}
if(cyc>=evt){pc=6024;return;}
case 6024:cyc+=8;add(8);
if(cyc>=evt){pc=6026;return;}
case 6026:cyc+=16;wr(49446,A);
if(cyc>=evt){pc=6029;return;}
case 6029:cyc+=12;H=72;L=112;
if(cyc>=evt){pc=6032;return;}
case 6032:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6033;return;}
case 6033:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=6034;return;}
case 6034:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6036;return;}
case 6036:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6038;return;}
case 6038:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6040;return;}
case 6040:cyc+=16;wr(49447,A);
if(cyc>=evt){pc=6043;return;}
case 6043:cyc+=8;A=10;
if(cyc>=evt){pc=6045;return;}
case 6045:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=6048;return;}
case 6048:cyc+=12;H=71;L=188;
if(cyc>=evt){pc=6051;return;}
case 6051:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6052;return;}
case 6052:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=6055;return;}
case 6055:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=6057;return;}
case 6057:cyc+=8;if(fz){cyc+=4;pc=6065;return;}
if(cyc>=evt){pc=6059;return;}
case 6059:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=6062;return;}
case 6062:cyc+=8;sub(rd((H<<8|L)));
if(cyc>=evt){pc=6063;return;}
case 6063:cyc+=12;pc=6069;return;
case 6065:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=6068;return;}
case 6068:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=6069;return;}
case 6069:cyc+=16;wr(49427,A);
if(cyc>=evt){pc=6072;return;}
case 6072:cyc+=12;H=73;L=36;
if(cyc>=evt){pc=6075;return;}
case 6075:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6076;return;}
case 6076:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=6079;return;}
case 6079:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=6080;return;}
case 6080:cyc+=16;wr(49428,A);
if(cyc>=evt){pc=6083;return;}
case 6083:cyc+=12;H=69;L=160;
if(cyc>=evt){pc=6086;return;}
case 6086:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=6089;return;}
case 6089:cyc+=8;cp(17);
if(cyc>=evt){pc=6091;return;}
case 6091:cyc+=8;if(!fz){cyc+=4;pc=6096;return;}
if(cyc>=evt){pc=6093;return;}
case 6093:cyc+=12;H=70;L=84;
if(cyc>=evt){pc=6096;return;}
case 6096:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6097;return;}
case 6097:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=6098;return;}
case 6098:cyc+=16;wr(49479,A);
if(cyc>=evt){pc=6101;return;}
case 6101:cyc+=12;H=75;L=244;
if(cyc>=evt){pc=6104;return;}
case 6104:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6105;return;}
case 6105:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=6106;return;}
case 6106:cyc+=16;wr(49494,A);
if(cyc>=evt){pc=6109;return;}
case 6109:cyc+=12;H=75;L=64;
if(cyc>=evt){pc=6112;return;}
case 6112:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6113;return;}
case 6113:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=6114;return;}
case 6114:cyc+=16;wr(49473,A);
if(cyc>=evt){pc=6117;return;}
case 6117:cyc+=8;E=sla(E);
if(cyc>=evt){pc=6119;return;}
case 6119:cyc+=8;D=rl(D);
if(cyc>=evt){pc=6121;return;}
case 6121:cyc+=12;H=73;L=216;
if(cyc>=evt){pc=6124;return;}
case 6124:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6125;return;}
case 6125:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6126;return;}
case 6126:cyc+=16;wr(49474,A);
if(cyc>=evt){pc=6129;return;}
case 6129:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6130;return;}
case 6130:cyc+=16;wr(49475,A);
if(cyc>=evt){pc=6133;return;}
case 6133:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=6134;return;}
case 6134:cyc+=12;H=64;L=0;
if(cyc>=evt){pc=6137;return;}
case 6137:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=6140;return;}
case 6140:cyc+=8;cp(17);
if(cyc>=evt){pc=6142;return;}
case 6142:cyc+=8;if(!fz){cyc+=4;pc=6147;return;}
if(cyc>=evt){pc=6144;return;}
case 6144:cyc+=12;H=65;L=104;
if(cyc>=evt){pc=6147;return;}
case 6147:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6148;return;}
case 6148:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6149;return;}
case 6149:cyc+=4;E=A;
if(cyc>=evt){pc=6150;return;}
case 6150:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6151;return;}
case 6151:cyc+=4;D=A;
if(cyc>=evt){pc=6152;return;}
case 6152:cyc+=16;A=rd(49479);
if(cyc>=evt){pc=6155;return;}
case 6155:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=6158;return;}
case 6158:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=6159;return;}
case 6159:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=6160;return;}
case 6160:cyc+=16;wr(49462,A);
if(cyc>=evt){pc=6163;return;}
case 6163:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=6164;return;}
case 6164:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=6165;return;}
case 6165:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6167;return;}
case 6167:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6169;return;}
case 6169:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6171;return;}
case 6171:cyc+=16;wr(49443,A);
if(cyc>=evt){pc=6174;return;}
case 6174:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=6175;return;}
case 6175:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=6176;return;}
case 6176:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6178;return;}
case 6178:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6180;return;}
case 6180:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6182;return;}
case 6182:cyc+=16;wr(49444,A);
if(cyc>=evt){pc=6185;return;}
case 6185:cyc+=4;A=E;
if(cyc>=evt){pc=6186;return;}
case 6186:cyc+=16;wr(49465,A);
if(cyc>=evt){pc=6189;return;}
case 6189:cyc+=4;A=D;
if(cyc>=evt){pc=6190;return;}
case 6190:cyc+=16;wr(49466,A);
if(cyc>=evt){pc=6193;return;}
case 6193:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=6194;return;}
case 6194:cyc+=8;A=10;
if(cyc>=evt){pc=6196;return;}
case 6196:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=6199;return;}
case 6199:cyc+=12;H=66;L=208;
if(cyc>=evt){pc=6202;return;}
case 6202:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=6205;return;}
case 6205:cyc+=8;cp(17);
if(cyc>=evt){pc=6207;return;}
case 6207:cyc+=8;if(!fz){cyc+=4;pc=6212;return;}
if(cyc>=evt){pc=6209;return;}
case 6209:cyc+=12;H=68;L=56;
if(cyc>=evt){pc=6212;return;}
case 6212:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6213;return;}
case 6213:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6214;return;}
case 6214:cyc+=16;wr(49469,A);
if(cyc>=evt){pc=6217;return;}
case 6217:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6218;return;}
case 6218:cyc+=16;wr(49470,A);
if(cyc>=evt){pc=6221;return;}
case 6221:cyc+=16;A=rd(49462);
if(cyc>=evt){pc=6224;return;}
case 6224:cyc+=4;and(A);
if(cyc>=evt){pc=6225;return;}
case 6225:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=6226;return;}
case 6226:cyc+=12;H=193;L=65;
if(cyc>=evt){pc=6229;return;}
case 6229:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=6230;return;}
case 6230:cyc+=12;if(fz){cyc+=12;push(6233);pc=15057;return;}
if(cyc>=evt){pc=6233;return;}
case 6233:cyc+=16;A=rd(49465);
if(cyc>=evt){pc=6236;return;}
case 6236:cyc+=4;E=A;
if(cyc>=evt){pc=6237;return;}
case 6237:cyc+=16;A=rd(49466);
if(cyc>=evt){pc=6240;return;}
case 6240:cyc+=4;D=A;
if(cyc>=evt){pc=6241;return;}
case 6241:cyc+=16;A=rd(49479);
if(cyc>=evt){pc=6244;return;}
case 6244:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=6247;return;}
case 6247:cyc+=12;H=192;L=8;
if(cyc>=evt){pc=6250;return;}
case 6250:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=6253;return;}
case 6253:cyc+=8;A=111;
if(cyc>=evt){pc=6255;return;}
case 6255:cyc+=16;wr(49445,A);
if(cyc>=evt){pc=6258;return;}
case 6258:cyc+=16;A=rd(49442);
if(cyc>=evt){pc=6261;return;}
case 6261:cyc+=4;and(A);
if(cyc>=evt){pc=6262;return;}
case 6262:cyc+=12;if(!fz){cyc+=4;pc=6393;return;}
if(cyc>=evt){pc=6265;return;}
case 6265:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=6266;return;}
case 6266:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=6267;return;}
case 6267:cyc+=4;and(A);
if(cyc>=evt){pc=6268;return;}
case 6268:cyc+=8;if(fz){cyc+=4;pc=6310;return;}
if(cyc>=evt){pc=6270;return;}
case 6270:cyc+=24;push(6273);pc=7031;return;
if(cyc>=evt){pc=6273;return;}
case 6273:cyc+=16;A=rd(49441);
if(cyc>=evt){pc=6276;return;}
case 6276:cyc+=4;add(C);
if(cyc>=evt){pc=6277;return;}
case 6277:cyc+=8;add(16);
if(cyc>=evt){pc=6279;return;}
case 6279:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=6280;return;}
case 6280:cyc+=12;H=193;L=39;
if(cyc>=evt){pc=6283;return;}
case 6283:cyc+=8;sub(rd((H<<8|L)));
if(cyc>=evt){pc=6284;return;}
case 6284:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=6285;return;}
case 6285:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6286;return;}
case 6286:cyc+=16;A=rd(49440);
if(cyc>=evt){pc=6289;return;}
case 6289:cyc+=4;add(B);
if(cyc>=evt){pc=6290;return;}
case 6290:cyc+=8;add(8);
if(cyc>=evt){pc=6292;return;}
case 6292:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=6293;return;}
case 6293:cyc+=12;H=193;L=38;
if(cyc>=evt){pc=6296;return;}
case 6296:cyc+=8;sub(rd((H<<8|L)));
if(cyc>=evt){pc=6297;return;}
case 6297:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=6298;return;}
case 6298:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6299;return;}
case 6299:cyc+=16;A=rd(49445);
if(cyc>=evt){pc=6302;return;}
case 6302:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6303;return;}
case 6303:cyc+=4;A=inc(A);
if(cyc>=evt){pc=6304;return;}
case 6304:cyc+=16;wr(49445,A);
if(cyc>=evt){pc=6307;return;}
case 6307:cyc+=8;A=0;
if(cyc>=evt){pc=6309;return;}
case 6309:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6310;return;}
case 6310:cyc+=4;A=B;
if(cyc>=evt){pc=6311;return;}
case 6311:cyc+=8;add(8);
if(cyc>=evt){pc=6313;return;}
case 6313:cyc+=4;B=A;
if(cyc>=evt){pc=6314;return;}
case 6314:cyc+=16;A=rd(49443);
if(cyc>=evt){pc=6317;return;}
case 6317:cyc+=4;cp(B);
if(cyc>=evt){pc=6318;return;}
case 6318:cyc+=8;if(!fz){cyc+=4;pc=6265;return;}
if(cyc>=evt){pc=6320;return;}
case 6320:cyc+=8;B=0;
if(cyc>=evt){pc=6322;return;}
case 6322:cyc+=4;A=C;
if(cyc>=evt){pc=6323;return;}
case 6323:cyc+=8;add(8);
if(cyc>=evt){pc=6325;return;}
case 6325:cyc+=4;C=A;
if(cyc>=evt){pc=6326;return;}
case 6326:cyc+=16;A=rd(49444);
if(cyc>=evt){pc=6329;return;}
case 6329:cyc+=4;cp(C);
if(cyc>=evt){pc=6330;return;}
case 6330:cyc+=8;if(!fz){cyc+=4;pc=6265;return;}
if(cyc>=evt){pc=6332;return;}
case 6332:cyc+=4;A=E;
if(cyc>=evt){pc=6333;return;}
case 6333:cyc+=16;wr(49465,A);
if(cyc>=evt){pc=6336;return;}
case 6336:cyc+=4;A=D;
if(cyc>=evt){pc=6337;return;}
case 6337:cyc+=16;wr(49466,A);
if(cyc>=evt){pc=6340;return;}
case 6340:cyc+=8;A=1;
if(cyc>=evt){pc=6342;return;}
case 6342:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=6345;return;}
case 6345:cyc+=4;A=L;
if(cyc>=evt){pc=6346;return;}
case 6346:cyc+=8;cp(68);
if(cyc>=evt){pc=6348;return;}
case 6348:cyc+=8;if(!fc){cyc+=4;pc=6357;return;}
if(cyc>=evt){pc=6350;return;}
case 6350:cyc+=4;xor(A);
if(cyc>=evt){pc=6351;return;}
case 6351:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6352;return;}
case 6352:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6353;return;}
case 6353:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6354;return;}
case 6354:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6355;return;}
case 6355:cyc+=12;pc=6345;return;
case 6357:cyc+=12;H=193;L=54;
if(cyc>=evt){pc=6360;return;}
case 6360:cyc+=12;wr((H<<8|L),dec(rd((H<<8|L))));
if(cyc>=evt){pc=6361;return;}
case 6361:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=6362;return;}
case 6362:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=6365;return;}
case 6365:cyc+=12;H=193;L=16;
if(cyc>=evt){pc=6368;return;}
case 6368:cyc+=8;xor(rd((H<<8|L)));
if(cyc>=evt){pc=6369;return;}
case 6369:cyc+=16;wr(49423,A);
if(cyc>=evt){pc=6372;return;}
case 6372:cyc+=4;xor(A);
if(cyc>=evt){pc=6373;return;}
case 6373:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=6374;return;}
case 6374:cyc+=16;A=rd(49427);
if(cyc>=evt){pc=6377;return;}
case 6377:cyc+=16;wr(49425,A);
if(cyc>=evt){pc=6380;return;}
case 6380:cyc+=16;A=rd(49428);
if(cyc>=evt){pc=6383;return;}
case 6383:cyc+=16;wr(49426,A);
if(cyc>=evt){pc=6386;return;}
case 6386:cyc+=16;A=rd(49494);
if(cyc>=evt){pc=6389;return;}
case 6389:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=6392;return;}
case 6392:cyc+=16;pc=pop();return;
case 6393:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=6394;return;}
case 6394:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=6395;return;}
case 6395:cyc+=4;and(A);
if(cyc>=evt){pc=6396;return;}
case 6396:cyc+=8;if(fz){cyc+=4;pc=6438;return;}
if(cyc>=evt){pc=6398;return;}
case 6398:cyc+=24;push(6401);pc=7031;return;
if(cyc>=evt){pc=6401;return;}
case 6401:cyc+=16;A=rd(49441);
if(cyc>=evt){pc=6404;return;}
case 6404:cyc+=4;add(C);
if(cyc>=evt){pc=6405;return;}
case 6405:cyc+=8;add(16);
if(cyc>=evt){pc=6407;return;}
case 6407:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=6408;return;}
case 6408:cyc+=12;H=193;L=39;
if(cyc>=evt){pc=6411;return;}
case 6411:cyc+=8;sub(rd((H<<8|L)));
if(cyc>=evt){pc=6412;return;}
case 6412:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=6413;return;}
case 6413:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6414;return;}
case 6414:cyc+=16;A=rd(49440);
if(cyc>=evt){pc=6417;return;}
case 6417:cyc+=8;add(16);
if(cyc>=evt){pc=6419;return;}
case 6419:cyc+=4;sub(B);
if(cyc>=evt){pc=6420;return;}
case 6420:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=6421;return;}
case 6421:cyc+=12;H=193;L=38;
if(cyc>=evt){pc=6424;return;}
case 6424:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=6425;return;}
case 6425:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=6426;return;}
case 6426:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
pc=6427;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 6427:cyc+=16;A=rd(49445);
if(cyc>=evt){pc=6430;return;}
case 6430:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6431;return;}
case 6431:cyc+=4;A=inc(A);
if(cyc>=evt){pc=6432;return;}
case 6432:cyc+=16;wr(49445,A);
if(cyc>=evt){pc=6435;return;}
case 6435:cyc+=8;A=32;
if(cyc>=evt){pc=6437;return;}
case 6437:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6438;return;}
case 6438:cyc+=4;A=B;
if(cyc>=evt){pc=6439;return;}
case 6439:cyc+=8;add(8);
if(cyc>=evt){pc=6441;return;}
case 6441:cyc+=4;B=A;
if(cyc>=evt){pc=6442;return;}
case 6442:cyc+=16;A=rd(49443);
if(cyc>=evt){pc=6445;return;}
case 6445:cyc+=4;cp(B);
if(cyc>=evt){pc=6446;return;}
case 6446:cyc+=8;if(!fz){cyc+=4;pc=6393;return;}
if(cyc>=evt){pc=6448;return;}
case 6448:cyc+=8;B=0;
if(cyc>=evt){pc=6450;return;}
case 6450:cyc+=4;A=C;
if(cyc>=evt){pc=6451;return;}
case 6451:cyc+=8;add(8);
if(cyc>=evt){pc=6453;return;}
case 6453:cyc+=4;C=A;
if(cyc>=evt){pc=6454;return;}
case 6454:cyc+=16;A=rd(49444);
if(cyc>=evt){pc=6457;return;}
case 6457:cyc+=4;cp(C);
if(cyc>=evt){pc=6458;return;}
case 6458:cyc+=8;if(!fz){cyc+=4;pc=6393;return;}
if(cyc>=evt){pc=6460;return;}
case 6460:cyc+=16;pc=6332;return;
case 6463:cyc+=16;A=rd(49463);
if(cyc>=evt){pc=6466;return;}
case 6466:cyc+=4;and(A);
if(cyc>=evt){pc=6467;return;}
case 6467:cyc+=12;if(!fz){cyc+=4;pc=6785;return;}
if(cyc>=evt){pc=6470;return;}
case 6470:cyc+=16;A=rd(49457);
if(cyc>=evt){pc=6473;return;}
case 6473:cyc+=8;cp(106);
if(cyc>=evt){pc=6475;return;}
case 6475:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=6476;return;}
case 6476:cyc+=16;wr(49459,A);
if(cyc>=evt){pc=6479;return;}
case 6479:cyc+=4;E=A;
if(cyc>=evt){pc=6480;return;}
case 6480:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=6483;return;}
case 6483:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=6485;return;}
case 6485:cyc+=8;if(fz){cyc+=4;pc=6507;return;}
if(cyc>=evt){pc=6487;return;}
case 6487:cyc+=4;A=E;
if(cyc>=evt){pc=6488;return;}
case 6488:cyc+=8;cp(108);
if(cyc>=evt){pc=6490;return;}
case 6490:cyc+=8;if(fc){cyc+=4;pc=6524;return;}
if(cyc>=evt){pc=6492;return;}
case 6492:cyc+=8;cp(118);
if(cyc>=evt){pc=6494;return;}
case 6494:cyc+=8;if(!fc){cyc+=4;pc=6524;return;}
if(cyc>=evt){pc=6496;return;}
case 6496:cyc+=12;H=0;L=53;
if(cyc>=evt){pc=6499;return;}
case 6499:cyc+=8;sub(108);
if(cyc>=evt){pc=6501;return;}
case 6501:cyc+=4;add(L);
if(cyc>=evt){pc=6502;return;}
case 6502:cyc+=4;L=A;
if(cyc>=evt){pc=6503;return;}
case 6503:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=6504;return;}
case 6504:cyc+=4;E=A;
if(cyc>=evt){pc=6505;return;}
case 6505:cyc+=12;pc=6524;return;
case 6507:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=6510;return;}
case 6510:cyc+=8;cp(3);
if(cyc>=evt){pc=6512;return;}
case 6512:cyc+=8;if(!fz){cyc+=4;pc=6524;return;}
if(cyc>=evt){pc=6514;return;}
case 6514:cyc+=4;A=E;
if(cyc>=evt){pc=6515;return;}
case 6515:cyc+=8;add(19);
if(cyc>=evt){pc=6517;return;}
case 6517:cyc+=4;E=A;
if(cyc>=evt){pc=6518;return;}
case 6518:cyc+=4;xor(A);
if(cyc>=evt){pc=6519;return;}
case 6519:cyc+=16;wr(49505,A);
if(cyc>=evt){pc=6522;return;}
case 6522:cyc+=12;pc=6532;return;
case 6524:cyc+=8;cp(13);
if(cyc>=evt){pc=6526;return;}
case 6526:cyc+=8;if(!fz){cyc+=4;pc=6532;return;}
if(cyc>=evt){pc=6528;return;}
case 6528:cyc+=4;A=E;
if(cyc>=evt){pc=6529;return;}
case 6529:cyc+=8;add(38);
if(cyc>=evt){pc=6531;return;}
case 6531:cyc+=4;E=A;
if(cyc>=evt){pc=6532;return;}
case 6532:cyc+=8;A=10;
if(cyc>=evt){pc=6534;return;}
case 6534:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=6537;return;}
case 6537:cyc+=8;D=0;
if(cyc>=evt){pc=6539;return;}
case 6539:cyc+=12;H=71;L=8;
if(cyc>=evt){pc=6542;return;}
case 6542:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6543;return;}
case 6543:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=6544;return;}
case 6544:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6546;return;}
case 6546:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6548;return;}
case 6548:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6550;return;}
case 6550:cyc+=8;add(8);
if(cyc>=evt){pc=6552;return;}
case 6552:cyc+=16;wr(49454,A);
if(cyc>=evt){pc=6555;return;}
case 6555:cyc+=12;H=72;L=112;
if(cyc>=evt){pc=6558;return;}
case 6558:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6559;return;}
case 6559:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=6560;return;}
case 6560:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6562;return;}
case 6562:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6564;return;}
case 6564:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6566;return;}
case 6566:cyc+=16;wr(49455,A);
if(cyc>=evt){pc=6569;return;}
case 6569:cyc+=8;A=10;
if(cyc>=evt){pc=6571;return;}
case 6571:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=6574;return;}
case 6574:cyc+=12;H=71;L=188;
if(cyc>=evt){pc=6577;return;}
case 6577:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6578;return;}
case 6578:cyc+=16;A=rd(49434);
if(cyc>=evt){pc=6581;return;}
case 6581:cyc+=4;and(A);
if(cyc>=evt){pc=6582;return;}
case 6582:cyc+=8;if(fz){cyc+=4;pc=6590;return;}
if(cyc>=evt){pc=6584;return;}
case 6584:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=6587;return;}
case 6587:cyc+=8;sub(rd((H<<8|L)));
if(cyc>=evt){pc=6588;return;}
case 6588:cyc+=12;pc=6594;return;
case 6590:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=6593;return;}
case 6593:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=6594;return;}
case 6594:cyc+=16;wr(49438,A);
if(cyc>=evt){pc=6597;return;}
case 6597:cyc+=12;H=73;L=36;
if(cyc>=evt){pc=6600;return;}
case 6600:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6601;return;}
case 6601:cyc+=16;A=rd(49437);
if(cyc>=evt){pc=6604;return;}
case 6604:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=6605;return;}
case 6605:cyc+=16;wr(49439,A);
if(cyc>=evt){pc=6608;return;}
case 6608:cyc+=12;H=69;L=160;
if(cyc>=evt){pc=6611;return;}
case 6611:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=6614;return;}
case 6614:cyc+=8;cp(17);
if(cyc>=evt){pc=6616;return;}
case 6616:cyc+=8;if(!fz){cyc+=4;pc=6634;return;}
if(cyc>=evt){pc=6618;return;}
case 6618:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=6621;return;}
case 6621:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=6623;return;}
case 6623:cyc+=8;if(!fz){cyc+=4;pc=6634;return;}
if(cyc>=evt){pc=6625;return;}
case 6625:cyc+=16;A=rd(49591);
if(cyc>=evt){pc=6628;return;}
case 6628:cyc+=4;or(A);
if(cyc>=evt){pc=6629;return;}
case 6629:cyc+=8;if(!fz){cyc+=4;pc=6634;return;}
if(cyc>=evt){pc=6631;return;}
case 6631:cyc+=12;H=70;L=84;
if(cyc>=evt){pc=6634;return;}
case 6634:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6635;return;}
case 6635:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=6636;return;}
case 6636:cyc+=16;wr(49480,A);
if(cyc>=evt){pc=6639;return;}
case 6639:cyc+=12;H=75;L=244;
if(cyc>=evt){pc=6642;return;}
case 6642:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6643;return;}
case 6643:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=6644;return;}
case 6644:cyc+=16;wr(49495,A);
if(cyc>=evt){pc=6647;return;}
case 6647:cyc+=12;H=75;L=64;
if(cyc>=evt){pc=6650;return;}
case 6650:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6651;return;}
case 6651:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=6652;return;}
case 6652:cyc+=16;wr(49476,A);
if(cyc>=evt){pc=6655;return;}
case 6655:cyc+=8;E=sla(E);
if(cyc>=evt){pc=6657;return;}
case 6657:cyc+=8;D=rl(D);
if(cyc>=evt){pc=6659;return;}
case 6659:cyc+=12;H=73;L=216;
if(cyc>=evt){pc=6662;return;}
case 6662:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6663;return;}
case 6663:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6664;return;}
case 6664:cyc+=16;wr(49477,A);
if(cyc>=evt){pc=6667;return;}
case 6667:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6668;return;}
case 6668:cyc+=16;wr(49478,A);
if(cyc>=evt){pc=6671;return;}
case 6671:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=6672;return;}
case 6672:cyc+=12;H=64;L=0;
if(cyc>=evt){pc=6675;return;}
case 6675:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=6678;return;}
case 6678:cyc+=8;cp(17);
if(cyc>=evt){pc=6680;return;}
case 6680:cyc+=8;if(!fz){cyc+=4;pc=6698;return;}
if(cyc>=evt){pc=6682;return;}
case 6682:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=6685;return;}
case 6685:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=6687;return;}
case 6687:cyc+=8;if(!fz){cyc+=4;pc=6698;return;}
if(cyc>=evt){pc=6689;return;}
case 6689:cyc+=16;A=rd(49591);
if(cyc>=evt){pc=6692;return;}
case 6692:cyc+=4;or(A);
if(cyc>=evt){pc=6693;return;}
case 6693:cyc+=8;if(!fz){cyc+=4;pc=6698;return;}
if(cyc>=evt){pc=6695;return;}
case 6695:cyc+=12;H=65;L=104;
if(cyc>=evt){pc=6698;return;}
case 6698:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6699;return;}
case 6699:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6700;return;}
case 6700:cyc+=4;E=A;
if(cyc>=evt){pc=6701;return;}
case 6701:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6702;return;}
case 6702:cyc+=4;D=A;
if(cyc>=evt){pc=6703;return;}
case 6703:cyc+=16;A=rd(49480);
if(cyc>=evt){pc=6706;return;}
case 6706:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=6709;return;}
case 6709:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=6710;return;}
case 6710:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=6711;return;}
case 6711:cyc+=16;wr(49463,A);
if(cyc>=evt){pc=6714;return;}
case 6714:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=6715;return;}
case 6715:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=6716;return;}
case 6716:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6718;return;}
case 6718:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6720;return;}
case 6720:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6722;return;}
case 6722:cyc+=16;wr(49451,A);
if(cyc>=evt){pc=6725;return;}
case 6725:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=6726;return;}
case 6726:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=6727;return;}
case 6727:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6729;return;}
case 6729:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6731;return;}
case 6731:cyc+=8;A=sla(A);
if(cyc>=evt){pc=6733;return;}
case 6733:cyc+=16;wr(49452,A);
if(cyc>=evt){pc=6736;return;}
case 6736:cyc+=4;A=E;
if(cyc>=evt){pc=6737;return;}
case 6737:cyc+=16;wr(49467,A);
if(cyc>=evt){pc=6740;return;}
case 6740:cyc+=4;A=D;
if(cyc>=evt){pc=6741;return;}
case 6741:cyc+=16;wr(49468,A);
if(cyc>=evt){pc=6744;return;}
case 6744:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=6745;return;}
case 6745:cyc+=8;A=10;
if(cyc>=evt){pc=6747;return;}
case 6747:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=6750;return;}
case 6750:cyc+=12;H=66;L=208;
if(cyc>=evt){pc=6753;return;}
case 6753:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=6756;return;}
case 6756:cyc+=8;cp(17);
if(cyc>=evt){pc=6758;return;}
case 6758:cyc+=8;if(!fz){cyc+=4;pc=6776;return;}
if(cyc>=evt){pc=6760;return;}
case 6760:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=6763;return;}
case 6763:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=6765;return;}
case 6765:cyc+=8;if(!fz){cyc+=4;pc=6776;return;}
if(cyc>=evt){pc=6767;return;}
case 6767:cyc+=16;A=rd(49591);
if(cyc>=evt){pc=6770;return;}
case 6770:cyc+=4;or(A);
if(cyc>=evt){pc=6771;return;}
case 6771:cyc+=8;if(!fz){cyc+=4;pc=6776;return;}
if(cyc>=evt){pc=6773;return;}
case 6773:cyc+=12;H=68;L=56;
if(cyc>=evt){pc=6776;return;}
case 6776:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=6777;return;}
case 6777:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6778;return;}
case 6778:cyc+=16;wr(49471,A);
if(cyc>=evt){pc=6781;return;}
case 6781:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6782;return;}
case 6782:cyc+=16;wr(49472,A);
if(cyc>=evt){pc=6785;return;}
case 6785:cyc+=16;A=rd(49463);
if(cyc>=evt){pc=6788;return;}
case 6788:cyc+=4;and(A);
if(cyc>=evt){pc=6789;return;}
case 6789:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=6790;return;}
case 6790:cyc+=12;H=193;L=68;
if(cyc>=evt){pc=6793;return;}
case 6793:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=6794;return;}
case 6794:cyc+=12;if(fz){cyc+=12;push(6797);pc=15047;return;}
if(cyc>=evt){pc=6797;return;}
case 6797:cyc+=16;A=rd(49467);
if(cyc>=evt){pc=6800;return;}
case 6800:cyc+=4;E=A;
if(cyc>=evt){pc=6801;return;}
case 6801:cyc+=16;A=rd(49468);
if(cyc>=evt){pc=6804;return;}
case 6804:cyc+=4;D=A;
if(cyc>=evt){pc=6805;return;}
case 6805:cyc+=16;A=rd(49480);
if(cyc>=evt){pc=6808;return;}
case 6808:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=6811;return;}
case 6811:cyc+=12;H=192;L=68;
if(cyc>=evt){pc=6814;return;}
case 6814:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=6817;return;}
case 6817:cyc+=8;A=95;
if(cyc>=evt){pc=6819;return;}
case 6819:cyc+=16;wr(49453,A);
if(cyc>=evt){pc=6822;return;}
case 6822:cyc+=16;A=rd(49450);
if(cyc>=evt){pc=6825;return;}
case 6825:cyc+=4;and(A);
if(cyc>=evt){pc=6826;return;}
case 6826:cyc+=12;if(!fz){cyc+=4;pc=6958;return;}
if(cyc>=evt){pc=6829;return;}
case 6829:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=6830;return;}
case 6830:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=6831;return;}
case 6831:cyc+=4;and(A);
if(cyc>=evt){pc=6832;return;}
case 6832:cyc+=8;if(fz){cyc+=4;pc=6875;return;}
if(cyc>=evt){pc=6834;return;}
case 6834:cyc+=24;push(6837);pc=7131;return;
if(cyc>=evt){pc=6837;return;}
case 6837:cyc+=16;A=rd(49449);
if(cyc>=evt){pc=6840;return;}
case 6840:cyc+=4;add(C);
if(cyc>=evt){pc=6841;return;}
case 6841:cyc+=8;add(16);
if(cyc>=evt){pc=6843;return;}
case 6843:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=6844;return;}
case 6844:cyc+=12;H=193;L=47;
if(cyc>=evt){pc=6847;return;}
case 6847:cyc+=8;sub(rd((H<<8|L)));
if(cyc>=evt){pc=6848;return;}
case 6848:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=6849;return;}
case 6849:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6850;return;}
case 6850:cyc+=16;A=rd(49448);
if(cyc>=evt){pc=6853;return;}
case 6853:cyc+=4;add(B);
if(cyc>=evt){pc=6854;return;}
case 6854:cyc+=8;add(8);
if(cyc>=evt){pc=6856;return;}
case 6856:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=6857;return;}
case 6857:cyc+=12;H=193;L=46;
if(cyc>=evt){pc=6860;return;}
case 6860:cyc+=8;sub(rd((H<<8|L)));
if(cyc>=evt){pc=6861;return;}
case 6861:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=6862;return;}
case 6862:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
pc=6863;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 6863:cyc+=16;A=rd(49453);
if(cyc>=evt){pc=6866;return;}
case 6866:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6867;return;}
case 6867:cyc+=4;A=inc(A);
if(cyc>=evt){pc=6868;return;}
case 6868:cyc+=16;wr(49453,A);
if(cyc>=evt){pc=6871;return;}
case 6871:cyc+=16;A=rd(49505);
if(cyc>=evt){pc=6874;return;}
case 6874:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6875;return;}
case 6875:cyc+=4;A=B;
if(cyc>=evt){pc=6876;return;}
case 6876:cyc+=8;add(8);
if(cyc>=evt){pc=6878;return;}
case 6878:cyc+=4;B=A;
if(cyc>=evt){pc=6879;return;}
case 6879:cyc+=16;A=rd(49451);
if(cyc>=evt){pc=6882;return;}
case 6882:cyc+=4;cp(B);
if(cyc>=evt){pc=6883;return;}
case 6883:cyc+=8;if(!fz){cyc+=4;pc=6829;return;}
if(cyc>=evt){pc=6885;return;}
case 6885:cyc+=8;B=0;
if(cyc>=evt){pc=6887;return;}
case 6887:cyc+=4;A=C;
if(cyc>=evt){pc=6888;return;}
case 6888:cyc+=8;add(8);
if(cyc>=evt){pc=6890;return;}
case 6890:cyc+=4;C=A;
if(cyc>=evt){pc=6891;return;}
case 6891:cyc+=16;A=rd(49452);
if(cyc>=evt){pc=6894;return;}
case 6894:cyc+=4;cp(C);
if(cyc>=evt){pc=6895;return;}
case 6895:cyc+=8;if(!fz){cyc+=4;pc=6829;return;}
if(cyc>=evt){pc=6897;return;}
case 6897:cyc+=4;A=E;
if(cyc>=evt){pc=6898;return;}
case 6898:cyc+=16;wr(49467,A);
if(cyc>=evt){pc=6901;return;}
case 6901:cyc+=4;A=D;
if(cyc>=evt){pc=6902;return;}
case 6902:cyc+=16;wr(49468,A);
if(cyc>=evt){pc=6905;return;}
case 6905:cyc+=8;A=1;
if(cyc>=evt){pc=6907;return;}
case 6907:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=6910;return;}
case 6910:cyc+=4;A=L;
if(cyc>=evt){pc=6911;return;}
case 6911:cyc+=8;cp(132);
if(cyc>=evt){pc=6913;return;}
case 6913:cyc+=8;if(!fc){cyc+=4;pc=6922;return;}
if(cyc>=evt){pc=6915;return;}
case 6915:cyc+=4;xor(A);
if(cyc>=evt){pc=6916;return;}
case 6916:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6917;return;}
case 6917:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6918;return;}
case 6918:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6919;return;}
case 6919:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6920;return;}
case 6920:cyc+=12;pc=6910;return;
case 6922:cyc+=12;H=193;L=55;
if(cyc>=evt){pc=6925;return;}
case 6925:cyc+=12;wr((H<<8|L),dec(rd((H<<8|L))));
if(cyc>=evt){pc=6926;return;}
case 6926:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=6927;return;}
case 6927:cyc+=16;A=rd(49434);
if(cyc>=evt){pc=6930;return;}
case 6930:cyc+=12;H=193;L=27;
if(cyc>=evt){pc=6933;return;}
case 6933:cyc+=8;xor(rd((H<<8|L)));
if(cyc>=evt){pc=6934;return;}
case 6934:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=6937;return;}
case 6937:cyc+=4;xor(A);
if(cyc>=evt){pc=6938;return;}
case 6938:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=6939;return;}
case 6939:cyc+=16;A=rd(49438);
if(cyc>=evt){pc=6942;return;}
case 6942:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=6945;return;}
case 6945:cyc+=16;A=rd(49439);
if(cyc>=evt){pc=6948;return;}
case 6948:cyc+=16;wr(49437,A);
if(cyc>=evt){pc=6951;return;}
case 6951:cyc+=16;A=rd(49495);
if(cyc>=evt){pc=6954;return;}
case 6954:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=6957;return;}
case 6957:cyc+=16;pc=pop();return;
case 6958:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=6959;return;}
case 6959:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=6960;return;}
case 6960:cyc+=4;and(A);
if(cyc>=evt){pc=6961;return;}
case 6961:cyc+=8;if(fz){cyc+=4;pc=7006;return;}
if(cyc>=evt){pc=6963;return;}
case 6963:cyc+=24;push(6966);pc=7131;return;
if(cyc>=evt){pc=6966;return;}
case 6966:cyc+=16;A=rd(49449);
if(cyc>=evt){pc=6969;return;}
case 6969:cyc+=4;add(C);
if(cyc>=evt){pc=6970;return;}
case 6970:cyc+=8;add(16);
if(cyc>=evt){pc=6972;return;}
case 6972:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=6973;return;}
case 6973:cyc+=12;H=193;L=47;
if(cyc>=evt){pc=6976;return;}
case 6976:cyc+=8;sub(rd((H<<8|L)));
if(cyc>=evt){pc=6977;return;}
case 6977:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=6978;return;}
case 6978:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6979;return;}
case 6979:cyc+=16;A=rd(49448);
if(cyc>=evt){pc=6982;return;}
case 6982:cyc+=8;add(16);
if(cyc>=evt){pc=6984;return;}
case 6984:cyc+=4;sub(B);
if(cyc>=evt){pc=6985;return;}
case 6985:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=6986;return;}
case 6986:cyc+=12;H=193;L=46;
if(cyc>=evt){pc=6989;return;}
case 6989:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=6990;return;}
case 6990:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=6991;return;}
case 6991:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6992;return;}
case 6992:cyc+=16;A=rd(49453);
if(cyc>=evt){pc=6995;return;}
case 6995:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=6996;return;}
case 6996:cyc+=4;A=inc(A);
if(cyc>=evt){pc=6997;return;}
case 6997:cyc+=16;wr(49453,A);
if(cyc>=evt){pc=7000;return;}
case 7000:cyc+=16;A=rd(49505);
if(cyc>=evt){pc=7003;return;}
case 7003:cyc+=8;or(32);
if(cyc>=evt){pc=7005;return;}
case 7005:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7006;return;}
case 7006:cyc+=4;A=B;
if(cyc>=evt){pc=7007;return;}
case 7007:cyc+=8;add(8);
if(cyc>=evt){pc=7009;return;}
case 7009:cyc+=4;B=A;
if(cyc>=evt){pc=7010;return;}
case 7010:cyc+=16;A=rd(49451);
if(cyc>=evt){pc=7013;return;}
case 7013:cyc+=4;cp(B);
if(cyc>=evt){pc=7014;return;}
case 7014:cyc+=8;if(!fz){cyc+=4;pc=6958;return;}
if(cyc>=evt){pc=7016;return;}
case 7016:cyc+=8;B=0;
if(cyc>=evt){pc=7018;return;}
case 7018:cyc+=4;A=C;
if(cyc>=evt){pc=7019;return;}
case 7019:cyc+=8;add(8);
if(cyc>=evt){pc=7021;return;}
case 7021:cyc+=4;C=A;
if(cyc>=evt){pc=7022;return;}
case 7022:cyc+=16;A=rd(49452);
if(cyc>=evt){pc=7025;return;}
case 7025:cyc+=4;cp(C);
if(cyc>=evt){pc=7026;return;}
case 7026:cyc+=8;if(!fz){cyc+=4;pc=6958;return;}
if(cyc>=evt){pc=7028;return;}
case 7028:cyc+=16;pc=6897;return;
case 7031:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=7032;return;}
case 7032:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=7033;return;}
case 7033:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=7034;return;}
case 7034:cyc+=4;A=dec(A);
if(cyc>=evt){pc=7035;return;}
case 7035:cyc+=4;E=A;
if(cyc>=evt){pc=7036;return;}
case 7036:cyc+=16;A=rd(49469);
if(cyc>=evt){pc=7039;return;}
case 7039:cyc+=4;L=A;
if(cyc>=evt){pc=7040;return;}
case 7040:cyc+=16;A=rd(49470);
if(cyc>=evt){pc=7043;return;}
case 7043:cyc+=4;H=A;
if(cyc>=evt){pc=7044;return;}
case 7044:cyc+=24;push(7047);pc=8210;return;
if(cyc>=evt){pc=7047;return;}
case 7047:cyc+=16;A=rd(49445);
if(cyc>=evt){pc=7050;return;}
case 7050:cyc+=8;sub(95);
if(cyc>=evt){pc=7052;return;}
case 7052:cyc+=4;E=A;
if(cyc>=evt){pc=7053;return;}
case 7053:cyc+=8;D=0;
if(cyc>=evt){pc=7055;return;}
case 7055:cyc+=8;E=sla(E);
if(cyc>=evt){pc=7057;return;}
case 7057:cyc+=8;D=rl(D);
if(cyc>=evt){pc=7059;return;}
case 7059:cyc+=8;E=sla(E);
if(cyc>=evt){pc=7061;return;}
case 7061:cyc+=8;D=rl(D);
if(cyc>=evt){pc=7063;return;}
case 7063:cyc+=8;E=sla(E);
if(cyc>=evt){pc=7065;return;}
case 7065:cyc+=8;D=rl(D);
if(cyc>=evt){pc=7067;return;}
case 7067:cyc+=8;E=sla(E);
if(cyc>=evt){pc=7069;return;}
case 7069:cyc+=8;D=rl(D);
if(cyc>=evt){pc=7071;return;}
case 7071:cyc+=8;A=0;
if(cyc>=evt){pc=7073;return;}
case 7073:cyc+=4;add(E);
if(cyc>=evt){pc=7074;return;}
case 7074:cyc+=4;E=A;
if(cyc>=evt){pc=7075;return;}
case 7075:cyc+=8;A=194;
if(cyc>=evt){pc=7077;return;}
case 7077:cyc+=4;adc(D);
if(cyc>=evt){pc=7078;return;}
case 7078:cyc+=4;D=A;
if(cyc>=evt){pc=7079;return;}
case 7079:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7080;return;}
case 7080:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7081;return;}
case 7081:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7082;return;}
case 7082:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7083;return;}
case 7083:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7084;return;}
case 7084:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7085;return;}
case 7085:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7086;return;}
case 7086:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7087;return;}
case 7087:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7088;return;}
case 7088:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7089;return;}
case 7089:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7090;return;}
case 7090:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7091;return;}
case 7091:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7092;return;}
case 7092:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7093;return;}
case 7093:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7094;return;}
case 7094:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7095;return;}
case 7095:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7096;return;}
case 7096:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7097;return;}
case 7097:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7098;return;}
case 7098:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7099;return;}
case 7099:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7100;return;}
case 7100:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7101;return;}
case 7101:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7102;return;}
case 7102:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7103;return;}
case 7103:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7104;return;}
case 7104:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7105;return;}
case 7105:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7106;return;}
case 7106:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7107;return;}
case 7107:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7108;return;}
case 7108:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7109;return;}
case 7109:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7110;return;}
case 7110:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7111;return;}
case 7111:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7112;return;}
case 7112:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7113;return;}
case 7113:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7114;return;}
case 7114:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7115;return;}
case 7115:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7116;return;}
case 7116:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7117;return;}
case 7117:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7118;return;}
case 7118:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7119;return;}
case 7119:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7120;return;}
case 7120:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7121;return;}
case 7121:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7122;return;}
case 7122:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7123;return;}
case 7123:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7124;return;}
case 7124:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7125;return;}
case 7125:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7126;return;}
case 7126:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7127;return;}
case 7127:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7128;return;}
case 7128:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7129;return;}
case 7129:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7130;return;}
case 7130:cyc+=16;pc=pop();return;
case 7131:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=7132;return;}
case 7132:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=7133;return;}
case 7133:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=7134;return;}
case 7134:cyc+=4;A=dec(A);
if(cyc>=evt){pc=7135;return;}
case 7135:cyc+=4;E=A;
if(cyc>=evt){pc=7136;return;}
case 7136:cyc+=16;A=rd(49471);
if(cyc>=evt){pc=7139;return;}
case 7139:cyc+=4;L=A;
if(cyc>=evt){pc=7140;return;}
case 7140:cyc+=16;A=rd(49472);
if(cyc>=evt){pc=7143;return;}
case 7143:cyc+=4;H=A;
if(cyc>=evt){pc=7144;return;}
case 7144:cyc+=24;push(7147);pc=8210;return;
if(cyc>=evt){pc=7147;return;}
case 7147:cyc+=16;A=rd(49453);
if(cyc>=evt){pc=7150;return;}
case 7150:cyc+=8;sub(95);
if(cyc>=evt){pc=7152;return;}
case 7152:cyc+=4;E=A;
if(cyc>=evt){pc=7153;return;}
case 7153:cyc+=8;D=0;
if(cyc>=evt){pc=7155;return;}
case 7155:cyc+=8;E=sla(E);
if(cyc>=evt){pc=7157;return;}
case 7157:cyc+=8;D=rl(D);
if(cyc>=evt){pc=7159;return;}
case 7159:cyc+=8;E=sla(E);
if(cyc>=evt){pc=7161;return;}
case 7161:cyc+=8;D=rl(D);
if(cyc>=evt){pc=7163;return;}
case 7163:cyc+=8;E=sla(E);
if(cyc>=evt){pc=7165;return;}
case 7165:cyc+=8;D=rl(D);
if(cyc>=evt){pc=7167;return;}
case 7167:cyc+=8;E=sla(E);
if(cyc>=evt){pc=7169;return;}
case 7169:cyc+=8;D=rl(D);
if(cyc>=evt){pc=7171;return;}
case 7171:cyc+=8;A=0;
if(cyc>=evt){pc=7173;return;}
case 7173:cyc+=4;add(E);
if(cyc>=evt){pc=7174;return;}
case 7174:cyc+=4;E=A;
if(cyc>=evt){pc=7175;return;}
case 7175:cyc+=8;A=194;
if(cyc>=evt){pc=7177;return;}
case 7177:cyc+=4;adc(D);
if(cyc>=evt){pc=7178;return;}
case 7178:cyc+=4;D=A;
if(cyc>=evt){pc=7179;return;}
case 7179:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=7180;return;}
case 7180:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7181;return;}
case 7181:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7182;return;}
case 7182:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7183;return;}
case 7183:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7184;return;}
case 7184:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7185;return;}
case 7185:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7186;return;}
case 7186:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7187;return;}
case 7187:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7188;return;}
case 7188:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7189;return;}
case 7189:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7190;return;}
case 7190:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7191;return;}
case 7191:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7192;return;}
case 7192:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7193;return;}
case 7193:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7194;return;}
case 7194:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7195;return;}
case 7195:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7196;return;}
case 7196:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7197;return;}
case 7197:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7198;return;}
case 7198:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
pc=7199;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 7199:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7200;return;}
case 7200:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7201;return;}
case 7201:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7202;return;}
case 7202:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7203;return;}
case 7203:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7204;return;}
case 7204:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7205;return;}
case 7205:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7206;return;}
case 7206:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7207;return;}
case 7207:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7208;return;}
case 7208:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7209;return;}
case 7209:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7210;return;}
case 7210:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7211;return;}
case 7211:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7212;return;}
case 7212:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7213;return;}
case 7213:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7214;return;}
case 7214:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7215;return;}
case 7215:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7216;return;}
case 7216:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7217;return;}
case 7217:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7218;return;}
case 7218:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7219;return;}
case 7219:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7220;return;}
case 7220:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7221;return;}
case 7221:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7222;return;}
case 7222:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7223;return;}
case 7223:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7224;return;}
case 7224:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7225;return;}
case 7225:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7226;return;}
case 7226:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=7227;return;}
case 7227:cyc+=4;E=inc(E);
if(cyc>=evt){pc=7228;return;}
case 7228:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7229;return;}
case 7229:cyc+=4;xor(A);
if(cyc>=evt){pc=7230;return;}
case 7230:cyc+=16;wr(49591,A);
if(cyc>=evt){pc=7233;return;}
case 7233:cyc+=12;B=0;C=3;
if(cyc>=evt){pc=7236;return;}
case 7236:cyc+=24;push(7239);pc=13485;return;
if(cyc>=evt){pc=7239;return;}
case 7239:cyc+=8;cp(5);
if(cyc>=evt){pc=7241;return;}
case 7241:cyc+=12;if(fz){cyc+=12;push(7244);pc=14846;return;}
if(cyc>=evt){pc=7244;return;}
case 7244:cyc+=12;B=6;C=1;
if(cyc>=evt){pc=7247;return;}
case 7247:cyc+=24;push(7250);pc=14894;return;
if(cyc>=evt){pc=7250;return;}
case 7250:cyc+=12;if(fz){cyc+=12;push(7253);pc=14846;return;}
if(cyc>=evt){pc=7253;return;}
case 7253:cyc+=12;B=5;C=24;
if(cyc>=evt){pc=7256;return;}
case 7256:cyc+=24;push(7259);pc=14894;return;
if(cyc>=evt){pc=7259;return;}
case 7259:cyc+=12;if(fz){cyc+=12;push(7262);pc=14846;return;}
if(cyc>=evt){pc=7262;return;}
case 7262:cyc+=12;B=12;C=15;
if(cyc>=evt){pc=7265;return;}
case 7265:cyc+=24;push(7268);pc=14894;return;
if(cyc>=evt){pc=7268;return;}
case 7268:cyc+=12;if(fz){cyc+=12;push(7271);pc=14846;return;}
if(cyc>=evt){pc=7271;return;}
case 7271:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7272;return;}
case 7272:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7273;return;}
case 7273:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7274;return;}
case 7274:cyc+=16;pc=pop();return;
case 7275:cyc+=8;A=30;
if(cyc>=evt){pc=7277;return;}
case 7277:cyc+=12;wr(65351,A);
if(cyc>=evt){pc=7279;return;}
case 7279:cyc+=12;wr(65352,A);
if(cyc>=evt){pc=7281;return;}
case 7281:cyc+=8;A=156;
if(cyc>=evt){pc=7283;return;}
case 7283:cyc+=12;wr(65353,A);
if(cyc>=evt){pc=7285;return;}
case 7285:cyc+=16;A=rd(8192);
if(cyc>=evt){pc=7288;return;}
case 7288:cyc+=16;pushaf();
if(cyc>=evt){pc=7289;return;}
case 7289:cyc+=16;A=rd(49483);
if(cyc>=evt){pc=7292;return;}
case 7292:cyc+=8;cp(4);
if(cyc>=evt){pc=7294;return;}
case 7294:cyc+=8;if(fc){cyc+=4;pc=7329;return;}
if(cyc>=evt){pc=7296;return;}
case 7296:cyc+=8;cp(6);
if(cyc>=evt){pc=7298;return;}
case 7298:cyc+=12;H=83;L=127;
if(cyc>=evt){pc=7301;return;}
case 7301:cyc+=8;cp(6);
if(cyc>=evt){pc=7303;return;}
case 7303:cyc+=8;if(fz){cyc+=4;pc=7322;return;}
if(cyc>=evt){pc=7305;return;}
case 7305:cyc+=12;H=107;L=150;
if(cyc>=evt){pc=7308;return;}
case 7308:cyc+=8;cp(4);
if(cyc>=evt){pc=7310;return;}
case 7310:cyc+=8;if(fz){cyc+=4;pc=7322;return;}
if(cyc>=evt){pc=7312;return;}
case 7312:cyc+=8;A=10;
if(cyc>=evt){pc=7314;return;}
case 7314:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7317;return;}
case 7317:cyc+=12;H=82;L=92;
if(cyc>=evt){pc=7320;return;}
case 7320:cyc+=12;pc=7358;return;
case 7322:cyc+=8;A=4;
if(cyc>=evt){pc=7324;return;}
case 7324:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7327;return;}
case 7327:cyc+=12;pc=7358;return;
case 7329:cyc+=8;A=7;
if(cyc>=evt){pc=7331;return;}
case 7331:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7334;return;}
case 7334:cyc+=12;H=92;L=101;
if(cyc>=evt){pc=7337;return;}
case 7337:cyc+=16;A=rd(49482);
if(cyc>=evt){pc=7340;return;}
case 7340:cyc+=8;A=sla(A);
if(cyc>=evt){pc=7342;return;}
case 7342:cyc+=4;add(L);
if(cyc>=evt){pc=7343;return;}
case 7343:cyc+=4;L=A;
if(cyc>=evt){pc=7344;return;}
case 7344:cyc+=8;if(!fc){cyc+=4;pc=7347;return;}
if(cyc>=evt){pc=7346;return;}
case 7346:cyc+=4;H=inc(H);
if(cyc>=evt){pc=7347;return;}
case 7347:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7348;return;}
case 7348:cyc+=16;pushaf();
if(cyc>=evt){pc=7349;return;}
case 7349:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=7350;return;}
case 7350:cyc+=4;H=A;
if(cyc>=evt){pc=7351;return;}
case 7351:cyc+=12;popaf();
if(cyc>=evt){pc=7352;return;}
case 7352:cyc+=4;L=A;
if(cyc>=evt){pc=7353;return;}
case 7353:cyc+=8;A=2;
if(cyc>=evt){pc=7355;return;}
case 7355:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7358;return;}
case 7358:cyc+=24;push(7361);pc=7470;return;
if(cyc>=evt){pc=7361;return;}
case 7361:cyc+=8;A=7;
if(cyc>=evt){pc=7363;return;}
case 7363:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7366;return;}
case 7366:cyc+=12;H=92;L=139;
if(cyc>=evt){pc=7369;return;}
case 7369:cyc+=16;A=rd(49482);
if(cyc>=evt){pc=7372;return;}
case 7372:cyc+=8;A=sla(A);
if(cyc>=evt){pc=7374;return;}
case 7374:cyc+=4;add(L);
if(cyc>=evt){pc=7375;return;}
case 7375:cyc+=4;L=A;
if(cyc>=evt){pc=7376;return;}
case 7376:cyc+=8;if(!fc){cyc+=4;pc=7379;return;}
if(cyc>=evt){pc=7378;return;}
case 7378:cyc+=4;H=inc(H);
if(cyc>=evt){pc=7379;return;}
case 7379:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7380;return;}
case 7380:cyc+=16;pushaf();
if(cyc>=evt){pc=7381;return;}
case 7381:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=7382;return;}
case 7382:cyc+=4;H=A;
if(cyc>=evt){pc=7383;return;}
case 7383:cyc+=12;popaf();
if(cyc>=evt){pc=7384;return;}
case 7384:cyc+=4;L=A;
if(cyc>=evt){pc=7385;return;}
case 7385:cyc+=8;A=2;
if(cyc>=evt){pc=7387;return;}
case 7387:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7390;return;}
case 7390:cyc+=24;push(7393);pc=7497;return;
if(cyc>=evt){pc=7393;return;}
case 7393:cyc+=12;popaf();
if(cyc>=evt){pc=7394;return;}
case 7394:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7397;return;}
case 7397:cyc+=16;pc=pop();return;
case 7398:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=7399;return;}
case 7399:cyc+=8;A=0;
if(cyc>=evt){pc=7401;return;}
case 7401:cyc+=12;wr(65351,A);
if(cyc>=evt){pc=7403;return;}
case 7403:cyc+=12;wr(65352,A);
if(cyc>=evt){pc=7405;return;}
case 7405:cyc+=12;wr(65353,A);
if(cyc>=evt){pc=7407;return;}
case 7407:cyc+=16;A=rd(8192);
if(cyc>=evt){pc=7410;return;}
case 7410:cyc+=16;pushaf();
if(cyc>=evt){pc=7411;return;}
case 7411:cyc+=8;A=1;
if(cyc>=evt){pc=7413;return;}
case 7413:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7416;return;}
case 7416:cyc+=12;H=123;L=32;
if(cyc>=evt){pc=7419;return;}
case 7419:cyc+=24;push(7422);pc=7470;return;
if(cyc>=evt){pc=7422;return;}
case 7422:cyc+=12;H=123;L=32;
if(cyc>=evt){pc=7425;return;}
case 7425:cyc+=24;push(7428);pc=7497;return;
if(cyc>=evt){pc=7428;return;}
case 7428:cyc+=12;popaf();
if(cyc>=evt){pc=7429;return;}
case 7429:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7432;return;}
case 7432:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7433;return;}
case 7433:cyc+=16;pc=pop();return;
case 7434:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=7435;return;}
case 7435:cyc+=8;A=255;
if(cyc>=evt){pc=7437;return;}
case 7437:cyc+=12;wr(65351,A);
if(cyc>=evt){pc=7439;return;}
case 7439:cyc+=12;wr(65352,A);
if(cyc>=evt){pc=7441;return;}
case 7441:cyc+=12;wr(65353,A);
if(cyc>=evt){pc=7443;return;}
case 7443:cyc+=16;A=rd(8192);
if(cyc>=evt){pc=7446;return;}
case 7446:cyc+=16;pushaf();
if(cyc>=evt){pc=7447;return;}
case 7447:cyc+=8;A=1;
if(cyc>=evt){pc=7449;return;}
case 7449:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7452;return;}
case 7452:cyc+=12;H=122;L=224;
if(cyc>=evt){pc=7455;return;}
case 7455:cyc+=24;push(7458);pc=7470;return;
if(cyc>=evt){pc=7458;return;}
case 7458:cyc+=12;H=122;L=224;
if(cyc>=evt){pc=7461;return;}
case 7461:cyc+=24;push(7464);pc=7497;return;
if(cyc>=evt){pc=7464;return;}
case 7464:cyc+=12;popaf();
if(cyc>=evt){pc=7465;return;}
case 7465:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7468;return;}
case 7468:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7469;return;}
case 7469:cyc+=16;pc=pop();return;
case 7470:cyc+=8;C=0;
if(cyc>=evt){pc=7472;return;}
case 7472:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=7474;return;}
case 7474:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=7476;return;}
case 7476:cyc+=8;if(!fz){cyc+=4;pc=7472;return;}
if(cyc>=evt){pc=7478;return;}
case 7478:cyc+=4;A=C;
if(cyc>=evt){pc=7479;return;}
case 7479:cyc+=12;wr(65384,A);
if(cyc>=evt){pc=7481;return;}
case 7481:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=7482;return;}
case 7482:cyc+=12;wr(65385,A);
if(cyc>=evt){pc=7484;return;}
case 7484:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=7486;return;}
case 7486:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=7488;return;}
case 7488:cyc+=8;if(!fz){cyc+=4;pc=7472;return;}
if(cyc>=evt){pc=7490;return;}
case 7490:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=7491;return;}
case 7491:cyc+=4;C=inc(C);
if(cyc>=evt){pc=7492;return;}
case 7492:cyc+=8;fz=(C>>6)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=7494;return;}
case 7494:cyc+=8;if(fz){cyc+=4;pc=7472;return;}
if(cyc>=evt){pc=7496;return;}
case 7496:cyc+=16;pc=pop();return;
case 7497:cyc+=8;C=0;
if(cyc>=evt){pc=7499;return;}
case 7499:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=7501;return;}
case 7501:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=7503;return;}
case 7503:cyc+=8;if(!fz){cyc+=4;pc=7499;return;}
if(cyc>=evt){pc=7505;return;}
case 7505:cyc+=4;A=C;
if(cyc>=evt){pc=7506;return;}
case 7506:cyc+=12;wr(65386,A);
if(cyc>=evt){pc=7508;return;}
case 7508:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=7509;return;}
case 7509:cyc+=12;wr(65387,A);
if(cyc>=evt){pc=7511;return;}
case 7511:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=7513;return;}
case 7513:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=7515;return;}
case 7515:cyc+=8;if(!fz){cyc+=4;pc=7499;return;}
if(cyc>=evt){pc=7517;return;}
case 7517:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=7518;return;}
case 7518:cyc+=4;C=inc(C);
if(cyc>=evt){pc=7519;return;}
case 7519:cyc+=8;fz=(C>>6)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=7521;return;}
case 7521:cyc+=8;if(fz){cyc+=4;pc=7499;return;}
if(cyc>=evt){pc=7523;return;}
case 7523:cyc+=16;pc=pop();return;
case 7524:cyc+=8;B=160;
if(cyc>=evt){pc=7526;return;}
case 7526:cyc+=12;H=192;L=0;
if(cyc>=evt){pc=7529;return;}
case 7529:cyc+=4;xor(A);
if(cyc>=evt){pc=7530;return;}
case 7530:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7531;return;}
case 7531:cyc+=4;B=dec(B);
if(cyc>=evt){pc=7532;return;}
case 7532:cyc+=8;if(!fz){cyc+=4;pc=7530;return;}
if(cyc>=evt){pc=7534;return;}
case 7534:cyc+=16;pc=pop();return;
case 7535:cyc+=4;xor(A);
if(cyc>=evt){pc=7536;return;}
case 7536:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7537;return;}
case 7537:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7538;return;}
case 7538:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7539;return;}
case 7539:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7540;return;}
case 7540:cyc+=4;B=dec(B);
if(cyc>=evt){pc=7541;return;}
case 7541:cyc+=8;if(!fz){cyc+=4;pc=7536;return;}
if(cyc>=evt){pc=7543;return;}
case 7543:cyc+=16;pc=pop();return;
case 7544:cyc+=4;E=A;
if(cyc>=evt){pc=7545;return;}
case 7545:cyc+=8;D=0;
if(cyc>=evt){pc=7547;return;}
case 7547:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=7548;return;}
case 7548:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=7549;return;}
case 7549:cyc+=8;B=0;
if(cyc>=evt){pc=7551;return;}
case 7551:cyc+=24;push(7554);pc=7575;return;
if(cyc>=evt){pc=7554;return;}
case 7554:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7555;return;}
case 7555:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7556;return;}
case 7556:cyc+=4;xor(A);
if(cyc>=evt){pc=7557;return;}
case 7557:cyc+=4;or(B);
if(cyc>=evt){pc=7558;return;}
case 7558:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=7559;return;}
case 7559:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=7560;return;}
case 7560:cyc+=4;C=B;
if(cyc>=evt){pc=7561;return;}
case 7561:cyc+=8;B=0;
if(cyc>=evt){pc=7563;return;}
case 7563:cyc+=24;push(7566);pc=7575;return;
if(cyc>=evt){pc=7566;return;}
case 7566:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7567;return;}
case 7567:cyc+=4;C=D;
if(cyc>=evt){pc=7568;return;}
case 7568:cyc+=8;B=0;
if(cyc>=evt){pc=7570;return;}
case 7570:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=7571;return;}
case 7571:cyc+=4;A=H;
if(cyc>=evt){pc=7572;return;}
case 7572:cyc+=4;H=L;
if(cyc>=evt){pc=7573;return;}
case 7573:cyc+=4;L=E;
if(cyc>=evt){pc=7574;return;}
case 7574:cyc+=16;pc=pop();return;
case 7575:cyc+=8;A=8;
if(cyc>=evt){pc=7577;return;}
case 7577:cyc+=12;H=0;L=0;
if(cyc>=evt){pc=7580;return;}
case 7580:cyc+=8;C=srl(C);
if(cyc>=evt){pc=7582;return;}
case 7582:cyc+=8;if(!fc){cyc+=4;pc=7585;return;}
pc=7584;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 7584:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=7585;return;}
case 7585:cyc+=8;E=sla(E);
if(cyc>=evt){pc=7587;return;}
case 7587:cyc+=8;D=rl(D);
if(cyc>=evt){pc=7589;return;}
case 7589:cyc+=4;A=dec(A);
if(cyc>=evt){pc=7590;return;}
case 7590:cyc+=8;if(!fz){cyc+=4;pc=7580;return;}
if(cyc>=evt){pc=7592;return;}
case 7592:cyc+=16;pc=pop();return;
case 7593:cyc+=4;E=A;
if(cyc>=evt){pc=7594;return;}
case 7594:cyc+=8;D=8;
if(cyc>=evt){pc=7596;return;}
case 7596:cyc+=8;addhl((H<<8|L));
if(cyc>=evt){pc=7597;return;}
case 7597:cyc+=4;A=H;
if(cyc>=evt){pc=7598;return;}
case 7598:cyc+=4;sub(E);
if(cyc>=evt){pc=7599;return;}
case 7599:cyc+=8;if(fc){cyc+=4;pc=7603;return;}
if(cyc>=evt){pc=7601;return;}
case 7601:cyc+=4;H=A;
if(cyc>=evt){pc=7602;return;}
case 7602:cyc+=4;L=inc(L);
if(cyc>=evt){pc=7603;return;}
case 7603:cyc+=4;D=dec(D);
if(cyc>=evt){pc=7604;return;}
case 7604:cyc+=8;if(!fz){cyc+=4;pc=7596;return;}
if(cyc>=evt){pc=7606;return;}
case 7606:cyc+=16;pc=pop();return;
case 7618:cyc+=16;A=rd(49410);
if(cyc>=evt){pc=7621;return;}
case 7621:cyc+=8;xor(85);
if(cyc>=evt){pc=7623;return;}
case 7623:cyc+=8;A=sla(A);
if(cyc>=evt){pc=7625;return;}
case 7625:cyc+=8;adc(13);
if(cyc>=evt){pc=7627;return;}
case 7627:cyc+=8;xor(233);
if(cyc>=evt){pc=7629;return;}
case 7629:cyc+=8;A=sla(A);
if(cyc>=evt){pc=7631;return;}
case 7631:cyc+=8;adc(19);
if(cyc>=evt){pc=7633;return;}
case 7633:cyc+=8;xor(34);
if(cyc>=evt){pc=7635;return;}
case 7635:cyc+=8;A=sla(A);
if(cyc>=evt){pc=7637;return;}
case 7637:cyc+=8;adc(23);
if(cyc>=evt){pc=7639;return;}
case 7639:cyc+=16;pc=pop();return;
case 7640:cyc+=4;A=L;
if(cyc>=evt){pc=7641;return;}
case 7641:cyc+=8;and(31);
if(cyc>=evt){pc=7643;return;}
case 7643:cyc+=16;wr(49624,A);
if(cyc>=evt){pc=7646;return;}
case 7646:cyc+=8;A=4;
if(cyc>=evt){pc=7648;return;}
case 7648:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7651;return;}
case 7651:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=7652;return;}
case 7652:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=7653;return;}
case 7653:cyc+=24;push(7656);pc=7668;return;
if(cyc>=evt){pc=7656;return;}
case 7656:cyc+=8;and(192);
if(cyc>=evt){pc=7658;return;}
case 7658:cyc+=8;cp(192);
if(cyc>=evt){pc=7660;return;}
case 7660:cyc+=8;if(!fz){cyc+=4;pc=7651;return;}
if(cyc>=evt){pc=7662;return;}
case 7662:cyc+=8;A=1;
if(cyc>=evt){pc=7664;return;}
case 7664:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7667;return;}
case 7667:cyc+=16;pc=pop();return;
case 7668:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=7669;return;}
case 7669:cyc+=8;sub(32);
if(cyc>=evt){pc=7671;return;}
case 7671:cyc+=4;C=A;
if(cyc>=evt){pc=7672;return;}
case 7672:cyc+=8;and(63);
if(cyc>=evt){pc=7674;return;}
case 7674:cyc+=24;push(7677);pc=7712;return;
if(cyc>=evt){pc=7677;return;}
case 7677:cyc+=4;A=C;
if(cyc>=evt){pc=7678;return;}
case 7678:cyc+=8;fz=(A>>6)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=7680;return;}
case 7680:cyc+=8;if(fz){cyc+=4;pc=7699;return;}
if(cyc>=evt){pc=7682;return;}
case 7682:cyc+=4;A=L;
if(cyc>=evt){pc=7683;return;}
case 7683:cyc+=8;add(32);
if(cyc>=evt){pc=7685;return;}
case 7685:cyc+=8;if(!fc){cyc+=4;pc=7688;return;}
if(cyc>=evt){pc=7687;return;}
case 7687:cyc+=4;H=inc(H);
if(cyc>=evt){pc=7688;return;}
case 7688:cyc+=8;and(224);
if(cyc>=evt){pc=7690;return;}
case 7690:cyc+=4;L=A;
if(cyc>=evt){pc=7691;return;}
case 7691:cyc+=16;A=rd(49624);
if(cyc>=evt){pc=7694;return;}
case 7694:cyc+=4;or(L);
if(cyc>=evt){pc=7695;return;}
case 7695:cyc+=4;L=A;
if(cyc>=evt){pc=7696;return;}
case 7696:cyc+=4;A=C;
if(cyc>=evt){pc=7697;return;}
case 7697:cyc+=12;pc=7709;return;
case 7699:cyc+=4;A=C;
if(cyc>=evt){pc=7700;return;}
case 7700:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=7702;return;}
case 7702:cyc+=8;if(fz){cyc+=4;pc=7709;return;}
if(cyc>=evt){pc=7704;return;}
case 7704:cyc+=8;A=0;
if(cyc>=evt){pc=7706;return;}
case 7706:cyc+=24;push(7709);pc=7712;return;
if(cyc>=evt){pc=7709;return;}
case 7709:cyc+=4;A=C;
if(cyc>=evt){pc=7710;return;}
case 7710:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7711;return;}
case 7711:cyc+=16;pc=pop();return;
case 7712:cyc+=16;pushaf();
if(cyc>=evt){pc=7713;return;}
case 7713:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=7715;return;}
case 7715:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=7717;return;}
case 7717:cyc+=8;if(!fz){cyc+=4;pc=7713;return;}
if(cyc>=evt){pc=7719;return;}
case 7719:cyc+=12;popaf();
if(cyc>=evt){pc=7720;return;}
case 7720:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7721;return;}
case 7721:cyc+=16;pc=pop();return;
case 7722:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=7723;return;}
case 7723:cyc+=8;A=4;
if(cyc>=evt){pc=7725;return;}
case 7725:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7728;return;}
case 7728:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=7731;return;}
case 7731:cyc+=8;cp(17);
if(cyc>=evt){pc=7733;return;}
case 7733:cyc+=8;if(fz){cyc+=4;pc=7764;return;}
if(cyc>=evt){pc=7735;return;}
case 7735:cyc+=12;H=100;L=14;
if(cyc>=evt){pc=7738;return;}
case 7738:cyc+=24;push(7741);pc=8129;return;
if(cyc>=evt){pc=7741;return;}
case 7741:cyc+=12;D=128;E=0;
if(cyc>=evt){pc=7744;return;}
case 7744:cyc+=24;push(7747);pc=4858;return;
if(cyc>=evt){pc=7747;return;}
case 7747:cyc+=12;H=208;L=0;
if(cyc>=evt){pc=7750;return;}
case 7750:cyc+=12;D=144;E=0;
if(cyc>=evt){pc=7753;return;}
case 7753:cyc+=12;B=8;C=0;
if(cyc>=evt){pc=7756;return;}
case 7756:cyc+=24;push(7759);pc=4858;return;
if(cyc>=evt){pc=7759;return;}
case 7759:cyc+=12;D=98;E=166;
if(cyc>=evt){pc=7762;return;}
case 7762:cyc+=12;pc=7812;return;
case 7764:cyc+=12;H=107;L=214;
if(cyc>=evt){pc=7767;return;}
case 7767:cyc+=24;push(7770);pc=8129;return;
if(cyc>=evt){pc=7770;return;}
case 7770:cyc+=12;D=128;E=0;
if(cyc>=evt){pc=7773;return;}
case 7773:cyc+=24;push(7776);pc=4858;return;
if(cyc>=evt){pc=7776;return;}
case 7776:cyc+=12;H=208;L=0;
if(cyc>=evt){pc=7779;return;}
case 7779:cyc+=12;D=144;E=0;
if(cyc>=evt){pc=7782;return;}
case 7782:cyc+=12;B=8;C=0;
if(cyc>=evt){pc=7785;return;}
case 7785:cyc+=24;push(7788);pc=4858;return;
if(cyc>=evt){pc=7788;return;}
case 7788:cyc+=8;A=1;
if(cyc>=evt){pc=7790;return;}
case 7790:cyc+=12;wr(65359,A);
if(cyc>=evt){pc=7792;return;}
case 7792:cyc+=4;
if(cyc>=evt){pc=7793;return;}
case 7793:cyc+=12;H=152;L=0;
if(cyc>=evt){pc=7796;return;}
case 7796:cyc+=12;D=106;E=46;
if(cyc>=evt){pc=7799;return;}
case 7799:cyc+=12;B=20;C=18;
if(cyc>=evt){pc=7802;return;}
case 7802:cyc+=24;push(7805);pc=4922;return;
if(cyc>=evt){pc=7805;return;}
case 7805:cyc+=4;xor(A);
if(cyc>=evt){pc=7806;return;}
case 7806:cyc+=12;wr(65359,A);
if(cyc>=evt){pc=7808;return;}
case 7808:cyc+=4;
if(cyc>=evt){pc=7809;return;}
case 7809:cyc+=12;D=104;E=118;
if(cyc>=evt){pc=7812;return;}
case 7812:cyc+=12;H=152;L=0;
if(cyc>=evt){pc=7815;return;}
case 7815:cyc+=12;B=20;C=18;
if(cyc>=evt){pc=7818;return;}
case 7818:cyc+=24;push(7821);pc=4922;return;
if(cyc>=evt){pc=7821;return;}
case 7821:cyc+=8;A=4;
if(cyc>=evt){pc=7823;return;}
case 7823:cyc+=16;wr(49483,A);
if(cyc>=evt){pc=7826;return;}
case 7826:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7827;return;}
case 7827:cyc+=8;B=0;
if(cyc>=evt){pc=7829;return;}
case 7829:cyc+=8;A=10;
if(cyc>=evt){pc=7831;return;}
case 7831:cyc+=24;push(7834);pc=7544;return;
if(cyc>=evt){pc=7834;return;}
case 7834:cyc+=12;B=111;C=238;
if(cyc>=evt){pc=7837;return;}
case 7837:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=7838;return;}
case 7838:cyc+=16;A=rd(49623);
if(cyc>=evt){pc=7841;return;}
case 7841:cyc+=8;A=sla(A);
if(cyc>=evt){pc=7843;return;}
case 7843:cyc+=4;add(L);
if(cyc>=evt){pc=7844;return;}
case 7844:cyc+=4;L=A;
if(cyc>=evt){pc=7845;return;}
case 7845:cyc+=8;if(!fc){cyc+=4;pc=7848;return;}
if(cyc>=evt){pc=7847;return;}
case 7847:cyc+=4;H=inc(H);
if(cyc>=evt){pc=7848;return;}
case 7848:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7849;return;}
case 7849:cyc+=4;E=A;
if(cyc>=evt){pc=7850;return;}
case 7850:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7851;return;}
case 7851:cyc+=4;D=A;
if(cyc>=evt){pc=7852;return;}
case 7852:cyc+=12;H=152;L=33;
if(cyc>=evt){pc=7855;return;}
case 7855:cyc+=24;push(7858);pc=7640;return;
if(cyc>=evt){pc=7858;return;}
case 7858:cyc+=8;A=1;
if(cyc>=evt){pc=7860;return;}
case 7860:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=7863;return;}
case 7863:cyc+=16;pc=pop();return;
case 7864:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=7865;return;}
case 7865:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=7866;return;}
case 7866:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=7868;return;}
case 7868:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=7870;return;}
case 7870:cyc+=8;if(!fz){cyc+=4;pc=7866;return;}
if(cyc>=evt){pc=7872;return;}
case 7872:cyc+=4;xor(A);
if(cyc>=evt){pc=7873;return;}
case 7873:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=7874;return;}
case 7874:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=7876;return;}
case 7876:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=7878;return;}
case 7878:cyc+=8;if(!fz){cyc+=4;pc=7866;return;}
if(cyc>=evt){pc=7880;return;}
case 7880:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=7881;return;}
case 7881:cyc+=4;B=dec(B);
if(cyc>=evt){pc=7882;return;}
case 7882:cyc+=8;if(!fz){cyc+=4;pc=7866;return;}
if(cyc>=evt){pc=7884;return;}
case 7884:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7885;return;}
case 7885:cyc+=12;B=0;C=32;
if(cyc>=evt){pc=7888;return;}
case 7888:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=7889;return;}
case 7889:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7890;return;}
case 7890:cyc+=4;C=dec(C);
if(cyc>=evt){pc=7891;return;}
case 7891:cyc+=8;if(!fz){cyc+=4;pc=7864;return;}
if(cyc>=evt){pc=7893;return;}
case 7893:cyc+=16;pc=pop();return;
case 7894:cyc+=12;H=154;L=128;
if(cyc>=evt){pc=7897;return;}
case 7897:cyc+=12;B=20;C=3;
if(cyc>=evt){pc=7900;return;}
case 7900:cyc+=24;push(7903);pc=7864;return;
if(cyc>=evt){pc=7903;return;}
case 7903:cyc+=16;pc=pop();return;
case 7904:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=7905;return;}
case 7905:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=7906;return;}
case 7906:cyc+=4;C=A;
if(cyc>=evt){pc=7907;return;}
case 7907:cyc+=8;A=1;
if(cyc>=evt){pc=7909;return;}
case 7909:cyc+=12;wr(65359,A);
if(cyc>=evt){pc=7911;return;}
case 7911:cyc+=4;
if(cyc>=evt){pc=7912;return;}
case 7912:cyc+=12;H=154;L=128;
if(cyc>=evt){pc=7915;return;}
case 7915:cyc+=8;B=96;
if(cyc>=evt){pc=7917;return;}
case 7917:cyc+=4;A=C;
if(cyc>=evt){pc=7918;return;}
case 7918:cyc+=16;pushaf();
if(cyc>=evt){pc=7919;return;}
case 7919:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=7921;return;}
case 7921:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=7923;return;}
case 7923:cyc+=8;if(!fz){cyc+=4;pc=7919;return;}
if(cyc>=evt){pc=7925;return;}
case 7925:cyc+=12;popaf();
if(cyc>=evt){pc=7926;return;}
case 7926:cyc+=16;pushaf();
if(cyc>=evt){pc=7927;return;}
case 7927:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=7928;return;}
case 7928:cyc+=12;A=rd(65345);
if(cyc>=evt){pc=7930;return;}
case 7930:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=7932;return;}
case 7932:cyc+=8;if(!fz){cyc+=4;pc=7919;return;}
if(cyc>=evt){pc=7934;return;}
case 7934:cyc+=12;popaf();
if(cyc>=evt){pc=7935;return;}
case 7935:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=7936;return;}
case 7936:cyc+=4;B=dec(B);
if(cyc>=evt){pc=7937;return;}
case 7937:cyc+=8;if(!fz){cyc+=4;pc=7918;return;}
if(cyc>=evt){pc=7939;return;}
case 7939:cyc+=4;xor(A);
if(cyc>=evt){pc=7940;return;}
case 7940:cyc+=12;wr(65359,A);
if(cyc>=evt){pc=7942;return;}
case 7942:cyc+=4;
if(cyc>=evt){pc=7943;return;}
case 7943:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7944;return;}
case 7944:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=7945;return;}
case 7945:cyc+=16;pc=pop();return;
case 7946:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=7947;return;}
case 7947:cyc+=12;H=206;L=0;
if(cyc>=evt){pc=7950;return;}
case 7950:cyc+=4;xor(A);
if(cyc>=evt){pc=7951;return;}
case 7951:cyc+=4;C=A;
if(cyc>=evt){pc=7952;return;}
case 7952:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7953;return;}
case 7953:cyc+=4;C=dec(C);
if(cyc>=evt){pc=7954;return;}
case 7954:cyc+=8;if(!fz){cyc+=4;pc=7952;return;}
if(cyc>=evt){pc=7956;return;}
case 7956:cyc+=12;H=207;L=0;
if(cyc>=evt){pc=7959;return;}
case 7959:cyc+=4;A=L;
if(cyc>=evt){pc=7960;return;}
case 7960:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=7961;return;}
case 7961:cyc+=4;C=dec(C);
if(cyc>=evt){pc=7962;return;}
case 7962:cyc+=8;if(!fz){cyc+=4;pc=7959;return;}
if(cyc>=evt){pc=7964;return;}
case 7964:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=7965;return;}
case 7965:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=7966;return;}
case 7966:cyc+=4;C=A;
if(cyc>=evt){pc=7967;return;}
case 7967:cyc+=4;and(A);
if(cyc>=evt){pc=7968;return;}
case 7968:cyc+=8;if(fz){cyc+=4;pc=7987;return;}
if(cyc>=evt){pc=7970;return;}
case 7970:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=7971;return;}
case 7971:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=7972;return;}
case 7972:cyc+=16;pushaf();
if(cyc>=evt){pc=7973;return;}
case 7973:cyc+=4;L=A;
if(cyc>=evt){pc=7974;return;}
case 7974:cyc+=8;H=206;
if(cyc>=evt){pc=7976;return;}
case 7976:cyc+=12;wr((H<<8|L),inc(rd((H<<8|L))));
if(cyc>=evt){pc=7977;return;}
case 7977:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=7978;return;}
case 7978:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=7979;return;}
case 7979:cyc+=8;H=207;
if(cyc>=evt){pc=7981;return;}
case 7981:cyc+=4;L=A;
if(cyc>=evt){pc=7982;return;}
case 7982:cyc+=12;popaf();
if(cyc>=evt){pc=7983;return;}
case 7983:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=7984;return;}
case 7984:cyc+=4;C=dec(C);
pc=7985;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 7985:cyc+=8;if(!fz){cyc+=4;pc=7970;return;}
if(cyc>=evt){pc=7987;return;}
case 7987:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=7988;return;}
case 7988:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=7989;return;}
case 7989:cyc+=4;C=A;
if(cyc>=evt){pc=7990;return;}
case 7990:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=7991;return;}
case 7991:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=7992;return;}
case 7992:cyc+=4;B=A;
if(cyc>=evt){pc=7993;return;}
case 7993:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=7994;return;}
case 7994:cyc+=12;H=208;L=0;
if(cyc>=evt){pc=7997;return;}
case 7997:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=7998;return;}
case 7998:cyc+=4;A=L;
if(cyc>=evt){pc=7999;return;}
case 7999:cyc+=16;wr(49617,A);
if(cyc>=evt){pc=8002;return;}
case 8002:cyc+=4;A=H;
if(cyc>=evt){pc=8003;return;}
case 8003:cyc+=16;wr(49618,A);
if(cyc>=evt){pc=8006;return;}
case 8006:cyc+=12;H=208;L=0;
if(cyc>=evt){pc=8009;return;}
case 8009:cyc+=4;xor(A);
if(cyc>=evt){pc=8010;return;}
case 8010:cyc+=16;wr(49613,A);
if(cyc>=evt){pc=8013;return;}
case 8013:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=8014;return;}
case 8014:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=8015;return;}
case 8015:cyc+=4;C=A;
if(cyc>=evt){pc=8016;return;}
case 8016:cyc+=8;B=206;
if(cyc>=evt){pc=8018;return;}
case 8018:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=8019;return;}
case 8019:cyc+=4;and(A);
if(cyc>=evt){pc=8020;return;}
case 8020:cyc+=8;if(fz){cyc+=4;pc=8046;return;}
if(cyc>=evt){pc=8022;return;}
case 8022:cyc+=24;push(8025);pc=8068;return;
if(cyc>=evt){pc=8025;return;}
case 8025:cyc+=16;A=rd(49615);
if(cyc>=evt){pc=8028;return;}
case 8028:cyc+=4;B=A;
if(cyc>=evt){pc=8029;return;}
case 8029:cyc+=4;A=C;
if(cyc>=evt){pc=8030;return;}
case 8030:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8031;return;}
case 8031:cyc+=4;B=dec(B);
if(cyc>=evt){pc=8032;return;}
case 8032:cyc+=8;if(!fz){cyc+=4;pc=8030;return;}
if(cyc>=evt){pc=8034;return;}
case 8034:cyc+=16;A=rd(49616);
if(cyc>=evt){pc=8037;return;}
case 8037:cyc+=4;and(A);
if(cyc>=evt){pc=8038;return;}
case 8038:cyc+=8;if(fz){cyc+=4;pc=8050;return;}
if(cyc>=evt){pc=8040;return;}
case 8040:cyc+=4;A=dec(A);
if(cyc>=evt){pc=8041;return;}
case 8041:cyc+=16;wr(49616,A);
if(cyc>=evt){pc=8044;return;}
case 8044:cyc+=12;pc=8029;return;
case 8046:cyc+=8;B=207;
if(cyc>=evt){pc=8048;return;}
case 8048:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=8049;return;}
case 8049:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8050;return;}
case 8050:cyc+=16;A=rd(49618);
if(cyc>=evt){pc=8053;return;}
case 8053:cyc+=4;cp(H);
if(cyc>=evt){pc=8054;return;}
case 8054:cyc+=8;if(!fz){cyc+=4;pc=8013;return;}
if(cyc>=evt){pc=8056;return;}
case 8056:cyc+=16;A=rd(49617);
if(cyc>=evt){pc=8059;return;}
case 8059:cyc+=4;cp(L);
if(cyc>=evt){pc=8060;return;}
case 8060:cyc+=8;if(!fz){cyc+=4;pc=8013;return;}
if(cyc>=evt){pc=8062;return;}
case 8062:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=8063;return;}
case 8063:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=8064;return;}
case 8064:cyc+=12;D=208;E=0;
if(cyc>=evt){pc=8067;return;}
case 8067:cyc+=16;pc=pop();return;
case 8068:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=8069;return;}
case 8069:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=8072;return;}
case 8072:cyc+=16;A=rd(49613);
if(cyc>=evt){pc=8075;return;}
case 8075:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=8077;return;}
case 8077:cyc+=8;if(!fz){cyc+=4;pc=8094;return;}
if(cyc>=evt){pc=8079;return;}
case 8079:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=8080;return;}
case 8080:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=8081;return;}
case 8081:cyc+=16;wr(49614,A);
if(cyc>=evt){pc=8084;return;}
case 8084:cyc+=8;A=srl(A);
if(cyc>=evt){pc=8086;return;}
case 8086:cyc+=8;A=srl(A);
if(cyc>=evt){pc=8088;return;}
case 8088:cyc+=8;A=srl(A);
if(cyc>=evt){pc=8090;return;}
case 8090:cyc+=8;A=srl(A);
if(cyc>=evt){pc=8092;return;}
case 8092:cyc+=12;pc=8099;return;
case 8094:cyc+=16;A=rd(49614);
if(cyc>=evt){pc=8097;return;}
case 8097:cyc+=8;and(15);
if(cyc>=evt){pc=8099;return;}
case 8099:cyc+=16;pushaf();
if(cyc>=evt){pc=8100;return;}
case 8100:cyc+=4;add(C);
if(cyc>=evt){pc=8101;return;}
case 8101:cyc+=4;C=A;
if(cyc>=evt){pc=8102;return;}
case 8102:cyc+=8;if(!fc){cyc+=4;pc=8105;return;}
if(cyc>=evt){pc=8104;return;}
case 8104:cyc+=4;B=inc(B);
if(cyc>=evt){pc=8105;return;}
case 8105:cyc+=16;A=rd(49613);
if(cyc>=evt){pc=8108;return;}
case 8108:cyc+=8;xor(1);
if(cyc>=evt){pc=8110;return;}
case 8110:cyc+=16;wr(49613,A);
if(cyc>=evt){pc=8113;return;}
case 8113:cyc+=12;popaf();
if(cyc>=evt){pc=8114;return;}
case 8114:cyc+=8;cp(15);
if(cyc>=evt){pc=8116;return;}
case 8116:cyc+=8;if(fz){cyc+=4;pc=8072;return;}
if(cyc>=evt){pc=8118;return;}
case 8118:cyc+=8;{const t=(B<<8|C)+1;B=(t>>8)&255;C=t&255;}
if(cyc>=evt){pc=8119;return;}
case 8119:cyc+=4;A=C;
if(cyc>=evt){pc=8120;return;}
case 8120:cyc+=16;wr(49615,A);
if(cyc>=evt){pc=8123;return;}
case 8123:cyc+=4;A=B;
if(cyc>=evt){pc=8124;return;}
case 8124:cyc+=16;wr(49616,A);
if(cyc>=evt){pc=8127;return;}
case 8127:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=8128;return;}
case 8128:cyc+=16;pc=pop();return;
case 8129:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8130;return;}
case 8130:cyc+=4;C=A;
if(cyc>=evt){pc=8131;return;}
case 8131:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8132;return;}
case 8132:cyc+=4;B=A;
if(cyc>=evt){pc=8133;return;}
case 8133:cyc+=4;E=A;
if(cyc>=evt){pc=8134;return;}
case 8134:cyc+=8;D=0;
if(cyc>=evt){pc=8136;return;}
case 8136:cyc+=4;and(A);
if(cyc>=evt){pc=8137;return;}
case 8137:cyc+=8;if(!fz){cyc+=4;pc=8140;return;}
if(cyc>=evt){pc=8139;return;}
case 8139:cyc+=4;D=inc(D);
if(cyc>=evt){pc=8140;return;}
case 8140:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=8141;return;}
case 8141:cyc+=8;D=srl(D);
if(cyc>=evt){pc=8143;return;}
case 8143:cyc+=8;E=rr(E);
if(cyc>=evt){pc=8145;return;}
case 8145:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=8146;return;}
case 8146:cyc+=12;D=208;E=0;
if(cyc>=evt){pc=8149;return;}
case 8149:cyc+=24;push(8152);pc=8165;return;
if(cyc>=evt){pc=8152;return;}
case 8152:cyc+=4;B=dec(B);
if(cyc>=evt){pc=8153;return;}
case 8153:cyc+=8;if(!fz){cyc+=4;pc=8149;return;}
if(cyc>=evt){pc=8155;return;}
case 8155:cyc+=12;H=208;L=0;
if(cyc>=evt){pc=8158;return;}
case 8158:cyc+=4;A=E;
if(cyc>=evt){pc=8159;return;}
case 8159:cyc+=4;sub(L);
if(cyc>=evt){pc=8160;return;}
case 8160:cyc+=4;C=A;
if(cyc>=evt){pc=8161;return;}
case 8161:cyc+=4;A=D;
if(cyc>=evt){pc=8162;return;}
case 8162:cyc+=4;sbc(H);
if(cyc>=evt){pc=8163;return;}
case 8163:cyc+=4;B=A;
if(cyc>=evt){pc=8164;return;}
case 8164:cyc+=16;pc=pop();return;
case 8165:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8166;return;}
case 8166:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=8167;return;}
case 8167:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=8168;return;}
case 8168:cyc+=16;wr(49619,A);
if(cyc>=evt){pc=8171;return;}
case 8171:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8172;return;}
case 8172:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=8173;return;}
case 8173:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=8174;return;}
case 8174:cyc+=16;wr(49620,A);
if(cyc>=evt){pc=8177;return;}
case 8177:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8178;return;}
case 8178:cyc+=4;cp(C);
if(cyc>=evt){pc=8179;return;}
case 8179:cyc+=8;if(fz){cyc+=4;pc=8194;return;}
if(cyc>=evt){pc=8181;return;}
case 8181:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=8182;return;}
case 8182:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=8183;return;}
case 8183:cyc+=16;wr(49619,A);
if(cyc>=evt){pc=8186;return;}
case 8186:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8187;return;}
case 8187:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=8188;return;}
case 8188:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=8189;return;}
case 8189:cyc+=16;wr(49620,A);
if(cyc>=evt){pc=8192;return;}
case 8192:cyc+=12;pc=8204;return;
case 8194:cyc+=16;A=rd(49619);
if(cyc>=evt){pc=8197;return;}
case 8197:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=8198;return;}
case 8198:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=8199;return;}
case 8199:cyc+=16;A=rd(49620);
if(cyc>=evt){pc=8202;return;}
case 8202:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=8203;return;}
case 8203:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=8204;return;}
case 8204:cyc+=4;A=E;
if(cyc>=evt){pc=8205;return;}
case 8205:cyc+=8;and(15);
if(cyc>=evt){pc=8207;return;}
case 8207:cyc+=8;if(!fz){cyc+=4;pc=8177;return;}
if(cyc>=evt){pc=8209;return;}
case 8209:cyc+=16;pc=pop();return;
case 8210:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8211;return;}
case 8211:cyc+=4;C=A;
if(cyc>=evt){pc=8212;return;}
case 8212:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8213;return;}
case 8213:cyc+=4;B=A;
if(cyc>=evt){pc=8214;return;}
case 8214:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=8215;return;}
case 8215:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=8216;return;}
case 8216:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=8219;return;}
case 8219:cyc+=4;A=E;
if(cyc>=evt){pc=8220;return;}
case 8220:cyc+=4;and(A);
if(cyc>=evt){pc=8221;return;}
case 8221:cyc+=8;if(fz){cyc+=4;pc=8260;return;}
if(cyc>=evt){pc=8223;return;}
case 8223:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8224;return;}
case 8224:cyc+=4;D=A;
if(cyc>=evt){pc=8225;return;}
case 8225:cyc+=8;A=srl(A);
if(cyc>=evt){pc=8227;return;}
case 8227:cyc+=8;A=srl(A);
if(cyc>=evt){pc=8229;return;}
case 8229:cyc+=8;A=srl(A);
if(cyc>=evt){pc=8231;return;}
case 8231:cyc+=8;A=srl(A);
if(cyc>=evt){pc=8233;return;}
case 8233:cyc+=8;if(!fz){cyc+=4;pc=8237;return;}
if(cyc>=evt){pc=8235;return;}
case 8235:cyc+=8;A=16;
if(cyc>=evt){pc=8237;return;}
case 8237:cyc+=4;add(C);
if(cyc>=evt){pc=8238;return;}
case 8238:cyc+=4;C=A;
if(cyc>=evt){pc=8239;return;}
case 8239:cyc+=8;if(!fc){cyc+=4;pc=8242;return;}
if(cyc>=evt){pc=8241;return;}
case 8241:cyc+=4;B=inc(B);
if(cyc>=evt){pc=8242;return;}
case 8242:cyc+=4;E=dec(E);
if(cyc>=evt){pc=8243;return;}
case 8243:cyc+=8;if(fz){cyc+=4;pc=8260;return;}
if(cyc>=evt){pc=8245;return;}
case 8245:cyc+=4;A=D;
if(cyc>=evt){pc=8246;return;}
case 8246:cyc+=8;and(15);
if(cyc>=evt){pc=8248;return;}
case 8248:cyc+=8;if(!fz){cyc+=4;pc=8252;return;}
if(cyc>=evt){pc=8250;return;}
case 8250:cyc+=8;A=16;
if(cyc>=evt){pc=8252;return;}
case 8252:cyc+=4;add(C);
if(cyc>=evt){pc=8253;return;}
case 8253:cyc+=4;C=A;
if(cyc>=evt){pc=8254;return;}
case 8254:cyc+=8;if(!fc){cyc+=4;pc=8257;return;}
if(cyc>=evt){pc=8256;return;}
case 8256:cyc+=4;B=inc(B);
if(cyc>=evt){pc=8257;return;}
case 8257:cyc+=4;E=dec(E);
if(cyc>=evt){pc=8258;return;}
case 8258:cyc+=8;if(!fz){cyc+=4;pc=8223;return;}
if(cyc>=evt){pc=8260;return;}
case 8260:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=8261;return;}
case 8261:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=8262;return;}
case 8262:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=8263;return;}
case 8263:cyc+=4;E=B;
if(cyc>=evt){pc=8264;return;}
case 8264:cyc+=8;D=0;
if(cyc>=evt){pc=8266;return;}
case 8266:cyc+=4;A=B;
if(cyc>=evt){pc=8267;return;}
case 8267:cyc+=4;and(A);
if(cyc>=evt){pc=8268;return;}
case 8268:cyc+=8;if(!fz){cyc+=4;pc=8271;return;}
if(cyc>=evt){pc=8270;return;}
case 8270:cyc+=4;D=inc(D);
if(cyc>=evt){pc=8271;return;}
case 8271:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=8272;return;}
case 8272:cyc+=8;D=srl(D);
if(cyc>=evt){pc=8274;return;}
case 8274:cyc+=8;E=rr(E);
if(cyc>=evt){pc=8276;return;}
case 8276:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=8277;return;}
case 8277:cyc+=12;D=208;E=0;
if(cyc>=evt){pc=8280;return;}
case 8280:cyc+=24;push(8283);pc=8165;return;
if(cyc>=evt){pc=8283;return;}
case 8283:cyc+=12;H=208;L=0;
if(cyc>=evt){pc=8286;return;}
case 8286:cyc+=16;pc=pop();return;
case 8287:cyc+=24;push(8290);pc=4739;return;
if(cyc>=evt){pc=8290;return;}
case 8290:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=8292;return;}
case 8292:cyc+=8;and(15);
if(cyc>=evt){pc=8294;return;}
case 8294:cyc+=8;cp(15);
if(cyc>=evt){pc=8296;return;}
case 8296:cyc+=12;if(fz){cyc+=4;pc=336;return;}
if(cyc>=evt){pc=8299;return;}
case 8299:cyc+=12;A=rd(65420);
if(cyc>=evt){pc=8301;return;}
case 8301:cyc+=8;and(15);
if(cyc>=evt){pc=8303;return;}
case 8303:cyc+=16;pc=pop();return;
case 8304:cyc+=24;push(8307);pc=7434;return;
if(cyc>=evt){pc=8307;return;}
case 8307:cyc+=24;push(8310);pc=7524;return;
if(cyc>=evt){pc=8310;return;}
case 8310:cyc+=8;A=1;
if(cyc>=evt){pc=8312;return;}
case 8312:cyc+=16;wr(49496,A);
if(cyc>=evt){pc=8315;return;}
case 8315:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=8318;return;}
case 8318:cyc+=8;cp(18);
if(cyc>=evt){pc=8320;return;}
case 8320:cyc+=8;if(fz){cyc+=4;pc=8397;return;}
if(cyc>=evt){pc=8322;return;}
case 8322:cyc+=8;cp(15);
if(cyc>=evt){pc=8324;return;}
case 8324:cyc+=8;if(fz){cyc+=4;pc=8397;return;}
if(cyc>=evt){pc=8326;return;}
case 8326:cyc+=8;A=2;
if(cyc>=evt){pc=8328;return;}
case 8328:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=8331;return;}
case 8331:cyc+=12;H=106;L=87;
if(cyc>=evt){pc=8334;return;}
case 8334:cyc+=24;push(8337);pc=8129;return;
if(cyc>=evt){pc=8337;return;}
case 8337:cyc+=12;D=128;E=0;
if(cyc>=evt){pc=8340;return;}
case 8340:cyc+=24;push(8343);pc=4858;return;
if(cyc>=evt){pc=8343;return;}
case 8343:cyc+=8;A=8;
if(cyc>=evt){pc=8345;return;}
case 8345:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=8348;return;}
case 8348:cyc+=12;H=64;L=4;
if(cyc>=evt){pc=8351;return;}
case 8351:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=8354;return;}
case 8354:cyc+=8;cp(17);
if(cyc>=evt){pc=8356;return;}
case 8356:cyc+=8;if(!fz){cyc+=4;pc=8361;return;}
if(cyc>=evt){pc=8358;return;}
case 8358:cyc+=12;H=64;L=102;
if(cyc>=evt){pc=8361;return;}
case 8361:cyc+=24;push(8364);pc=8129;return;
if(cyc>=evt){pc=8364;return;}
case 8364:cyc+=12;D=132;E=208;
pc=8367;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 8367:cyc+=24;push(8370);pc=4858;return;
if(cyc>=evt){pc=8370;return;}
case 8370:cyc+=12;H=64;L=35;
if(cyc>=evt){pc=8373;return;}
case 8373:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=8376;return;}
case 8376:cyc+=8;cp(17);
if(cyc>=evt){pc=8378;return;}
case 8378:cyc+=8;if(!fz){cyc+=4;pc=8383;return;}
if(cyc>=evt){pc=8380;return;}
case 8380:cyc+=12;H=64;L=135;
if(cyc>=evt){pc=8383;return;}
case 8383:cyc+=24;push(8386);pc=8129;return;
if(cyc>=evt){pc=8386;return;}
case 8386:cyc+=12;D=135;E=224;
if(cyc>=evt){pc=8389;return;}
case 8389:cyc+=24;push(8392);pc=4858;return;
if(cyc>=evt){pc=8392;return;}
case 8392:cyc+=8;A=1;
if(cyc>=evt){pc=8394;return;}
case 8394:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=8397;return;}
case 8397:cyc+=16;A=rd(49502);
if(cyc>=evt){pc=8400;return;}
case 8400:cyc+=16;wr(49503,A);
if(cyc>=evt){pc=8403;return;}
case 8403:cyc+=16;wr(49501,A);
if(cyc>=evt){pc=8406;return;}
case 8406:cyc+=8;A=1;
if(cyc>=evt){pc=8408;return;}
case 8408:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=8411;return;}
case 8411:cyc+=4;xor(A);
if(cyc>=evt){pc=8412;return;}
case 8412:cyc+=16;wr(49462,A);
if(cyc>=evt){pc=8415;return;}
case 8415:cyc+=16;wr(49463,A);
if(cyc>=evt){pc=8418;return;}
case 8418:cyc+=16;wr(49418,A);
if(cyc>=evt){pc=8421;return;}
case 8421:cyc+=16;wr(49493,A);
if(cyc>=evt){pc=8424;return;}
case 8424:cyc+=16;wr(49509,A);
if(cyc>=evt){pc=8427;return;}
case 8427:cyc+=16;wr(49421,A);
if(cyc>=evt){pc=8430;return;}
case 8430:cyc+=16;wr(49520,A);
if(cyc>=evt){pc=8433;return;}
case 8433:cyc+=16;wr(49587,A);
if(cyc>=evt){pc=8436;return;}
case 8436:cyc+=16;wr(49588,A);
if(cyc>=evt){pc=8439;return;}
case 8439:cyc+=16;wr(49523,A);
if(cyc>=evt){pc=8442;return;}
case 8442:cyc+=16;wr(49524,A);
if(cyc>=evt){pc=8445;return;}
case 8445:cyc+=16;wr(49589,A);
if(cyc>=evt){pc=8448;return;}
case 8448:cyc+=16;wr(49591,A);
if(cyc>=evt){pc=8451;return;}
case 8451:cyc+=12;H=64;L=0;
if(cyc>=evt){pc=8454;return;}
case 8454:cyc+=24;push(8457);pc=14918;return;
if(cyc>=evt){pc=8457;return;}
case 8457:cyc+=12;H=193;L=119;
if(cyc>=evt){pc=8460;return;}
case 8460:cyc+=8;C=60;
if(cyc>=evt){pc=8462;return;}
case 8462:cyc+=4;xor(A);
if(cyc>=evt){pc=8463;return;}
case 8463:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8464;return;}
case 8464:cyc+=4;C=dec(C);
if(cyc>=evt){pc=8465;return;}
case 8465:cyc+=8;if(!fz){cyc+=4;pc=8463;return;}
if(cyc>=evt){pc=8467;return;}
case 8467:cyc+=8;A=6;
if(cyc>=evt){pc=8469;return;}
case 8469:cyc+=16;wr(49510,A);
if(cyc>=evt){pc=8472;return;}
case 8472:cyc+=8;A=106;
if(cyc>=evt){pc=8474;return;}
case 8474:cyc+=16;wr(49458,A);
if(cyc>=evt){pc=8477;return;}
case 8477:cyc+=16;wr(49460,A);
if(cyc>=evt){pc=8480;return;}
case 8480:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=8483;return;}
case 8483:cyc+=16;wr(49459,A);
if(cyc>=evt){pc=8486;return;}
case 8486:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=8489;return;}
case 8489:cyc+=24;push(8492);pc=7524;return;
if(cyc>=evt){pc=8492;return;}
case 8492:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=8495;return;}
case 8495:cyc+=8;cp(18);
if(cyc>=evt){pc=8497;return;}
case 8497:cyc+=12;if(fz){cyc+=4;pc=8670;return;}
if(cyc>=evt){pc=8500;return;}
case 8500:cyc+=8;cp(15);
if(cyc>=evt){pc=8502;return;}
case 8502:cyc+=12;if(fz){cyc+=4;pc=8670;return;}
if(cyc>=evt){pc=8505;return;}
case 8505:cyc+=8;A=7;
if(cyc>=evt){pc=8507;return;}
case 8507:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=8510;return;}
case 8510:cyc+=16;A=rd(49482);
if(cyc>=evt){pc=8513;return;}
case 8513:cyc+=12;H=92;L=82;
if(cyc>=evt){pc=8516;return;}
case 8516:cyc+=4;add(L);
if(cyc>=evt){pc=8517;return;}
case 8517:cyc+=4;L=A;
if(cyc>=evt){pc=8518;return;}
case 8518:cyc+=8;if(!fc){cyc+=4;pc=8521;return;}
if(cyc>=evt){pc=8520;return;}
case 8520:cyc+=4;H=inc(H);
if(cyc>=evt){pc=8521;return;}
case 8521:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=8522;return;}
case 8522:cyc+=16;wr(49483,A);
if(cyc>=evt){pc=8525;return;}
case 8525:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=8528;return;}
case 8528:cyc+=8;cp(17);
if(cyc>=evt){pc=8530;return;}
case 8530:cyc+=8;if(fz){cyc+=4;pc=8561;return;}
if(cyc>=evt){pc=8532;return;}
case 8532:cyc+=8;A=8;
if(cyc>=evt){pc=8534;return;}
case 8534:cyc+=16;wr(49515,A);
if(cyc>=evt){pc=8537;return;}
case 8537:cyc+=12;B=95;C=30;
if(cyc>=evt){pc=8540;return;}
case 8540:cyc+=12;H=99;L=6;
if(cyc>=evt){pc=8543;return;}
case 8543:cyc+=16;A=rd(49483);
if(cyc>=evt){pc=8546;return;}
case 8546:cyc+=4;or(A);
if(cyc>=evt){pc=8547;return;}
case 8547:cyc+=8;if(fz){cyc+=4;pc=8588;return;}
if(cyc>=evt){pc=8549;return;}
case 8549:cyc+=8;cp(2);
if(cyc>=evt){pc=8551;return;}
case 8551:cyc+=8;if(fz){cyc+=4;pc=8588;return;}
if(cyc>=evt){pc=8553;return;}
case 8553:cyc+=12;B=109;C=234;
if(cyc>=evt){pc=8556;return;}
case 8556:cyc+=12;H=113;L=210;
if(cyc>=evt){pc=8559;return;}
case 8559:cyc+=12;pc=8588;return;
case 8561:cyc+=8;A=2;
if(cyc>=evt){pc=8563;return;}
case 8563:cyc+=16;wr(49515,A);
if(cyc>=evt){pc=8566;return;}
case 8566:cyc+=12;B=64;C=0;
if(cyc>=evt){pc=8569;return;}
case 8569:cyc+=12;H=72;L=16;
if(cyc>=evt){pc=8572;return;}
case 8572:cyc+=16;A=rd(49483);
if(cyc>=evt){pc=8575;return;}
case 8575:cyc+=4;or(A);
if(cyc>=evt){pc=8576;return;}
case 8576:cyc+=8;if(fz){cyc+=4;pc=8588;return;}
if(cyc>=evt){pc=8578;return;}
case 8578:cyc+=8;cp(2);
if(cyc>=evt){pc=8580;return;}
case 8580:cyc+=8;if(fz){cyc+=4;pc=8588;return;}
if(cyc>=evt){pc=8582;return;}
case 8582:cyc+=12;B=83;C=228;
if(cyc>=evt){pc=8585;return;}
case 8585:cyc+=12;H=91;L=244;
if(cyc>=evt){pc=8588;return;}
case 8588:cyc+=4;A=C;
if(cyc>=evt){pc=8589;return;}
case 8589:cyc+=16;wr(49513,A);
if(cyc>=evt){pc=8592;return;}
case 8592:cyc+=4;A=B;
if(cyc>=evt){pc=8593;return;}
case 8593:cyc+=16;wr(49514,A);
if(cyc>=evt){pc=8596;return;}
case 8596:cyc+=16;A=rd(49515);
if(cyc>=evt){pc=8599;return;}
case 8599:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=8602;return;}
case 8602:cyc+=24;push(8605);pc=8129;return;
if(cyc>=evt){pc=8605;return;}
case 8605:cyc+=12;D=144;E=0;
if(cyc>=evt){pc=8608;return;}
case 8608:cyc+=12;B=8;C=0;
if(cyc>=evt){pc=8611;return;}
case 8611:cyc+=24;push(8614);pc=4858;return;
if(cyc>=evt){pc=8614;return;}
case 8614:cyc+=12;D=136;E=0;
if(cyc>=evt){pc=8617;return;}
case 8617:cyc+=12;B=8;C=0;
if(cyc>=evt){pc=8620;return;}
case 8620:cyc+=24;push(8623);pc=4858;return;
if(cyc>=evt){pc=8623;return;}
case 8623:cyc+=8;A=8;
if(cyc>=evt){pc=8625;return;}
case 8625:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=8628;return;}
case 8628:cyc+=12;H=64;L=215;
if(cyc>=evt){pc=8631;return;}
case 8631:cyc+=12;D=65;E=180;
if(cyc>=evt){pc=8634;return;}
case 8634:cyc+=16;A=rd(49483);
if(cyc>=evt){pc=8637;return;}
case 8637:cyc+=4;and(A);
if(cyc>=evt){pc=8638;return;}
case 8638:cyc+=8;if(fz){cyc+=4;pc=8650;return;}
if(cyc>=evt){pc=8640;return;}
case 8640:cyc+=8;cp(2);
if(cyc>=evt){pc=8642;return;}
case 8642:cyc+=8;if(fz){cyc+=4;pc=8650;return;}
if(cyc>=evt){pc=8644;return;}
case 8644:cyc+=12;H=65;L=67;
if(cyc>=evt){pc=8647;return;}
case 8647:cyc+=12;D=66;E=29;
if(cyc>=evt){pc=8650;return;}
case 8650:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=8651;return;}
case 8651:cyc+=24;push(8654);pc=8129;return;
if(cyc>=evt){pc=8654;return;}
case 8654:cyc+=12;D=132;E=240;
if(cyc>=evt){pc=8657;return;}
case 8657:cyc+=24;push(8660);pc=4858;return;
if(cyc>=evt){pc=8660;return;}
case 8660:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=8661;return;}
case 8661:cyc+=24;push(8664);pc=8129;return;
if(cyc>=evt){pc=8664;return;}
case 8664:cyc+=12;D=133;E=128;
if(cyc>=evt){pc=8667;return;}
case 8667:cyc+=24;push(8670);pc=4858;return;
if(cyc>=evt){pc=8670;return;}
case 8670:cyc+=8;A=7;
if(cyc>=evt){pc=8672;return;}
case 8672:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=8675;return;}
case 8675:cyc+=12;H=92;L=44;
if(cyc>=evt){pc=8678;return;}
case 8678:cyc+=16;A=rd(49482);
if(cyc>=evt){pc=8681;return;}
case 8681:cyc+=8;A=sla(A);
if(cyc>=evt){pc=8683;return;}
case 8683:cyc+=4;add(L);
if(cyc>=evt){pc=8684;return;}
case 8684:cyc+=4;L=A;
if(cyc>=evt){pc=8685;return;}
case 8685:cyc+=8;if(!fc){cyc+=4;pc=8688;return;}
if(cyc>=evt){pc=8687;return;}
case 8687:cyc+=4;H=inc(H);
if(cyc>=evt){pc=8688;return;}
case 8688:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8689;return;}
case 8689:cyc+=4;E=A;
if(cyc>=evt){pc=8690;return;}
case 8690:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=8691;return;}
case 8691:cyc+=4;D=A;
if(cyc>=evt){pc=8692;return;}
case 8692:cyc+=24;push(8695);pc=7946;return;
if(cyc>=evt){pc=8695;return;}
case 8695:cyc+=12;H=196;L=0;
if(cyc>=evt){pc=8698;return;}
case 8698:cyc+=8;B=24;
if(cyc>=evt){pc=8700;return;}
case 8700:cyc+=8;C=29;
if(cyc>=evt){pc=8702;return;}
case 8702:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=8703;return;}
case 8703:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8704;return;}
case 8704:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=8705;return;}
case 8705:cyc+=8;cp(255);
if(cyc>=evt){pc=8707;return;}
case 8707:cyc+=8;if(!fz){cyc+=4;pc=8718;return;}
if(cyc>=evt){pc=8709;return;}
case 8709:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=8710;return;}
case 8710:cyc+=4;xor(A);
if(cyc>=evt){pc=8711;return;}
case 8711:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8712;return;}
case 8712:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8713;return;}
case 8713:cyc+=4;C=dec(C);
if(cyc>=evt){pc=8714;return;}
case 8714:cyc+=8;if(!fz){cyc+=4;pc=8712;return;}
if(cyc>=evt){pc=8716;return;}
case 8716:cyc+=12;pc=8724;return;
case 8718:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=8719;return;}
case 8719:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8720;return;}
case 8720:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=8721;return;}
case 8721:cyc+=4;C=dec(C);
if(cyc>=evt){pc=8722;return;}
case 8722:cyc+=8;if(!fz){cyc+=4;pc=8718;return;}
if(cyc>=evt){pc=8724;return;}
case 8724:cyc+=4;B=dec(B);
if(cyc>=evt){pc=8725;return;}
case 8725:cyc+=8;if(!fz){cyc+=4;pc=8700;return;}
if(cyc>=evt){pc=8727;return;}
case 8727:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=8728;return;}
case 8728:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=8729;return;}
case 8729:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=8730;return;}
case 8730:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=8731;return;}
case 8731:cyc+=12;B=0;C=248;
if(cyc>=evt){pc=8734;return;}
case 8734:cyc+=24;push(8737);pc=4858;return;
if(cyc>=evt){pc=8737;return;}
case 8737:cyc+=8;A=1;
if(cyc>=evt){pc=8739;return;}
case 8739:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=8742;return;}
case 8742:cyc+=8;B=24;
if(cyc>=evt){pc=8744;return;}
case 8744:cyc+=12;H=0;L=186;
if(cyc>=evt){pc=8747;return;}
case 8747:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=8750;return;}
case 8750:cyc+=4;add(L);
if(cyc>=evt){pc=8751;return;}
case 8751:cyc+=4;L=A;
if(cyc>=evt){pc=8752;return;}
case 8752:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=8753;return;}
case 8753:cyc+=4;C=A;
if(cyc>=evt){pc=8754;return;}
case 8754:cyc+=12;H=0;L=65;
if(cyc>=evt){pc=8757;return;}
case 8757:cyc+=4;add(L);
if(cyc>=evt){pc=8758;return;}
case 8758:cyc+=4;L=A;
if(cyc>=evt){pc=8759;return;}
case 8759:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=8760;return;}
case 8760:cyc+=16;wr(49505,A);
if(cyc>=evt){pc=8763;return;}
case 8763:cyc+=16;wr(49506,A);
if(cyc>=evt){pc=8766;return;}
case 8766:cyc+=12;H=199;L=51;
if(cyc>=evt){pc=8769;return;}
case 8769:cyc+=12;D=199;E=200;
if(cyc>=evt){pc=8772;return;}
case 8772:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8773;return;}
case 8773:cyc+=8;and(31);
if(cyc>=evt){pc=8775;return;}
case 8775:cyc+=8;cp(30);
if(cyc>=evt){pc=8777;return;}
case 8777:cyc+=8;if(fz){cyc+=4;pc=8780;return;}
if(cyc>=evt){pc=8779;return;}
case 8779:cyc+=4;A=C;
if(cyc>=evt){pc=8780;return;}
case 8780:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=8781;return;}
case 8781:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=8782;return;}
case 8782:cyc+=4;B=dec(B);
if(cyc>=evt){pc=8783;return;}
case 8783:cyc+=8;if(!fz){cyc+=4;pc=8772;return;}
if(cyc>=evt){pc=8785;return;}
case 8785:cyc+=8;C=0;
if(cyc>=evt){pc=8787;return;}
case 8787:cyc+=16;A=rd(49482);
if(cyc>=evt){pc=8790;return;}
case 8790:cyc+=8;cp(2);
if(cyc>=evt){pc=8792;return;}
case 8792:cyc+=8;if(fc){cyc+=4;pc=8799;return;}
if(cyc>=evt){pc=8794;return;}
case 8794:cyc+=8;cp(17);
if(cyc>=evt){pc=8796;return;}
case 8796:cyc+=8;if(!fc){cyc+=4;pc=8799;return;}
if(cyc>=evt){pc=8798;return;}
case 8798:cyc+=4;C=inc(C);
if(cyc>=evt){pc=8799;return;}
case 8799:cyc+=4;A=C;
if(cyc>=evt){pc=8800;return;}
case 8800:cyc+=16;wr(49511,A);
if(cyc>=evt){pc=8803;return;}
case 8803:cyc+=8;C=0;
if(cyc>=evt){pc=8805;return;}
case 8805:cyc+=16;A=rd(50993);
if(cyc>=evt){pc=8808;return;}
case 8808:cyc+=8;cp(10);
if(cyc>=evt){pc=8810;return;}
case 8810:cyc+=8;if(fc){cyc+=4;pc=8817;return;}
if(cyc>=evt){pc=8812;return;}
case 8812:cyc+=8;sub(10);
if(cyc>=evt){pc=8814;return;}
case 8814:cyc+=4;C=inc(C);
if(cyc>=evt){pc=8815;return;}
case 8815:cyc+=12;pc=8808;return;
case 8817:cyc+=8;A=sla(A);
if(cyc>=evt){pc=8819;return;}
case 8819:cyc+=16;wr(49425,A);
if(cyc>=evt){pc=8822;return;}
case 8822:cyc+=4;A=C;
if(cyc>=evt){pc=8823;return;}
case 8823:cyc+=16;wr(49426,A);
if(cyc>=evt){pc=8826;return;}
case 8826:cyc+=16;A=rd(50994);
if(cyc>=evt){pc=8829;return;}
case 8829:cyc+=8;and(1);
if(cyc>=evt){pc=8831;return;}
case 8831:cyc+=16;wr(49423,A);
if(cyc>=evt){pc=8834;return;}
case 8834:cyc+=16;A=rd(50992);
if(cyc>=evt){pc=8837;return;}
case 8837:cyc+=4;A=dec(A);
if(cyc>=evt){pc=8838;return;}
case 8838:cyc+=16;wr(49484,A);
if(cyc>=evt){pc=8841;return;}
case 8841:cyc+=24;push(8844);pc=4990;return;
if(cyc>=evt){pc=8844;return;}
case 8844:cyc+=24;push(8847);pc=13073;return;
if(cyc>=evt){pc=8847;return;}
case 8847:cyc+=16;A=rd(49482);
if(cyc>=evt){pc=8850;return;}
case 8850:cyc+=4;and(A);
if(cyc>=evt){pc=8851;return;}
case 8851:cyc+=8;if(fz){cyc+=4;pc=8856;return;}
if(cyc>=evt){pc=8853;return;}
case 8853:cyc+=24;push(8856);pc=13814;return;
pc=8856;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 8856:cyc+=8;A=7;
if(cyc>=evt){pc=8858;return;}
case 8858:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=8861;return;}
case 8861:cyc+=16;A=rd(49482);
if(cyc>=evt){pc=8864;return;}
case 8864:cyc+=12;H=92;L=177;
if(cyc>=evt){pc=8867;return;}
case 8867:cyc+=4;add(L);
if(cyc>=evt){pc=8868;return;}
case 8868:cyc+=4;L=A;
if(cyc>=evt){pc=8869;return;}
case 8869:cyc+=8;if(!fc){cyc+=4;pc=8872;return;}
if(cyc>=evt){pc=8871;return;}
case 8871:cyc+=4;H=inc(H);
if(cyc>=evt){pc=8872;return;}
case 8872:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=8873;return;}
case 8873:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=8876;return;}
case 8876:cyc+=8;A=1;
if(cyc>=evt){pc=8878;return;}
case 8878:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=8881;return;}
case 8881:cyc+=16;A=rd(49482);
if(cyc>=evt){pc=8884;return;}
case 8884:cyc+=8;cp(1);
if(cyc>=evt){pc=8886;return;}
case 8886:cyc+=8;if(!fz){cyc+=4;pc=8898;return;}
if(cyc>=evt){pc=8888;return;}
case 8888:cyc+=8;A=1;
if(cyc>=evt){pc=8890;return;}
case 8890:cyc+=24;push(8893);pc=14993;return;
if(cyc>=evt){pc=8893;return;}
case 8893:cyc+=12;B=4;C=9;
if(cyc>=evt){pc=8896;return;}
case 8896:cyc+=12;pc=8912;return;
case 8898:cyc+=8;A=16;
if(cyc>=evt){pc=8900;return;}
case 8900:cyc+=24;push(8903);pc=5872;return;
if(cyc>=evt){pc=8903;return;}
case 8903:cyc+=8;if(!fz){cyc+=4;pc=8935;return;}
if(cyc>=evt){pc=8905;return;}
case 8905:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=8908;return;}
case 8908:cyc+=24;push(8911);pc=11870;return;
if(cyc>=evt){pc=8911;return;}
case 8911:cyc+=4;C=dec(C);
if(cyc>=evt){pc=8912;return;}
case 8912:cyc+=8;E=0;
if(cyc>=evt){pc=8914;return;}
case 8914:cyc+=24;push(8917);pc=12020;return;
if(cyc>=evt){pc=8917;return;}
case 8917:cyc+=12;H=193;L=119;
if(cyc>=evt){pc=8920;return;}
case 8920:cyc+=4;A=B;
if(cyc>=evt){pc=8921;return;}
case 8921:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8922;return;}
case 8922:cyc+=4;A=C;
if(cyc>=evt){pc=8923;return;}
case 8923:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8924;return;}
case 8924:cyc+=8;A=1;
if(cyc>=evt){pc=8926;return;}
case 8926:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=8927;return;}
case 8927:cyc+=8;A=30;
if(cyc>=evt){pc=8929;return;}
case 8929:cyc+=16;wr(49509,A);
if(cyc>=evt){pc=8932;return;}
case 8932:cyc+=24;push(8935);pc=4990;return;
if(cyc>=evt){pc=8935;return;}
case 8935:cyc+=8;A=36;
if(cyc>=evt){pc=8937;return;}
case 8937:cyc+=12;wr(65346,A);
if(cyc>=evt){pc=8939;return;}
case 8939:cyc+=16;pc=pop();return;
case 8940:cyc+=24;push(8943);pc=14031;return;
if(cyc>=evt){pc=8943;return;}
case 8943:cyc+=24;push(8946);pc=4739;return;
if(cyc>=evt){pc=8946;return;}
case 8946:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=8948;return;}
case 8948:cyc+=8;and(15);
if(cyc>=evt){pc=8950;return;}
case 8950:cyc+=8;if(!fz){cyc+=4;pc=8966;return;}
if(cyc>=evt){pc=8952;return;}
case 8952:cyc+=16;A=rd(49592);
if(cyc>=evt){pc=8955;return;}
case 8955:cyc+=4;and(A);
if(cyc>=evt){pc=8956;return;}
case 8956:cyc+=8;if(!fz){cyc+=4;pc=8940;return;}
if(cyc>=evt){pc=8958;return;}
case 8958:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=8961;return;}
case 8961:cyc+=8;cp(18);
if(cyc>=evt){pc=8963;return;}
case 8963:cyc+=12;if(!fc){cyc+=4;pc=1465;return;}
if(cyc>=evt){pc=8966;return;}
case 8966:if(GK[8966]){pc=8966;if(ghooks[8966]())return;}
cyc+=16;A=rd(49481);
if(cyc>=evt){pc=8969;return;}
case 8969:cyc+=8;cp(6);
if(cyc>=evt){pc=8971;return;}
case 8971:cyc+=12;if(fz){cyc+=4;pc=2069;return;}
if(cyc>=evt){pc=8974;return;}
case 8974:cyc+=8;cp(14);
if(cyc>=evt){pc=8976;return;}
case 8976:cyc+=12;if(!fc){cyc+=4;pc=2069;return;}
if(cyc>=evt){pc=8979;return;}
case 8979:cyc+=12;H=193;L=196;
if(cyc>=evt){pc=8982;return;}
case 8982:cyc+=4;xor(A);
if(cyc>=evt){pc=8983;return;}
case 8983:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=8984;return;}
case 8984:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=8987;return;}
case 8987:cyc+=4;A=inc(A);
if(cyc>=evt){pc=8988;return;}
case 8988:cyc+=8;cp(10);
if(cyc>=evt){pc=8990;return;}
case 8990:cyc+=8;if(fc){cyc+=4;pc=8995;return;}
if(cyc>=evt){pc=8992;return;}
case 8992:cyc+=12;wr((H<<8|L),inc(rd((H<<8|L))));
if(cyc>=evt){pc=8993;return;}
case 8993:cyc+=8;sub(10);
if(cyc>=evt){pc=8995;return;}
case 8995:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=8996;return;}
case 8996:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=8997;return;}
case 8997:cyc+=16;A=rd(49507);
if(cyc>=evt){pc=9000;return;}
case 9000:cyc+=8;C=0;
if(cyc>=evt){pc=9002;return;}
case 9002:cyc+=8;cp(10);
if(cyc>=evt){pc=9004;return;}
case 9004:cyc+=8;if(fc){cyc+=4;pc=9011;return;}
if(cyc>=evt){pc=9006;return;}
case 9006:cyc+=8;sub(10);
if(cyc>=evt){pc=9008;return;}
case 9008:cyc+=4;C=inc(C);
if(cyc>=evt){pc=9009;return;}
case 9009:cyc+=12;pc=9002;return;
case 9011:cyc+=4;B=A;
if(cyc>=evt){pc=9012;return;}
case 9012:cyc+=4;A=C;
if(cyc>=evt){pc=9013;return;}
case 9013:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=9014;return;}
case 9014:cyc+=4;A=B;
if(cyc>=evt){pc=9015;return;}
case 9015:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=9016;return;}
case 9016:cyc+=16;A=rd(49502);
if(cyc>=evt){pc=9019;return;}
case 9019:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=9020;return;}
case 9020:cyc+=12;B=193;C=201;
if(cyc>=evt){pc=9023;return;}
case 9023:cyc+=12;H=193;L=196;
if(cyc>=evt){pc=9026;return;}
case 9026:cyc+=24;push(9029);pc=14830;return;
if(cyc>=evt){pc=9029;return;}
case 9029:cyc+=24;push(9032);pc=14830;return;
if(cyc>=evt){pc=9032;return;}
case 9032:cyc+=24;push(9035);pc=14830;return;
if(cyc>=evt){pc=9035;return;}
case 9035:cyc+=4;xor(A);
if(cyc>=evt){pc=9036;return;}
case 9036:cyc+=16;wr(49482,A);
if(cyc>=evt){pc=9039;return;}
case 9039:cyc+=24;push(9042);pc=8304;return;
if(cyc>=evt){pc=9042;return;}
case 9042:cyc+=16;A=rd(49419);
if(cyc>=evt){pc=9045;return;}
case 9045:cyc+=8;sub(2);
if(cyc>=evt){pc=9047;return;}
case 9047:cyc+=16;wr(49418,A);
if(cyc>=evt){pc=9050;return;}
case 9050:cyc+=8;A=6;
if(cyc>=evt){pc=9052;return;}
case 9052:cyc+=24;push(9055);pc=14993;return;
if(cyc>=evt){pc=9055;return;}
case 9055:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=9058;return;}
case 9058:cyc+=8;cp(7);
if(cyc>=evt){pc=9060;return;}
case 9060:cyc+=8;if(fc){cyc+=4;pc=9128;return;}
if(cyc>=evt){pc=9062;return;}
case 9062:cyc+=8;cp(13);
if(cyc>=evt){pc=9064;return;}
case 9064:cyc+=8;if(fz){cyc+=4;pc=9131;return;}
if(cyc>=evt){pc=9066;return;}
case 9066:cyc+=8;cp(9);
if(cyc>=evt){pc=9068;return;}
case 9068:cyc+=8;if(!fc){cyc+=4;pc=9128;return;}
if(cyc>=evt){pc=9070;return;}
case 9070:cyc+=8;A=168;
if(cyc>=evt){pc=9072;return;}
case 9072:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=9075;return;}
case 9075:cyc+=8;A=10;
if(cyc>=evt){pc=9077;return;}
case 9077:cyc+=16;wr(49425,A);
if(cyc>=evt){pc=9080;return;}
case 9080:cyc+=4;xor(A);
if(cyc>=evt){pc=9081;return;}
case 9081:cyc+=16;wr(49505,A);
if(cyc>=evt){pc=9084;return;}
case 9084:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=9087;return;}
case 9087:cyc+=8;cp(8);
if(cyc>=evt){pc=9089;return;}
case 9089:cyc+=8;if(fz){cyc+=4;pc=9103;return;}
if(cyc>=evt){pc=9091;return;}
case 9091:cyc+=8;A=10;
if(cyc>=evt){pc=9093;return;}
case 9093:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=9096;return;}
case 9096:cyc+=8;A=177;
if(cyc>=evt){pc=9098;return;}
case 9098:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=9101;return;}
case 9101:cyc+=12;pc=9113;return;
case 9103:cyc+=8;A=22;
if(cyc>=evt){pc=9105;return;}
case 9105:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=9108;return;}
case 9108:cyc+=8;A=176;
if(cyc>=evt){pc=9110;return;}
case 9110:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=9113;return;}
case 9113:cyc+=8;A=1;
if(cyc>=evt){pc=9115;return;}
case 9115:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=9118;return;}
case 9118:cyc+=8;A=1;
if(cyc>=evt){pc=9120;return;}
case 9120:cyc+=16;wr(49437,A);
if(cyc>=evt){pc=9123;return;}
case 9123:cyc+=8;A=19;
if(cyc>=evt){pc=9125;return;}
case 9125:cyc+=24;push(9128);pc=14993;return;
if(cyc>=evt){pc=9128;return;}
case 9128:cyc+=24;push(9131);pc=14162;return;
if(cyc>=evt){pc=9131;return;}
case 9131:cyc+=24;push(9134);pc=12071;return;
if(cyc>=evt){pc=9134;return;}
case 9134:cyc+=24;push(9137);pc=14766;return;
if(cyc>=evt){pc=9137;return;}
case 9137:cyc+=24;push(9140);pc=13926;return;
if(cyc>=evt){pc=9140;return;}
case 9140:cyc+=24;push(9143);pc=7275;return;
if(cyc>=evt){pc=9143;return;}
case 9143:cyc+=24;push(9146);pc=14031;return;
if(cyc>=evt){pc=9146;return;}
case 9146:cyc+=24;push(9149);pc=8287;return;
if(cyc>=evt){pc=9149;return;}
case 9149:cyc+=12;if(!fz){cyc+=4;pc=2069;return;}
if(cyc>=evt){pc=9152;return;}
case 9152:cyc+=24;push(9155);pc=12071;return;
if(cyc>=evt){pc=9155;return;}
case 9155:cyc+=16;A=rd(49592);
if(cyc>=evt){pc=9158;return;}
case 9158:cyc+=8;cp(23);
if(cyc>=evt){pc=9160;return;}
case 9160:cyc+=8;if(fz){cyc+=4;pc=9175;return;}
if(cyc>=evt){pc=9162;return;}
case 9162:cyc+=16;A=rd(49595);
if(cyc>=evt){pc=9165;return;}
case 9165:cyc+=4;and(A);
if(cyc>=evt){pc=9166;return;}
case 9166:cyc+=8;if(!fz){cyc+=4;pc=9175;return;}
if(cyc>=evt){pc=9168;return;}
case 9168:cyc+=16;A=rd(49594);
if(cyc>=evt){pc=9171;return;}
case 9171:cyc+=8;cp(120);
if(cyc>=evt){pc=9173;return;}
case 9173:cyc+=8;if(fc){cyc+=4;pc=9143;return;}
if(cyc>=evt){pc=9175;return;}
case 9175:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=9178;return;}
case 9178:cyc+=8;cp(7);
if(cyc>=evt){pc=9180;return;}
case 9180:cyc+=8;if(!fz){cyc+=4;pc=9209;return;}
if(cyc>=evt){pc=9182;return;}
case 9182:cyc+=16;A=rd(49434);
if(cyc>=evt){pc=9185;return;}
case 9185:cyc+=4;and(A);
if(cyc>=evt){pc=9186;return;}
case 9186:cyc+=8;if(fz){cyc+=4;pc=9200;return;}
if(cyc>=evt){pc=9188;return;}
case 9188:cyc+=4;xor(A);
if(cyc>=evt){pc=9189;return;}
case 9189:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=9192;return;}
case 9192:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=9195;return;}
case 9195:cyc+=8;add(2);
if(cyc>=evt){pc=9197;return;}
case 9197:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=9200;return;}
case 9200:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=9203;return;}
case 9203:cyc+=8;cp(20);
if(cyc>=evt){pc=9205;return;}
case 9205:cyc+=8;if(fc){cyc+=4;pc=9224;return;}
if(cyc>=evt){pc=9207;return;}
case 9207:cyc+=12;pc=9229;return;
case 9209:cyc+=8;cp(8);
if(cyc>=evt){pc=9211;return;}
case 9211:cyc+=8;if(!fz){cyc+=4;pc=9229;return;}
if(cyc>=evt){pc=9213;return;}
case 9213:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=9216;return;}
case 9216:cyc+=8;cp(12);
if(cyc>=evt){pc=9218;return;}
case 9218:cyc+=8;if(!fc){cyc+=4;pc=9224;return;}
if(cyc>=evt){pc=9220;return;}
case 9220:cyc+=8;A=177;
if(cyc>=evt){pc=9222;return;}
case 9222:cyc+=12;pc=9226;return;
case 9224:cyc+=8;A=176;
if(cyc>=evt){pc=9226;return;}
case 9226:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=9229;return;}
case 9229:cyc+=24;push(9232);pc=15014;return;
if(cyc>=evt){pc=9232;return;}
case 9232:cyc+=12;pc=9143;return;
case 9234:cyc+=16;A=rd(49462);
if(cyc>=evt){pc=9237;return;}
case 9237:cyc+=4;and(A);
if(cyc>=evt){pc=9238;return;}
case 9238:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=9239;return;}
case 9239:cyc+=24;push(9242);pc=14912;return;
if(cyc>=evt){pc=9242;return;}
case 9242:cyc+=8;if(fz){cyc+=4;pc=9267;return;}
if(cyc>=evt){pc=9244;return;}
case 9244:cyc+=8;cp(59);
if(cyc>=evt){pc=9246;return;}
case 9246:cyc+=8;if(fc){cyc+=4;pc=9254;return;}
if(cyc>=evt){pc=9248;return;}
case 9248:cyc+=8;cp(77);
if(cyc>=evt){pc=9250;return;}
case 9250:cyc+=8;if(!fc){cyc+=4;pc=9254;return;}
if(cyc>=evt){pc=9252;return;}
case 9252:cyc+=8;sub(18);
if(cyc>=evt){pc=9254;return;}
case 9254:cyc+=4;E=A;
if(cyc>=evt){pc=9255;return;}
case 9255:cyc+=8;A=106;
if(cyc>=evt){pc=9257;return;}
case 9257:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=9260;return;}
case 9260:cyc+=24;push(9263);pc=10213;return;
if(cyc>=evt){pc=9263;return;}
case 9263:cyc+=24;push(9266);pc=14912;return;
if(cyc>=evt){pc=9266;return;}
case 9266:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=9267;return;}
case 9267:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=9270;return;}
case 9270:cyc+=8;cp(81);
if(cyc>=evt){pc=9272;return;}
case 9272:cyc+=8;if(fz){cyc+=4;pc=9332;return;}
if(cyc>=evt){pc=9274;return;}
case 9274:cyc+=8;cp(46);
if(cyc>=evt){pc=9276;return;}
case 9276:cyc+=8;if(fz){cyc+=4;pc=9360;return;}
if(cyc>=evt){pc=9278;return;}
case 9278:cyc+=8;cp(45);
if(cyc>=evt){pc=9280;return;}
case 9280:cyc+=8;if(fz){cyc+=4;pc=9332;return;}
if(cyc>=evt){pc=9282;return;}
case 9282:cyc+=8;cp(43);
if(cyc>=evt){pc=9284;return;}
case 9284:cyc+=8;if(fz){cyc+=4;pc=9360;return;}
if(cyc>=evt){pc=9286;return;}
case 9286:cyc+=8;cp(44);
if(cyc>=evt){pc=9288;return;}
case 9288:cyc+=12;if(!fz){cyc+=4;pc=9512;return;}
if(cyc>=evt){pc=9291;return;}
case 9291:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=9293;return;}
case 9293:cyc+=8;and(3);
if(cyc>=evt){pc=9295;return;}
case 9295:cyc+=8;if(fz){cyc+=4;pc=9304;return;}
if(cyc>=evt){pc=9297;return;}
case 9297:cyc+=8;E=45;
if(cyc>=evt){pc=9299;return;}
case 9299:cyc+=24;push(9302);pc=11339;return;
if(cyc>=evt){pc=9302;return;}
case 9302:cyc+=8;if(!fz){cyc+=4;pc=9343;return;}
if(cyc>=evt){pc=9304;return;}
case 9304:cyc+=12;H=193;L=85;
if(cyc>=evt){pc=9307;return;}
case 9307:cyc+=12;wr((H<<8|L),inc(rd((H<<8|L))));
if(cyc>=evt){pc=9308;return;}
case 9308:cyc+=24;push(9311);pc=11431;return;
if(cyc>=evt){pc=9311;return;}
case 9311:cyc+=12;if(!fz){cyc+=4;pc=9471;return;}
if(cyc>=evt){pc=9314;return;}
case 9314:cyc+=24;push(9317);pc=11413;return;
if(cyc>=evt){pc=9317;return;}
case 9317:cyc+=8;if(!fz){cyc+=4;pc=9436;return;}
if(cyc>=evt){pc=9319;return;}
case 9319:cyc+=16;A=rd(49493);
if(cyc>=evt){pc=9322;return;}
case 9322:cyc+=8;cp(1);
if(cyc>=evt){pc=9324;return;}
case 9324:cyc+=12;if(fz){cyc+=12;push(9327);pc=15135;return;}
if(cyc>=evt){pc=9327;return;}
case 9327:cyc+=8;E=45;
if(cyc>=evt){pc=9329;return;}
case 9329:cyc+=16;pc=9745;return;
case 9332:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=9334;return;}
case 9334:cyc+=8;and(3);
if(cyc>=evt){pc=9336;return;}
case 9336:cyc+=8;if(fz){cyc+=4;pc=9419;return;}
if(cyc>=evt){pc=9338;return;}
case 9338:cyc+=24;push(9341);pc=11339;return;
if(cyc>=evt){pc=9341;return;}
case 9341:cyc+=8;if(fz){cyc+=4;pc=9419;return;}
if(cyc>=evt){pc=9343;return;}
case 9343:cyc+=4;xor(A);
if(cyc>=evt){pc=9344;return;}
case 9344:cyc+=16;wr(49493,A);
pc=9347;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 9347:cyc+=24;push(9350);pc=11835;return;
if(cyc>=evt){pc=9350;return;}
case 9350:cyc+=8;E=56;
if(cyc>=evt){pc=9352;return;}
case 9352:cyc+=12;if(!fz){cyc+=4;pc=11312;return;}
if(cyc>=evt){pc=9355;return;}
case 9355:cyc+=8;E=57;
if(cyc>=evt){pc=9357;return;}
case 9357:cyc+=16;pc=11312;return;
case 9360:cyc+=16;A=rd(49493);
if(cyc>=evt){pc=9363;return;}
case 9363:cyc+=8;cp(1);
if(cyc>=evt){pc=9365;return;}
case 9365:cyc+=12;if(fz){cyc+=12;push(9368);pc=15135;return;}
if(cyc>=evt){pc=9368;return;}
case 9368:cyc+=8;cp(2);
if(cyc>=evt){pc=9370;return;}
case 9370:cyc+=8;if(!fc){cyc+=4;pc=9400;return;}
if(cyc>=evt){pc=9372;return;}
case 9372:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=9374;return;}
case 9374:cyc+=8;and(3);
if(cyc>=evt){pc=9376;return;}
case 9376:cyc+=8;if(fz){cyc+=4;pc=9400;return;}
if(cyc>=evt){pc=9378;return;}
case 9378:cyc+=24;push(9381);pc=11339;return;
if(cyc>=evt){pc=9381;return;}
case 9381:cyc+=8;if(fz){cyc+=4;pc=9400;return;}
if(cyc>=evt){pc=9383;return;}
case 9383:cyc+=4;xor(A);
if(cyc>=evt){pc=9384;return;}
case 9384:cyc+=16;wr(49493,A);
if(cyc>=evt){pc=9387;return;}
case 9387:cyc+=24;push(9390);pc=11835;return;
if(cyc>=evt){pc=9390;return;}
case 9390:cyc+=8;E=56;
if(cyc>=evt){pc=9392;return;}
case 9392:cyc+=12;if(!fz){cyc+=4;pc=11312;return;}
if(cyc>=evt){pc=9395;return;}
case 9395:cyc+=8;E=57;
if(cyc>=evt){pc=9397;return;}
case 9397:cyc+=16;pc=11312;return;
case 9400:cyc+=12;H=193;L=85;
if(cyc>=evt){pc=9403;return;}
case 9403:cyc+=12;wr((H<<8|L),inc(rd((H<<8|L))));
if(cyc>=evt){pc=9404;return;}
case 9404:cyc+=24;push(9407);pc=11431;return;
if(cyc>=evt){pc=9407;return;}
case 9407:cyc+=8;if(!fz){cyc+=4;pc=9471;return;}
if(cyc>=evt){pc=9409;return;}
case 9409:cyc+=24;push(9412);pc=11760;return;
if(cyc>=evt){pc=9412;return;}
case 9412:cyc+=8;E=46;
if(cyc>=evt){pc=9414;return;}
case 9414:cyc+=12;if(fz){cyc+=4;pc=11364;return;}
if(cyc>=evt){pc=9417;return;}
case 9417:cyc+=12;pc=9436;return;
case 9419:cyc+=12;H=193;L=85;
if(cyc>=evt){pc=9422;return;}
case 9422:cyc+=12;wr((H<<8|L),inc(rd((H<<8|L))));
if(cyc>=evt){pc=9423;return;}
case 9423:cyc+=24;push(9426);pc=11431;return;
if(cyc>=evt){pc=9426;return;}
case 9426:cyc+=8;if(!fz){cyc+=4;pc=9471;return;}
if(cyc>=evt){pc=9428;return;}
case 9428:cyc+=24;push(9431);pc=11413;return;
if(cyc>=evt){pc=9431;return;}
case 9431:cyc+=8;E=46;
if(cyc>=evt){pc=9433;return;}
case 9433:cyc+=12;if(fz){cyc+=4;pc=11364;return;}
if(cyc>=evt){pc=9436;return;}
case 9436:cyc+=16;A=rd(49419);
if(cyc>=evt){pc=9439;return;}
case 9439:cyc+=8;cp(10);
if(cyc>=evt){pc=9441;return;}
case 9441:cyc+=8;if(!fz){cyc+=4;pc=9455;return;}
if(cyc>=evt){pc=9443;return;}
case 9443:cyc+=8;A=5;
if(cyc>=evt){pc=9445;return;}
case 9445:cyc+=16;wr(49419,A);
if(cyc>=evt){pc=9448;return;}
case 9448:cyc+=4;xor(A);
if(cyc>=evt){pc=9449;return;}
case 9449:cyc+=16;wr(49520,A);
if(cyc>=evt){pc=9452;return;}
case 9452:cyc+=8;A=1;
if(cyc>=evt){pc=9454;return;}
case 9454:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=9455;return;}
case 9455:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=9456;return;}
case 9456:cyc+=8;E=77;
if(cyc>=evt){pc=9458;return;}
case 9458:cyc+=8;cp(1);
if(cyc>=evt){pc=9460;return;}
case 9460:cyc+=8;if(fz){cyc+=4;pc=9505;return;}
if(cyc>=evt){pc=9462;return;}
case 9462:cyc+=24;push(9465);pc=14864;return;
if(cyc>=evt){pc=9465;return;}
case 9465:cyc+=8;if(!fz){cyc+=4;pc=9499;return;}
if(cyc>=evt){pc=9467;return;}
case 9467:cyc+=8;E=80;
if(cyc>=evt){pc=9469;return;}
case 9469:cyc+=12;pc=9477;return;
case 9471:cyc+=8;E=88;
if(cyc>=evt){pc=9473;return;}
case 9473:cyc+=4;xor(A);
if(cyc>=evt){pc=9474;return;}
case 9474:cyc+=16;wr(49423,A);
if(cyc>=evt){pc=9477;return;}
case 9477:cyc+=4;xor(A);
if(cyc>=evt){pc=9478;return;}
case 9478:cyc+=16;wr(49501,A);
if(cyc>=evt){pc=9481;return;}
case 9481:cyc+=16;wr(49510,A);
if(cyc>=evt){pc=9484;return;}
case 9484:cyc+=8;A=1;
if(cyc>=evt){pc=9486;return;}
case 9486:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=9489;return;}
case 9489:cyc+=16;wr(49499,A);
if(cyc>=evt){pc=9492;return;}
case 9492:cyc+=8;A=7;
if(cyc>=evt){pc=9494;return;}
case 9494:cyc+=24;push(9497);pc=14993;return;
if(cyc>=evt){pc=9497;return;}
case 9497:cyc+=12;pc=9505;return;
case 9499:cyc+=4;E=inc(E);
if(cyc>=evt){pc=9500;return;}
case 9500:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=9501;return;}
case 9501:cyc+=8;cp(3);
if(cyc>=evt){pc=9503;return;}
case 9503:cyc+=8;if(!fc){cyc+=4;pc=9467;return;}
if(cyc>=evt){pc=9505;return;}
case 9505:cyc+=4;xor(A);
if(cyc>=evt){pc=9506;return;}
case 9506:cyc+=16;wr(49493,A);
if(cyc>=evt){pc=9509;return;}
case 9509:cyc+=16;pc=10425;return;
case 9512:cyc+=8;cp(47);
if(cyc>=evt){pc=9514;return;}
case 9514:cyc+=12;if(fc){cyc+=4;pc=9696;return;}
if(cyc>=evt){pc=9517;return;}
case 9517:cyc+=8;if(!fz){cyc+=4;pc=9532;return;}
if(cyc>=evt){pc=9519;return;}
case 9519:cyc+=24;push(9522);pc=11835;return;
if(cyc>=evt){pc=9522;return;}
case 9522:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=9525;return;}
case 9525:cyc+=8;if(fz){cyc+=4;pc=9532;return;}
if(cyc>=evt){pc=9527;return;}
case 9527:cyc+=8;E=53;
if(cyc>=evt){pc=9529;return;}
case 9529:cyc+=16;pc=11312;return;
case 9532:cyc+=8;cp(57);
if(cyc>=evt){pc=9534;return;}
case 9534:cyc+=8;if(!fz){cyc+=4;pc=9548;return;}
if(cyc>=evt){pc=9536;return;}
case 9536:cyc+=8;E=48;
if(cyc>=evt){pc=9538;return;}
case 9538:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=9540;return;}
case 9540:cyc+=8;fz=(A>>6)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=9542;return;}
case 9542:cyc+=8;and(3);
if(cyc>=evt){pc=9544;return;}
case 9544:cyc+=8;if(fz){cyc+=4;pc=9574;return;}
if(cyc>=evt){pc=9546;return;}
case 9546:cyc+=12;pc=9566;return;
case 9548:cyc+=8;cp(51);
if(cyc>=evt){pc=9550;return;}
case 9550:cyc+=8;if(fz){cyc+=4;pc=9574;return;}
if(cyc>=evt){pc=9552;return;}
case 9552:cyc+=8;if(!fc){cyc+=4;pc=9587;return;}
if(cyc>=evt){pc=9554;return;}
case 9554:cyc+=4;A=inc(A);
if(cyc>=evt){pc=9555;return;}
case 9555:cyc+=4;E=A;
if(cyc>=evt){pc=9556;return;}
case 9556:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=9558;return;}
case 9558:cyc+=8;fz=(A>>6)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=9560;return;}
case 9560:cyc+=8;if(!fz){cyc+=4;pc=9597;return;}
if(cyc>=evt){pc=9562;return;}
case 9562:cyc+=8;and(3);
if(cyc>=evt){pc=9564;return;}
case 9564:cyc+=8;if(fz){cyc+=4;pc=9574;return;}
if(cyc>=evt){pc=9566;return;}
case 9566:cyc+=24;push(9569);pc=11339;return;
if(cyc>=evt){pc=9569;return;}
case 9569:cyc+=8;if(fz){cyc+=4;pc=9574;return;}
if(cyc>=evt){pc=9571;return;}
case 9571:cyc+=16;pc=11312;return;
case 9574:cyc+=8;E=52;
if(cyc>=evt){pc=9576;return;}
case 9576:cyc+=24;push(9579);pc=11413;return;
if(cyc>=evt){pc=9579;return;}
case 9579:cyc+=12;if(!fz){cyc+=4;pc=11312;return;}
if(cyc>=evt){pc=9582;return;}
case 9582:cyc+=8;E=81;
if(cyc>=evt){pc=9584;return;}
case 9584:cyc+=16;pc=10425;return;
case 9587:cyc+=8;cp(53);
if(cyc>=evt){pc=9589;return;}
case 9589:cyc+=8;if(!fz){cyc+=4;pc=9611;return;}
if(cyc>=evt){pc=9591;return;}
case 9591:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=9593;return;}
case 9593:cyc+=8;fz=(A>>6)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=9595;return;}
case 9595:cyc+=8;if(fz){cyc+=4;pc=9606;return;}
if(cyc>=evt){pc=9597;return;}
case 9597:cyc+=8;E=55;
if(cyc>=evt){pc=9599;return;}
case 9599:cyc+=4;xor(A);
if(cyc>=evt){pc=9600;return;}
case 9600:cyc+=16;wr(49524,A);
if(cyc>=evt){pc=9603;return;}
case 9603:cyc+=16;pc=11271;return;
case 9606:cyc+=8;and(3);
if(cyc>=evt){pc=9608;return;}
case 9608:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=9609;return;}
case 9609:cyc+=12;pc=9574;return;
case 9611:cyc+=8;cp(54);
if(cyc>=evt){pc=9613;return;}
case 9613:cyc+=8;if(!fz){cyc+=4;pc=9696;return;}
if(cyc>=evt){pc=9615;return;}
case 9615:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=9618;return;}
case 9618:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=9620;return;}
case 9620:cyc+=8;if(!fz){cyc+=4;pc=9630;return;}
if(cyc>=evt){pc=9622;return;}
case 9622:cyc+=24;push(9625);pc=13378;return;
if(cyc>=evt){pc=9625;return;}
case 9625:cyc+=12;B=255;C=0;
if(cyc>=evt){pc=9628;return;}
case 9628:cyc+=12;pc=9636;return;
case 9630:cyc+=24;push(9633);pc=13406;return;
if(cyc>=evt){pc=9633;return;}
case 9633:cyc+=12;B=255;C=255;
if(cyc>=evt){pc=9636;return;}
case 9636:cyc+=24;push(9639);pc=14220;return;
if(cyc>=evt){pc=9639;return;}
case 9639:cyc+=8;cp(11);
if(cyc>=evt){pc=9641;return;}
case 9641:cyc+=8;if(!fz){cyc+=4;pc=9664;return;}
if(cyc>=evt){pc=9643;return;}
case 9643:cyc+=24;push(9646);pc=11870;return;
if(cyc>=evt){pc=9646;return;}
case 9646:cyc+=4;A=B;
if(cyc>=evt){pc=9647;return;}
case 9647:cyc+=16;wr(49521,A);
if(cyc>=evt){pc=9650;return;}
case 9650:cyc+=4;A=C;
if(cyc>=evt){pc=9651;return;}
case 9651:cyc+=16;wr(49522,A);
if(cyc>=evt){pc=9654;return;}
case 9654:cyc+=8;A=4;
if(cyc>=evt){pc=9656;return;}
case 9656:cyc+=16;wr(49523,A);
if(cyc>=evt){pc=9659;return;}
case 9659:cyc+=8;E=58;
if(cyc>=evt){pc=9661;return;}
case 9661:cyc+=16;pc=10425;return;
case 9664:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=9666;return;}
case 9666:cyc+=8;fz=(A>>6)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=9668;return;}
case 9668:cyc+=12;if(!fz){cyc+=4;pc=9802;return;}
if(cyc>=evt){pc=9671;return;}
case 9671:cyc+=8;E=58;
if(cyc>=evt){pc=9673;return;}
case 9673:cyc+=8;and(3);
if(cyc>=evt){pc=9675;return;}
case 9675:cyc+=12;if(fz){cyc+=4;pc=11271;return;}
if(cyc>=evt){pc=9678;return;}
case 9678:cyc+=24;push(9681);pc=11835;return;
if(cyc>=evt){pc=9681;return;}
case 9681:cyc+=8;A=0;
if(cyc>=evt){pc=9683;return;}
case 9683:cyc+=16;wr(49524,A);
if(cyc>=evt){pc=9686;return;}
case 9686:cyc+=8;E=53;
if(cyc>=evt){pc=9688;return;}
case 9688:cyc+=12;if(!fz){cyc+=4;pc=11271;return;}
if(cyc>=evt){pc=9691;return;}
case 9691:cyc+=8;E=48;
if(cyc>=evt){pc=9693;return;}
case 9693:cyc+=16;pc=11271;return;
case 9696:cyc+=8;cp(11);
if(cyc>=evt){pc=9698;return;}
case 9698:cyc+=8;if(!fz){cyc+=4;pc=9713;return;}
if(cyc>=evt){pc=9700;return;}
case 9700:cyc+=8;E=12;
if(cyc>=evt){pc=9702;return;}
case 9702:cyc+=24;push(9705);pc=11413;return;
if(cyc>=evt){pc=9705;return;}
case 9705:cyc+=12;if(!fz){cyc+=4;pc=10425;return;}
if(cyc>=evt){pc=9708;return;}
case 9708:cyc+=8;E=46;
if(cyc>=evt){pc=9710;return;}
case 9710:cyc+=16;pc=10425;return;
case 9713:cyc+=8;cp(78);
if(cyc>=evt){pc=9715;return;}
case 9715:cyc+=8;if(!fz){cyc+=4;pc=9722;return;}
if(cyc>=evt){pc=9717;return;}
case 9717:cyc+=8;E=79;
if(cyc>=evt){pc=9719;return;}
case 9719:cyc+=16;pc=10425;return;
case 9722:cyc+=8;cp(90);
if(cyc>=evt){pc=9724;return;}
case 9724:cyc+=8;if(!fz){cyc+=4;pc=9739;return;}
if(cyc>=evt){pc=9726;return;}
case 9726:cyc+=8;E=91;
if(cyc>=evt){pc=9728;return;}
case 9728:cyc+=24;push(9731);pc=11413;return;
if(cyc>=evt){pc=9731;return;}
case 9731:cyc+=12;if(!fz){cyc+=4;pc=10425;return;}
if(cyc>=evt){pc=9734;return;}
case 9734:cyc+=8;E=46;
if(cyc>=evt){pc=9736;return;}
case 9736:cyc+=16;pc=10425;return;
case 9739:cyc+=8;cp(91);
if(cyc>=evt){pc=9741;return;}
case 9741:cyc+=8;if(!fz){cyc+=4;pc=9754;return;}
if(cyc>=evt){pc=9743;return;}
case 9743:cyc+=8;E=92;
if(cyc>=evt){pc=9745;return;}
case 9745:cyc+=24;push(9748);pc=11835;return;
if(cyc>=evt){pc=9748;return;}
case 9748:cyc+=12;if(fz){cyc+=4;pc=11364;return;}
if(cyc>=evt){pc=9751;return;}
case 9751:cyc+=16;pc=10395;return;
case 9754:cyc+=8;cp(93);
if(cyc>=evt){pc=9756;return;}
case 9756:cyc+=8;if(!fz){cyc+=4;pc=9776;return;}
if(cyc>=evt){pc=9758;return;}
case 9758:cyc+=24;push(9761);pc=11431;return;
if(cyc>=evt){pc=9761;return;}
case 9761:cyc+=12;if(!fz){cyc+=4;pc=9471;return;}
if(cyc>=evt){pc=9764;return;}
case 9764:cyc+=24;push(9767);pc=11413;return;
if(cyc>=evt){pc=9767;return;}
case 9767:cyc+=8;E=44;
if(cyc>=evt){pc=9769;return;}
case 9769:cyc+=8;if(fz){cyc+=4;pc=9745;return;}
if(cyc>=evt){pc=9771;return;}
case 9771:cyc+=8;E=94;
if(cyc>=evt){pc=9773;return;}
case 9773:cyc+=16;pc=10425;return;
case 9776:cyc+=8;cp(95);
if(cyc>=evt){pc=9778;return;}
case 9778:cyc+=8;if(!fz){cyc+=4;pc=9793;return;}
if(cyc>=evt){pc=9780;return;}
case 9780:cyc+=24;push(9783);pc=11760;return;
if(cyc>=evt){pc=9783;return;}
case 9783:cyc+=8;E=43;
if(cyc>=evt){pc=9785;return;}
case 9785:cyc+=12;if(fz){cyc+=4;pc=10461;return;}
if(cyc>=evt){pc=9788;return;}
case 9788:cyc+=8;E=98;
if(cyc>=evt){pc=9790;return;}
case 9790:cyc+=16;pc=10425;return;
case 9793:cyc+=8;cp(3);
if(cyc>=evt){pc=9795;return;}
case 9795:cyc+=8;if(!fz){cyc+=4;pc=9802;return;}
if(cyc>=evt){pc=9797;return;}
case 9797:cyc+=8;E=2;
if(cyc>=evt){pc=9799;return;}
case 9799:cyc+=16;pc=10425;return;
case 9802:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=9805;return;}
case 9805:cyc+=8;cp(102);
if(cyc>=evt){pc=9807;return;}
case 9807:cyc+=8;if(!fz){cyc+=4;pc=9827;return;}
if(cyc>=evt){pc=9809;return;}
case 9809:cyc+=24;push(9812);pc=11431;return;
if(cyc>=evt){pc=9812;return;}
case 9812:cyc+=12;if(!fz){cyc+=4;pc=9471;return;}
if(cyc>=evt){pc=9815;return;}
case 9815:cyc+=24;push(9818);pc=11413;return;
if(cyc>=evt){pc=9818;return;}
case 9818:cyc+=8;E=44;
if(cyc>=evt){pc=9820;return;}
case 9820:cyc+=8;if(fz){cyc+=4;pc=9745;return;}
if(cyc>=evt){pc=9822;return;}
case 9822:cyc+=8;E=103;
if(cyc>=evt){pc=9824;return;}
case 9824:cyc+=16;pc=10425;return;
case 9827:cyc+=8;cp(9);
if(cyc>=evt){pc=9829;return;}
case 9829:cyc+=8;if(!fz){cyc+=4;pc=9893;return;}
if(cyc>=evt){pc=9831;return;}
case 9831:cyc+=24;push(9834);pc=11780;return;
if(cyc>=evt){pc=9834;return;}
case 9834:cyc+=8;if(!fz){cyc+=4;pc=9855;return;}
if(cyc>=evt){pc=9836;return;}
case 9836:cyc+=24;push(9839);pc=11870;return;
if(cyc>=evt){pc=9839;return;}
case 9839:cyc+=8;E=1;
if(cyc>=evt){pc=9841;return;}
case 9841:cyc+=24;push(9844);pc=11964;return;
if(cyc>=evt){pc=9844;return;}
case 9844:cyc+=16;A=rd(49517);
if(cyc>=evt){pc=9847;return;}
case 9847:cyc+=16;wr(49519,A);
if(cyc>=evt){pc=9850;return;}
case 9850:cyc+=8;E=13;
if(cyc>=evt){pc=9852;return;}
case 9852:cyc+=16;pc=10425;return;
case 9855:cyc+=24;push(9858);pc=11803;return;
pc=9858;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 9858:cyc+=8;if(!fz){cyc+=4;pc=9886;return;}
if(cyc>=evt){pc=9860;return;}
case 9860:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=9861;return;}
case 9861:cyc+=12;B=18;C=2;
if(cyc>=evt){pc=9864;return;}
case 9864:cyc+=24;push(9867);pc=14894;return;
if(cyc>=evt){pc=9867;return;}
case 9867:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=9868;return;}
case 9868:cyc+=8;if(fz){cyc+=4;pc=9886;return;}
if(cyc>=evt){pc=9870;return;}
case 9870:cyc+=24;push(9873);pc=11870;return;
if(cyc>=evt){pc=9873;return;}
case 9873:cyc+=8;E=1;
if(cyc>=evt){pc=9875;return;}
case 9875:cyc+=24;push(9878);pc=11964;return;
if(cyc>=evt){pc=9878;return;}
case 9878:cyc+=8;A=21;
if(cyc>=evt){pc=9880;return;}
case 9880:cyc+=24;push(9883);pc=14993;return;
if(cyc>=evt){pc=9883;return;}
case 9883:cyc+=16;pc=10773;return;
case 9886:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=9888;return;}
case 9888:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=9890;return;}
case 9890:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=9891;return;}
case 9891:cyc+=12;pc=9908;return;
case 9893:cyc+=8;cp(39);
if(cyc>=evt){pc=9895;return;}
case 9895:cyc+=8;if(!fz){cyc+=4;pc=9913;return;}
if(cyc>=evt){pc=9897;return;}
case 9897:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=9900;return;}
case 9900:cyc+=24;push(9903);pc=11870;return;
if(cyc>=evt){pc=9903;return;}
case 9903:cyc+=8;E=22;
if(cyc>=evt){pc=9905;return;}
case 9905:cyc+=24;push(9908);pc=11964;return;
if(cyc>=evt){pc=9908;return;}
case 9908:cyc+=8;E=10;
if(cyc>=evt){pc=9910;return;}
case 9910:cyc+=16;pc=10425;return;
case 9913:cyc+=8;cp(15);
if(cyc>=evt){pc=9915;return;}
case 9915:cyc+=8;if(!fz){cyc+=4;pc=10017;return;}
if(cyc>=evt){pc=9917;return;}
case 9917:cyc+=8;E=0;
if(cyc>=evt){pc=9919;return;}
case 9919:cyc+=16;A=rd(49519);
if(cyc>=evt){pc=9922;return;}
case 9922:cyc+=8;cp(64);
if(cyc>=evt){pc=9924;return;}
case 9924:cyc+=8;if(!fz){cyc+=4;pc=9952;return;}
if(cyc>=evt){pc=9926;return;}
case 9926:cyc+=8;A=1;
if(cyc>=evt){pc=9928;return;}
case 9928:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=9931;return;}
case 9931:cyc+=16;A=rd(49502);
if(cyc>=evt){pc=9934;return;}
case 9934:cyc+=4;A=inc(A);
if(cyc>=evt){pc=9935;return;}
case 9935:cyc+=8;cp(10);
if(cyc>=evt){pc=9937;return;}
case 9937:cyc+=8;if(!fc){cyc+=4;pc=9945;return;}
if(cyc>=evt){pc=9939;return;}
case 9939:cyc+=16;wr(49502,A);
if(cyc>=evt){pc=9942;return;}
case 9942:cyc+=16;wr(49501,A);
if(cyc>=evt){pc=9945;return;}
case 9945:cyc+=8;A=12;
if(cyc>=evt){pc=9947;return;}
case 9947:cyc+=24;push(9950);pc=14993;return;
if(cyc>=evt){pc=9950;return;}
case 9950:cyc+=12;pc=10012;return;
case 9952:cyc+=8;cp(160);
if(cyc>=evt){pc=9954;return;}
case 9954:cyc+=8;if(!fz){cyc+=4;pc=9972;return;}
if(cyc>=evt){pc=9956;return;}
case 9956:cyc+=8;E=16;
if(cyc>=evt){pc=9958;return;}
case 9958:cyc+=24;push(9961);pc=14864;return;
if(cyc>=evt){pc=9961;return;}
case 9961:cyc+=8;if(!fz){cyc+=4;pc=10012;return;}
if(cyc>=evt){pc=9963;return;}
case 9963:cyc+=8;E=17;
if(cyc>=evt){pc=9965;return;}
case 9965:cyc+=8;A=7;
if(cyc>=evt){pc=9967;return;}
case 9967:cyc+=24;push(9970);pc=14993;return;
if(cyc>=evt){pc=9970;return;}
case 9970:cyc+=12;pc=10012;return;
case 9972:cyc+=8;cp(96);
if(cyc>=evt){pc=9974;return;}
case 9974:cyc+=8;if(!fz){cyc+=4;pc=9986;return;}
if(cyc>=evt){pc=9976;return;}
case 9976:cyc+=16;wr(49520,A);
if(cyc>=evt){pc=9979;return;}
case 9979:cyc+=8;A=4;
if(cyc>=evt){pc=9981;return;}
case 9981:cyc+=24;push(9984);pc=14993;return;
if(cyc>=evt){pc=9984;return;}
case 9984:cyc+=12;pc=10012;return;
case 9986:cyc+=12;H=193;L=93;
if(cyc>=evt){pc=9989;return;}
case 9989:cyc+=12;wr((H<<8|L),inc(rd((H<<8|L))));
if(cyc>=evt){pc=9990;return;}
case 9990:cyc+=8;A=1;
if(cyc>=evt){pc=9992;return;}
case 9992:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=9995;return;}
case 9995:cyc+=8;C=11;
if(cyc>=evt){pc=9997;return;}
case 9997:cyc+=16;A=rd(49502);
if(cyc>=evt){pc=10000;return;}
case 10000:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=10001;return;}
case 10001:cyc+=8;if(!fc){cyc+=4;pc=10008;return;}
if(cyc>=evt){pc=10003;return;}
case 10003:cyc+=16;wr(49501,A);
if(cyc>=evt){pc=10006;return;}
case 10006:cyc+=8;C=0;
if(cyc>=evt){pc=10008;return;}
case 10008:cyc+=4;A=C;
if(cyc>=evt){pc=10009;return;}
case 10009:cyc+=24;push(10012);pc=14993;return;
if(cyc>=evt){pc=10012;return;}
case 10012:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=10013;return;}
case 10013:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=10014;return;}
case 10014:cyc+=16;pc=10425;return;
case 10017:cyc+=8;cp(104);
if(cyc>=evt){pc=10019;return;}
case 10019:cyc+=8;if(!fz){cyc+=4;pc=10027;return;}
if(cyc>=evt){pc=10021;return;}
case 10021:cyc+=8;A=1;
if(cyc>=evt){pc=10023;return;}
case 10023:cyc+=16;wr(49512,A);
if(cyc>=evt){pc=10026;return;}
case 10026:cyc+=16;pc=pop();return;
case 10027:cyc+=16;A=rd(49510);
if(cyc>=evt){pc=10030;return;}
case 10030:cyc+=8;cp(5);
if(cyc>=evt){pc=10032;return;}
case 10032:cyc+=12;if(!fc){cyc+=4;pc=10165;return;}
if(cyc>=evt){pc=10035;return;}
case 10035:cyc+=24;push(10038);pc=14912;return;
if(cyc>=evt){pc=10038;return;}
case 10038:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10039;return;}
case 10039:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=10042;return;}
case 10042:cyc+=8;cp(37);
if(cyc>=evt){pc=10044;return;}
case 10044:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10045;return;}
case 10045:cyc+=8;cp(32);
if(cyc>=evt){pc=10047;return;}
case 10047:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10048;return;}
case 10048:cyc+=8;cp(20);
if(cyc>=evt){pc=10050;return;}
case 10050:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10051;return;}
case 10051:cyc+=8;cp(21);
if(cyc>=evt){pc=10053;return;}
case 10053:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10054;return;}
case 10054:cyc+=8;cp(34);
if(cyc>=evt){pc=10056;return;}
case 10056:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10057;return;}
case 10057:cyc+=16;A=rd(49459);
if(cyc>=evt){pc=10060;return;}
case 10060:cyc+=8;cp(124);
if(cyc>=evt){pc=10062;return;}
case 10062:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10063;return;}
case 10063:cyc+=8;cp(111);
if(cyc>=evt){pc=10065;return;}
case 10065:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10066;return;}
case 10066:cyc+=8;cp(112);
if(cyc>=evt){pc=10068;return;}
case 10068:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10069;return;}
case 10069:cyc+=16;A=rd(49511);
if(cyc>=evt){pc=10072;return;}
case 10072:cyc+=8;cp(3);
if(cyc>=evt){pc=10074;return;}
case 10074:cyc+=8;if(!fz){cyc+=4;pc=10127;return;}
if(cyc>=evt){pc=10076;return;}
case 10076:cyc+=16;A=rd(49459);
if(cyc>=evt){pc=10079;return;}
case 10079:cyc+=8;cp(118);
if(cyc>=evt){pc=10081;return;}
case 10081:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10082;return;}
case 10082:cyc+=8;cp(122);
if(cyc>=evt){pc=10084;return;}
case 10084:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10085;return;}
case 10085:cyc+=8;cp(123);
if(cyc>=evt){pc=10087;return;}
case 10087:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10088;return;}
case 10088:cyc+=24;push(10091);pc=4901;return;
if(cyc>=evt){pc=10091;return;}
case 10091:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=10093;return;}
case 10093:cyc+=8;fz=(A>>5)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10095;return;}
case 10095:cyc+=12;if(!fz){cyc+=4;pc=10559;return;}
if(cyc>=evt){pc=10098;return;}
case 10098:cyc+=8;fz=(A>>4)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10100;return;}
case 10100:cyc+=12;if(!fz){cyc+=4;pc=10634;return;}
if(cyc>=evt){pc=10103;return;}
case 10103:cyc+=16;A=rd(49415);
if(cyc>=evt){pc=10106;return;}
case 10106:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10108;return;}
case 10108:cyc+=12;if(!fz){cyc+=4;pc=10747;return;}
if(cyc>=evt){pc=10111;return;}
case 10111:cyc+=8;fz=(A>>6)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10113;return;}
case 10113:cyc+=12;if(!fz){cyc+=4;pc=11002;return;}
if(cyc>=evt){pc=10116;return;}
case 10116:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10118;return;}
case 10118:cyc+=12;if(!fz){cyc+=4;pc=10824;return;}
if(cyc>=evt){pc=10121;return;}
case 10121:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10123;return;}
case 10123:cyc+=12;if(!fz){cyc+=4;pc=11002;return;}
if(cyc>=evt){pc=10126;return;}
case 10126:cyc+=16;pc=pop();return;
case 10127:cyc+=24;push(10130);pc=4880;return;
if(cyc>=evt){pc=10130;return;}
case 10130:cyc+=12;A=rd(65419);
if(cyc>=evt){pc=10132;return;}
case 10132:cyc+=8;fz=(A>>5)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10134;return;}
case 10134:cyc+=12;if(!fz){cyc+=4;pc=11007;return;}
if(cyc>=evt){pc=10137;return;}
case 10137:cyc+=8;fz=(A>>4)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10139;return;}
case 10139:cyc+=12;if(!fz){cyc+=4;pc=11015;return;}
if(cyc>=evt){pc=10142;return;}
case 10142:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10144;return;}
case 10144:cyc+=12;if(!fz){cyc+=4;pc=11121;return;}
if(cyc>=evt){pc=10147;return;}
case 10147:cyc+=8;fz=(A>>6)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10149;return;}
case 10149:cyc+=12;if(!fz){cyc+=4;pc=11183;return;}
if(cyc>=evt){pc=10152;return;}
case 10152:cyc+=16;A=rd(49415);
if(cyc>=evt){pc=10155;return;}
case 10155:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10157;return;}
case 10157:cyc+=12;if(!fz){cyc+=4;pc=10488;return;}
if(cyc>=evt){pc=10160;return;}
case 10160:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10162;return;}
case 10162:cyc+=12;if(!fz){cyc+=4;pc=10525;return;}
if(cyc>=evt){pc=10165;return;}
case 10165:cyc+=8;E=0;
if(cyc>=evt){pc=10167;return;}
case 10167:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=10170;return;}
case 10170:cyc+=8;cp(0);
if(cyc>=evt){pc=10172;return;}
case 10172:cyc+=8;if(!fz){cyc+=4;pc=10185;return;}
if(cyc>=evt){pc=10174;return;}
case 10174:cyc+=24;push(10177);pc=11413;return;
if(cyc>=evt){pc=10177;return;}
case 10177:cyc+=12;if(!fz){cyc+=4;pc=10425;return;}
if(cyc>=evt){pc=10180;return;}
case 10180:cyc+=8;E=46;
if(cyc>=evt){pc=10182;return;}
case 10182:cyc+=16;pc=10425;return;
case 10185:cyc+=8;cp(103);
if(cyc>=evt){pc=10187;return;}
case 10187:cyc+=8;if(fz){cyc+=4;pc=10211;return;}
if(cyc>=evt){pc=10189;return;}
case 10189:cyc+=8;cp(4);
if(cyc>=evt){pc=10191;return;}
case 10191:cyc+=12;if(fc){cyc+=4;pc=10425;return;}
if(cyc>=evt){pc=10194;return;}
case 10194:cyc+=8;cp(8);
if(cyc>=evt){pc=10196;return;}
case 10196:cyc+=8;if(!fz){cyc+=4;pc=10209;return;}
if(cyc>=evt){pc=10198;return;}
case 10198:cyc+=24;push(10201);pc=11413;return;
if(cyc>=evt){pc=10201;return;}
case 10201:cyc+=12;if(!fz){cyc+=4;pc=10425;return;}
if(cyc>=evt){pc=10204;return;}
case 10204:cyc+=8;E=46;
if(cyc>=evt){pc=10206;return;}
case 10206:cyc+=16;pc=10425;return;
case 10209:cyc+=8;if(!fc){cyc+=4;pc=10213;return;}
if(cyc>=evt){pc=10211;return;}
case 10211:cyc+=8;E=8;
if(cyc>=evt){pc=10213;return;}
case 10213:cyc+=8;A=10;
if(cyc>=evt){pc=10215;return;}
case 10215:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=10218;return;}
case 10218:cyc+=8;D=0;
if(cyc>=evt){pc=10220;return;}
case 10220:cyc+=12;H=71;L=188;
if(cyc>=evt){pc=10223;return;}
case 10223:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=10224;return;}
case 10224:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=10227;return;}
case 10227:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10229;return;}
case 10229:cyc+=8;if(fz){cyc+=4;pc=10237;return;}
if(cyc>=evt){pc=10231;return;}
case 10231:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=10234;return;}
case 10234:cyc+=8;sub(rd((H<<8|L)));
if(cyc>=evt){pc=10235;return;}
case 10235:cyc+=12;pc=10241;return;
case 10237:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=10240;return;}
case 10240:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=10241;return;}
case 10241:cyc+=16;wr(49427,A);
if(cyc>=evt){pc=10244;return;}
case 10244:cyc+=4;C=A;
if(cyc>=evt){pc=10245;return;}
case 10245:cyc+=12;H=73;L=36;
if(cyc>=evt){pc=10248;return;}
case 10248:cyc+=8;addhl((D<<8|E));
if(cyc>=evt){pc=10249;return;}
case 10249:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=10252;return;}
case 10252:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=10253;return;}
case 10253:cyc+=16;wr(49428,A);
if(cyc>=evt){pc=10256;return;}
case 10256:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=10259;return;}
case 10259:cyc+=4;cp(C);
if(cyc>=evt){pc=10260;return;}
case 10260:cyc+=12;if(fz){cyc+=4;pc=11364;return;}
if(cyc>=evt){pc=10263;return;}
case 10263:cyc+=24;push(10266);pc=13458;return;
if(cyc>=evt){pc=10266;return;}
case 10266:cyc+=24;push(10269);pc=13498;return;
if(cyc>=evt){pc=10269;return;}
case 10269:cyc+=4;C=A;
if(cyc>=evt){pc=10270;return;}
case 10270:cyc+=24;push(10273);pc=13304;return;
if(cyc>=evt){pc=10273;return;}
case 10273:cyc+=24;push(10276);pc=13498;return;
if(cyc>=evt){pc=10276;return;}
case 10276:cyc+=4;B=A;
if(cyc>=evt){pc=10277;return;}
case 10277:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=10280;return;}
case 10280:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10282;return;}
case 10282:cyc+=8;if(fz){cyc+=4;pc=10324;return;}
if(cyc>=evt){pc=10284;return;}
case 10284:cyc+=8;A=25;
if(cyc>=evt){pc=10286;return;}
case 10286:cyc+=4;cp(E);
if(cyc>=evt){pc=10287;return;}
case 10287:cyc+=8;if(fz){cyc+=4;pc=10324;return;}
if(cyc>=evt){pc=10289;return;}
case 10289:cyc+=8;fz=(C>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10291;return;}
case 10291:cyc+=8;if(!fz){cyc+=4;pc=10395;return;}
if(cyc>=evt){pc=10293;return;}
case 10293:cyc+=4;A=E;
if(cyc>=evt){pc=10294;return;}
case 10294:cyc+=8;cp(98);
if(cyc>=evt){pc=10296;return;}
case 10296:cyc+=8;if(!fc){cyc+=4;pc=10307;return;}
if(cyc>=evt){pc=10298;return;}
case 10298:cyc+=8;cp(90);
if(cyc>=evt){pc=10300;return;}
case 10300:cyc+=8;if(fc){cyc+=4;pc=10307;return;}
if(cyc>=evt){pc=10302;return;}
case 10302:cyc+=24;push(10305);pc=13346;return;
if(cyc>=evt){pc=10305;return;}
case 10305:cyc+=12;pc=10364;return;
case 10307:cyc+=8;fz=(C>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10309;return;}
case 10309:cyc+=8;if(fz){cyc+=4;pc=10430;return;}
if(cyc>=evt){pc=10311;return;}
case 10311:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=10314;return;}
case 10314:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10316;return;}
case 10316:cyc+=8;if(fz){cyc+=4;pc=10371;return;}
if(cyc>=evt){pc=10318;return;}
case 10318:cyc+=8;fz=(B>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10320;return;}
case 10320:cyc+=8;if(fz){cyc+=4;pc=10430;return;}
if(cyc>=evt){pc=10322;return;}
case 10322:cyc+=12;pc=10371;return;
case 10324:cyc+=8;A=25;
if(cyc>=evt){pc=10326;return;}
case 10326:cyc+=4;cp(E);
if(cyc>=evt){pc=10327;return;}
case 10327:cyc+=8;if(fz){cyc+=4;pc=10289;return;}
if(cyc>=evt){pc=10329;return;}
case 10329:cyc+=8;fz=(B>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10331;return;}
case 10331:cyc+=8;if(!fz){cyc+=4;pc=10395;return;}
if(cyc>=evt){pc=10333;return;}
case 10333:cyc+=4;A=E;
if(cyc>=evt){pc=10334;return;}
case 10334:cyc+=8;cp(98);
if(cyc>=evt){pc=10336;return;}
case 10336:cyc+=8;if(!fc){cyc+=4;pc=10347;return;}
pc=10338;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 10338:cyc+=8;cp(90);
if(cyc>=evt){pc=10340;return;}
case 10340:cyc+=8;if(fc){cyc+=4;pc=10347;return;}
if(cyc>=evt){pc=10342;return;}
case 10342:cyc+=24;push(10345);pc=13304;return;
if(cyc>=evt){pc=10345;return;}
case 10345:cyc+=12;pc=10364;return;
case 10347:cyc+=8;fz=(B>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10349;return;}
case 10349:cyc+=8;if(fz){cyc+=4;pc=10430;return;}
if(cyc>=evt){pc=10351;return;}
case 10351:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=10354;return;}
case 10354:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10356;return;}
case 10356:cyc+=8;if(fz){cyc+=4;pc=10371;return;}
if(cyc>=evt){pc=10358;return;}
case 10358:cyc+=8;fz=(C>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10360;return;}
case 10360:cyc+=8;if(fz){cyc+=4;pc=10430;return;}
if(cyc>=evt){pc=10362;return;}
case 10362:cyc+=12;pc=10371;return;
case 10364:cyc+=24;push(10367);pc=13498;return;
if(cyc>=evt){pc=10367;return;}
case 10367:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10369;return;}
case 10369:cyc+=8;if(!fz){cyc+=4;pc=10395;return;}
if(cyc>=evt){pc=10371;return;}
case 10371:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=10374;return;}
case 10374:cyc+=8;cp(100);
if(cyc>=evt){pc=10376;return;}
case 10376:cyc+=8;if(fz){cyc+=4;pc=10386;return;}
if(cyc>=evt){pc=10378;return;}
case 10378:cyc+=8;cp(4);
if(cyc>=evt){pc=10380;return;}
case 10380:cyc+=8;if(fc){cyc+=4;pc=10392;return;}
if(cyc>=evt){pc=10382;return;}
case 10382:cyc+=8;cp(7);
if(cyc>=evt){pc=10384;return;}
case 10384:cyc+=8;if(!fc){cyc+=4;pc=10392;return;}
if(cyc>=evt){pc=10386;return;}
case 10386:cyc+=24;push(10389);pc=11431;return;
if(cyc>=evt){pc=10389;return;}
case 10389:cyc+=12;if(!fz){cyc+=4;pc=9471;return;}
if(cyc>=evt){pc=10392;return;}
case 10392:cyc+=16;pc=11364;return;
case 10395:cyc+=8;E=11;
if(cyc>=evt){pc=10397;return;}
case 10397:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=10400;return;}
case 10400:cyc+=16;wr(49427,A);
if(cyc>=evt){pc=10403;return;}
case 10403:cyc+=4;xor(A);
if(cyc>=evt){pc=10404;return;}
case 10404:cyc+=16;wr(49424,A);
if(cyc>=evt){pc=10407;return;}
case 10407:cyc+=12;B=4;C=4;
if(cyc>=evt){pc=10410;return;}
case 10410:cyc+=24;push(10413);pc=14894;return;
if(cyc>=evt){pc=10413;return;}
case 10413:cyc+=8;if(!fz){cyc+=4;pc=10425;return;}
if(cyc>=evt){pc=10415;return;}
case 10415:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=10418;return;}
case 10418:cyc+=4;and(A);
if(cyc>=evt){pc=10419;return;}
case 10419:cyc+=8;if(!fz){cyc+=4;pc=10425;return;}
if(cyc>=evt){pc=10421;return;}
case 10421:cyc+=4;A=E;
if(cyc>=evt){pc=10422;return;}
case 10422:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=10425;return;}
case 10425:cyc+=4;A=E;
if(cyc>=evt){pc=10426;return;}
case 10426:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=10429;return;}
case 10429:cyc+=16;pc=pop();return;
case 10430:cyc+=4;xor(A);
if(cyc>=evt){pc=10431;return;}
case 10431:cyc+=16;wr(49424,A);
if(cyc>=evt){pc=10434;return;}
case 10434:cyc+=4;A=E;
if(cyc>=evt){pc=10435;return;}
case 10435:cyc+=8;cp(100);
if(cyc>=evt){pc=10437;return;}
case 10437:cyc+=8;if(!fz){cyc+=4;pc=10443;return;}
if(cyc>=evt){pc=10439;return;}
case 10439:cyc+=8;E=83;
if(cyc>=evt){pc=10441;return;}
case 10441:cyc+=12;pc=10461;return;
case 10443:cyc+=12;H=193;L=103;
if(cyc>=evt){pc=10446;return;}
case 10446:cyc+=12;fz=(rd((H<<8|L))>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10448;return;}
case 10448:cyc+=8;if(!fz){cyc+=4;pc=10485;return;}
if(cyc>=evt){pc=10450;return;}
case 10450:cyc+=8;cp(3);
if(cyc>=evt){pc=10452;return;}
case 10452:cyc+=8;if(fc){cyc+=4;pc=10461;return;}
if(cyc>=evt){pc=10454;return;}
case 10454:cyc+=8;cp(9);
if(cyc>=evt){pc=10456;return;}
case 10456:cyc+=8;if(!fc){cyc+=4;pc=10461;return;}
if(cyc>=evt){pc=10458;return;}
case 10458:cyc+=8;add(79);
if(cyc>=evt){pc=10460;return;}
case 10460:cyc+=4;E=A;
if(cyc>=evt){pc=10461;return;}
case 10461:cyc+=16;A=rd(49520);
if(cyc>=evt){pc=10464;return;}
case 10464:cyc+=4;and(A);
if(cyc>=evt){pc=10465;return;}
case 10465:cyc+=8;if(fz){cyc+=4;pc=10485;return;}
if(cyc>=evt){pc=10467;return;}
case 10467:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=10470;return;}
case 10470:cyc+=8;cp(0);
if(cyc>=evt){pc=10472;return;}
case 10472:cyc+=8;if(!fz){cyc+=4;pc=10485;return;}
if(cyc>=evt){pc=10474;return;}
case 10474:cyc+=16;A=rd(49493);
if(cyc>=evt){pc=10477;return;}
case 10477:cyc+=4;and(A);
if(cyc>=evt){pc=10478;return;}
case 10478:cyc+=8;if(!fz){cyc+=4;pc=10485;return;}
if(cyc>=evt){pc=10480;return;}
case 10480:cyc+=8;A=10;
if(cyc>=evt){pc=10482;return;}
case 10482:cyc+=16;wr(49419,A);
if(cyc>=evt){pc=10485;return;}
case 10485:cyc+=16;pc=11364;return;
case 10488:cyc+=8;E=53;
if(cyc>=evt){pc=10490;return;}
case 10490:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=10493;return;}
case 10493:cyc+=8;cp(54);
if(cyc>=evt){pc=10495;return;}
case 10495:cyc+=12;if(fz){cyc+=4;pc=11271;return;}
if(cyc>=evt){pc=10498;return;}
case 10498:cyc+=8;E=90;
if(cyc>=evt){pc=10500;return;}
case 10500:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=10503;return;}
case 10503:cyc+=8;cp(103);
if(cyc>=evt){pc=10505;return;}
case 10505:cyc+=8;if(fz){cyc+=4;pc=10520;return;}
if(cyc>=evt){pc=10507;return;}
case 10507:cyc+=8;cp(4);
if(cyc>=evt){pc=10509;return;}
case 10509:cyc+=12;if(fc){cyc+=4;pc=10213;return;}
if(cyc>=evt){pc=10512;return;}
case 10512:cyc+=8;cp(7);
if(cyc>=evt){pc=10514;return;}
case 10514:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10515;return;}
case 10515:cyc+=8;cp(8);
if(cyc>=evt){pc=10517;return;}
case 10517:cyc+=12;if(!fc){cyc+=4;pc=10213;return;}
if(cyc>=evt){pc=10520;return;}
case 10520:cyc+=8;E=100;
if(cyc>=evt){pc=10522;return;}
case 10522:cyc+=16;pc=10213;return;
case 10525:cyc+=8;E=53;
if(cyc>=evt){pc=10527;return;}
case 10527:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=10530;return;}
case 10530:cyc+=8;cp(54);
if(cyc>=evt){pc=10532;return;}
case 10532:cyc+=12;if(fz){cyc+=4;pc=11271;return;}
if(cyc>=evt){pc=10535;return;}
case 10535:cyc+=8;E=3;
if(cyc>=evt){pc=10537;return;}
case 10537:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=10540;return;}
case 10540:cyc+=8;cp(103);
if(cyc>=evt){pc=10542;return;}
case 10542:cyc+=8;if(fz){cyc+=4;pc=10554;return;}
if(cyc>=evt){pc=10544;return;}
case 10544:cyc+=8;cp(4);
if(cyc>=evt){pc=10546;return;}
case 10546:cyc+=12;if(fc){cyc+=4;pc=10213;return;}
if(cyc>=evt){pc=10549;return;}
case 10549:cyc+=8;cp(8);
if(cyc>=evt){pc=10551;return;}
case 10551:cyc+=12;if(!fc){cyc+=4;pc=10213;return;}
if(cyc>=evt){pc=10554;return;}
case 10554:cyc+=8;E=8;
if(cyc>=evt){pc=10556;return;}
case 10556:cyc+=16;pc=10213;return;
case 10559:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=10562;return;}
case 10562:cyc+=4;and(A);
if(cyc>=evt){pc=10563;return;}
case 10563:cyc+=8;if(!fz){cyc+=4;pc=10645;return;}
if(cyc>=evt){pc=10565;return;}
case 10565:cyc+=24;push(10568);pc=13346;return;
if(cyc>=evt){pc=10568;return;}
case 10568:cyc+=12;H=193;L=17;
if(cyc>=evt){pc=10571;return;}
case 10571:cyc+=12;fz=(rd((H<<8|L))>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10573;return;}
case 10573:cyc+=8;if(!fz){cyc+=4;pc=10583;return;}
if(cyc>=evt){pc=10575;return;}
case 10575:cyc+=8;cp(11);
if(cyc>=evt){pc=10577;return;}
case 10577:cyc+=8;if(!fz){cyc+=4;pc=10583;return;}
if(cyc>=evt){pc=10579;return;}
case 10579:cyc+=8;E=81;
if(cyc>=evt){pc=10581;return;}
case 10581:cyc+=12;pc=10602;return;
case 10583:cyc+=24;push(10586);pc=13498;return;
if(cyc>=evt){pc=10586;return;}
case 10586:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10588;return;}
case 10588:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10589;return;}
case 10589:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10591;return;}
case 10591:cyc+=8;if(!fz){cyc+=4;pc=10610;return;}
if(cyc>=evt){pc=10593;return;}
case 10593:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=10596;return;}
case 10596:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10598;return;}
case 10598:cyc+=8;if(!fz){cyc+=4;pc=10610;return;}
if(cyc>=evt){pc=10600;return;}
case 10600:cyc+=8;E=46;
if(cyc>=evt){pc=10602;return;}
case 10602:cyc+=8;A=1;
if(cyc>=evt){pc=10604;return;}
case 10604:cyc+=16;wr(49511,A);
if(cyc>=evt){pc=10607;return;}
case 10607:cyc+=16;pc=10425;return;
case 10610:cyc+=8;E=25;
if(cyc>=evt){pc=10612;return;}
case 10612:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=10615;return;}
case 10615:cyc+=8;cp(0);
if(cyc>=evt){pc=10617;return;}
case 10617:cyc+=8;if(fz){cyc+=4;pc=10624;return;}
if(cyc>=evt){pc=10619;return;}
case 10619:cyc+=8;cp(18);
if(cyc>=evt){pc=10621;return;}
case 10621:cyc+=12;if(!fz){cyc+=4;pc=10425;return;}
if(cyc>=evt){pc=10624;return;}
case 10624:cyc+=8;A=1;
if(cyc>=evt){pc=10626;return;}
case 10626:cyc+=16;wr(49511,A);
if(cyc>=evt){pc=10629;return;}
case 10629:cyc+=8;E=26;
if(cyc>=evt){pc=10631;return;}
case 10631:cyc+=16;pc=10425;return;
case 10634:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=10637;return;}
case 10637:cyc+=4;and(A);
if(cyc>=evt){pc=10638;return;}
case 10638:cyc+=8;if(fz){cyc+=4;pc=10645;return;}
if(cyc>=evt){pc=10640;return;}
case 10640:cyc+=24;push(10643);pc=13304;return;
if(cyc>=evt){pc=10643;return;}
case 10643:cyc+=12;pc=10568;return;
case 10645:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=10648;return;}
case 10648:cyc+=4;and(A);
if(cyc>=evt){pc=10649;return;}
case 10649:cyc+=8;if(fz){cyc+=4;pc=10656;return;}
if(cyc>=evt){pc=10651;return;}
case 10651:cyc+=24;push(10654);pc=13346;return;
if(cyc>=evt){pc=10654;return;}
case 10654:cyc+=12;pc=10671;return;
case 10656:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=10659;return;}
case 10659:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10661;return;}
case 10661:cyc+=8;if(!fz){cyc+=4;pc=10668;return;}
if(cyc>=evt){pc=10663;return;}
case 10663:cyc+=24;push(10666);pc=13304;return;
if(cyc>=evt){pc=10666;return;}
case 10666:cyc+=12;pc=10671;return;
case 10668:cyc+=24;push(10671);pc=13422;return;
if(cyc>=evt){pc=10671;return;}
case 10671:cyc+=24;push(10674);pc=13498;return;
if(cyc>=evt){pc=10674;return;}
case 10674:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10676;return;}
case 10676:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10677;return;}
case 10677:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10679;return;}
case 10679:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=10680;return;}
case 10680:cyc+=24;push(10683);pc=11855;return;
if(cyc>=evt){pc=10683;return;}
case 10683:cyc+=8;cp(5);
if(cyc>=evt){pc=10685;return;}
case 10685:cyc+=8;if(!fc){cyc+=4;pc=10704;return;}
if(cyc>=evt){pc=10687;return;}
case 10687:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=10690;return;}
case 10690:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10692;return;}
case 10692:cyc+=8;if(fz){cyc+=4;pc=10709;return;}
if(cyc>=evt){pc=10694;return;}
case 10694:cyc+=8;A=30;
if(cyc>=evt){pc=10696;return;}
case 10696:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=10699;return;}
case 10699:cyc+=8;E=29;
if(cyc>=evt){pc=10701;return;}
case 10701:cyc+=16;pc=10425;return;
case 10704:cyc+=8;E=24;
if(cyc>=evt){pc=10706;return;}
case 10706:cyc+=16;pc=10425;return;
case 10709:cyc+=12;H=193;L=17;
if(cyc>=evt){pc=10712;return;}
case 10712:cyc+=12;B=193;C=28;
if(cyc>=evt){pc=10715;return;}
case 10715:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=10716;return;}
case 10716:cyc+=16;pushaf();
if(cyc>=evt){pc=10717;return;}
case 10717:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=10718;return;}
case 10718:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=10719;return;}
case 10719:cyc+=12;popaf();
if(cyc>=evt){pc=10720;return;}
case 10720:cyc+=8;wr(B<<8|C,A);
if(cyc>=evt){pc=10721;return;}
case 10721:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=10724;return;}
case 10724:cyc+=8;xor(1);
if(cyc>=evt){pc=10726;return;}
case 10726:cyc+=16;wr(49423,A);
if(cyc>=evt){pc=10729;return;}
case 10729:cyc+=16;A=rd(49434);
if(cyc>=evt){pc=10732;return;}
case 10732:cyc+=8;xor(1);
if(cyc>=evt){pc=10734;return;}
case 10734:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=10737;return;}
case 10737:cyc+=8;A=109;
if(cyc>=evt){pc=10739;return;}
case 10739:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=10742;return;}
case 10742:cyc+=8;E=23;
if(cyc>=evt){pc=10744;return;}
case 10744:cyc+=16;pc=10425;return;
case 10747:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=10750;return;}
case 10750:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10752;return;}
case 10752:cyc+=8;if(fz){cyc+=4;pc=10773;return;}
if(cyc>=evt){pc=10754;return;}
case 10754:cyc+=12;H=193;L=28;
if(cyc>=evt){pc=10757;return;}
case 10757:cyc+=16;wr((H<<8|L),rd((H<<8|L))|1);
if(cyc>=evt){pc=10759;return;}
case 10759:cyc+=8;A=20;
if(cyc>=evt){pc=10761;return;}
case 10761:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=10764;return;}
case 10764:cyc+=4;xor(A);
if(cyc>=evt){pc=10765;return;}
case 10765:cyc+=16;wr(49429,A);
if(cyc>=evt){pc=10768;return;}
case 10768:cyc+=8;A=12;
if(cyc>=evt){pc=10770;return;}
case 10770:cyc+=16;wr(49510,A);
if(cyc>=evt){pc=10773;return;}
case 10773:cyc+=12;B=18;C=2;
if(cyc>=evt){pc=10776;return;}
case 10776:cyc+=24;push(10779);pc=14894;return;
if(cyc>=evt){pc=10779;return;}
case 10779:cyc+=8;if(!fz){cyc+=4;pc=10806;return;}
if(cyc>=evt){pc=10781;return;}
case 10781:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=10784;return;}
case 10784:cyc+=8;cp(4);
if(cyc>=evt){pc=10786;return;}
case 10786:cyc+=8;if(!fc){cyc+=4;pc=10798;return;}
if(cyc>=evt){pc=10788;return;}
case 10788:cyc+=8;A=24;
if(cyc>=evt){pc=10790;return;}
case 10790:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=10793;return;}
case 10793:cyc+=24;push(10796);pc=12071;return;
if(cyc>=evt){pc=10796;return;}
case 10796:cyc+=12;pc=10781;return;
case 10798:cyc+=4;xor(A);
if(cyc>=evt){pc=10799;return;}
case 10799:cyc+=16;wr(49511,A);
if(cyc>=evt){pc=10802;return;}
case 10802:cyc+=8;E=39;
if(cyc>=evt){pc=10804;return;}
case 10804:cyc+=12;pc=10813;return;
case 10806:cyc+=8;A=1;
if(cyc>=evt){pc=10808;return;}
case 10808:cyc+=16;wr(49511,A);
if(cyc>=evt){pc=10811;return;}
case 10811:cyc+=8;E=20;
if(cyc>=evt){pc=10813;return;}
case 10813:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=10816;return;}
case 10816:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10818;return;}
case 10818:cyc+=8;if(fz){cyc+=4;pc=10821;return;}
if(cyc>=evt){pc=10820;return;}
case 10820:cyc+=4;E=inc(E);
if(cyc>=evt){pc=10821;return;}
case 10821:cyc+=16;pc=10425;return;
case 10824:cyc+=8;D=109;
if(cyc>=evt){pc=10826;return;}
case 10826:cyc+=12;H=193;L=25;
if(cyc>=evt){pc=10829;return;}
case 10829:cyc+=16;wr((H<<8|L),srl(rd((H<<8|L))));
if(cyc>=evt){pc=10831;return;}
case 10831:cyc+=16;wr((H<<8|L),srl(rd((H<<8|L))));
pc=10833;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 10833:cyc+=24;push(10836);pc=11855;return;
if(cyc>=evt){pc=10836;return;}
case 10836:cyc+=8;cp(6);
if(cyc>=evt){pc=10838;return;}
case 10838:cyc+=12;if(!fc){cyc+=4;pc=10993;return;}
if(cyc>=evt){pc=10841;return;}
case 10841:cyc+=24;push(10844);pc=7618;return;
if(cyc>=evt){pc=10844;return;}
case 10844:cyc+=12;H=193;L=22;
if(cyc>=evt){pc=10847;return;}
case 10847:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=10848;return;}
case 10848:cyc+=8;if(!fc){cyc+=4;pc=10918;return;}
if(cyc>=evt){pc=10850;return;}
case 10850:cyc+=8;D=114;
if(cyc>=evt){pc=10852;return;}
case 10852:cyc+=16;A=rd(49434);
if(cyc>=evt){pc=10855;return;}
case 10855:cyc+=4;and(A);
if(cyc>=evt){pc=10856;return;}
case 10856:cyc+=8;if(!fz){cyc+=4;pc=10897;return;}
if(cyc>=evt){pc=10858;return;}
case 10858:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=10861;return;}
case 10861:cyc+=8;cp(2);
if(cyc>=evt){pc=10863;return;}
case 10863:cyc+=8;if(fc){cyc+=4;pc=10894;return;}
if(cyc>=evt){pc=10865;return;}
case 10865:cyc+=24;push(10868);pc=13362;return;
if(cyc>=evt){pc=10868;return;}
case 10868:cyc+=8;cp(11);
if(cyc>=evt){pc=10870;return;}
case 10870:cyc+=8;if(fz){cyc+=4;pc=10894;return;}
if(cyc>=evt){pc=10872;return;}
case 10872:cyc+=24;push(10875);pc=13498;return;
if(cyc>=evt){pc=10875;return;}
case 10875:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10877;return;}
case 10877:cyc+=8;if(!fz){cyc+=4;pc=10894;return;}
if(cyc>=evt){pc=10879;return;}
case 10879:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10881;return;}
case 10881:cyc+=8;if(!fz){cyc+=4;pc=10909;return;}
if(cyc>=evt){pc=10883;return;}
case 10883:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=10886;return;}
case 10886:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10888;return;}
case 10888:cyc+=8;if(fz){cyc+=4;pc=10894;return;}
if(cyc>=evt){pc=10890;return;}
case 10890:cyc+=8;D=120;
if(cyc>=evt){pc=10892;return;}
case 10892:cyc+=12;pc=10909;return;
case 10894:cyc+=4;D=inc(D);
if(cyc>=evt){pc=10895;return;}
case 10895:cyc+=12;pc=10909;return;
case 10897:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=10900;return;}
case 10900:cyc+=8;cp(17);
if(cyc>=evt){pc=10902;return;}
case 10902:cyc+=8;if(!fc){cyc+=4;pc=10894;return;}
if(cyc>=evt){pc=10904;return;}
case 10904:cyc+=24;push(10907);pc=13444;return;
if(cyc>=evt){pc=10907;return;}
case 10907:cyc+=12;pc=10868;return;
case 10909:cyc+=4;A=D;
if(cyc>=evt){pc=10910;return;}
case 10910:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=10913;return;}
case 10913:cyc+=8;E=28;
if(cyc>=evt){pc=10915;return;}
case 10915:cyc+=16;pc=10425;return;
case 10918:cyc+=8;D=116;
if(cyc>=evt){pc=10920;return;}
case 10920:cyc+=16;A=rd(49434);
if(cyc>=evt){pc=10923;return;}
case 10923:cyc+=4;and(A);
if(cyc>=evt){pc=10924;return;}
case 10924:cyc+=8;if(!fz){cyc+=4;pc=10965;return;}
if(cyc>=evt){pc=10926;return;}
case 10926:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=10929;return;}
case 10929:cyc+=8;cp(2);
if(cyc>=evt){pc=10931;return;}
case 10931:cyc+=8;if(fc){cyc+=4;pc=10962;return;}
if(cyc>=evt){pc=10933;return;}
case 10933:cyc+=24;push(10936);pc=13362;return;
if(cyc>=evt){pc=10936;return;}
case 10936:cyc+=8;cp(11);
if(cyc>=evt){pc=10938;return;}
case 10938:cyc+=8;if(fz){cyc+=4;pc=10962;return;}
if(cyc>=evt){pc=10940;return;}
case 10940:cyc+=24;push(10943);pc=13498;return;
if(cyc>=evt){pc=10943;return;}
case 10943:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10945;return;}
case 10945:cyc+=8;if(!fz){cyc+=4;pc=10962;return;}
if(cyc>=evt){pc=10947;return;}
case 10947:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10949;return;}
case 10949:cyc+=8;if(!fz){cyc+=4;pc=10977;return;}
if(cyc>=evt){pc=10951;return;}
case 10951:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=10954;return;}
case 10954:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=10956;return;}
case 10956:cyc+=8;if(fz){cyc+=4;pc=10962;return;}
if(cyc>=evt){pc=10958;return;}
case 10958:cyc+=8;D=121;
if(cyc>=evt){pc=10960;return;}
case 10960:cyc+=12;pc=10977;return;
case 10962:cyc+=4;D=inc(D);
if(cyc>=evt){pc=10963;return;}
case 10963:cyc+=12;pc=10977;return;
case 10965:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=10968;return;}
case 10968:cyc+=8;cp(17);
if(cyc>=evt){pc=10970;return;}
case 10970:cyc+=8;if(!fc){cyc+=4;pc=10962;return;}
if(cyc>=evt){pc=10972;return;}
case 10972:cyc+=24;push(10975);pc=13444;return;
if(cyc>=evt){pc=10975;return;}
case 10975:cyc+=12;pc=10936;return;
case 10977:cyc+=16;A=rd(49504);
if(cyc>=evt){pc=10980;return;}
case 10980:cyc+=8;cp(2);
if(cyc>=evt){pc=10982;return;}
case 10982:cyc+=8;if(!fc){cyc+=4;pc=10993;return;}
if(cyc>=evt){pc=10984;return;}
case 10984:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=10987;return;}
case 10987:cyc+=8;and(6);
if(cyc>=evt){pc=10989;return;}
case 10989:cyc+=8;if(!fz){cyc+=4;pc=10993;return;}
if(cyc>=evt){pc=10991;return;}
case 10991:cyc+=8;D=124;
if(cyc>=evt){pc=10993;return;}
case 10993:cyc+=4;A=D;
if(cyc>=evt){pc=10994;return;}
case 10994:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=10997;return;}
case 10997:cyc+=8;E=27;
if(cyc>=evt){pc=10999;return;}
case 10999:cyc+=16;pc=10425;return;
case 11002:cyc+=8;E=31;
if(cyc>=evt){pc=11004;return;}
case 11004:cyc+=16;pc=10425;return;
case 11007:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=11010;return;}
case 11010:cyc+=4;and(A);
if(cyc>=evt){pc=11011;return;}
case 11011:cyc+=8;if(fz){cyc+=4;pc=11070;return;}
if(cyc>=evt){pc=11013;return;}
case 11013:cyc+=12;pc=11021;return;
case 11015:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=11018;return;}
case 11018:cyc+=4;and(A);
if(cyc>=evt){pc=11019;return;}
case 11019:cyc+=8;if(!fz){cyc+=4;pc=11070;return;}
if(cyc>=evt){pc=11021;return;}
case 11021:cyc+=16;A=rd(49415);
if(cyc>=evt){pc=11024;return;}
case 11024:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11026;return;}
case 11026:cyc+=12;if(!fz){cyc+=4;pc=10488;return;}
if(cyc>=evt){pc=11029;return;}
case 11029:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11031;return;}
case 11031:cyc+=12;if(!fz){cyc+=4;pc=10525;return;}
if(cyc>=evt){pc=11034;return;}
case 11034:cyc+=8;E=5;
if(cyc>=evt){pc=11036;return;}
case 11036:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=11039;return;}
case 11039:cyc+=8;cp(4);
if(cyc>=evt){pc=11041;return;}
case 11041:cyc+=12;if(fz){cyc+=4;pc=10213;return;}
if(cyc>=evt){pc=11044;return;}
case 11044:cyc+=8;cp(6);
if(cyc>=evt){pc=11046;return;}
case 11046:cyc+=12;if(fz){cyc+=4;pc=10213;return;}
if(cyc>=evt){pc=11049;return;}
case 11049:cyc+=8;cp(7);
if(cyc>=evt){pc=11051;return;}
case 11051:cyc+=12;if(fz){cyc+=4;pc=10213;return;}
if(cyc>=evt){pc=11054;return;}
case 11054:cyc+=8;cp(103);
if(cyc>=evt){pc=11056;return;}
case 11056:cyc+=12;if(fz){cyc+=4;pc=10213;return;}
if(cyc>=evt){pc=11059;return;}
case 11059:cyc+=4;E=inc(E);
if(cyc>=evt){pc=11060;return;}
case 11060:cyc+=8;cp(5);
if(cyc>=evt){pc=11062;return;}
case 11062:cyc+=12;if(fz){cyc+=4;pc=10213;return;}
if(cyc>=evt){pc=11065;return;}
case 11065:cyc+=8;E=4;
if(cyc>=evt){pc=11067;return;}
case 11067:cyc+=16;pc=10213;return;
case 11070:cyc+=8;A=1;
if(cyc>=evt){pc=11072;return;}
case 11072:cyc+=16;wr(49424,A);
if(cyc>=evt){pc=11075;return;}
case 11075:cyc+=8;E=1;
if(cyc>=evt){pc=11077;return;}
case 11077:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=11080;return;}
case 11080:cyc+=8;cp(103);
if(cyc>=evt){pc=11082;return;}
case 11082:cyc+=8;if(fz){cyc+=4;pc=11094;return;}
if(cyc>=evt){pc=11084;return;}
case 11084:cyc+=8;cp(4);
if(cyc>=evt){pc=11086;return;}
case 11086:cyc+=12;if(fc){cyc+=4;pc=10425;return;}
if(cyc>=evt){pc=11089;return;}
case 11089:cyc+=8;cp(7);
if(cyc>=evt){pc=11091;return;}
case 11091:cyc+=12;if(!fc){cyc+=4;pc=10425;return;}
if(cyc>=evt){pc=11094;return;}
case 11094:cyc+=8;E=7;
if(cyc>=evt){pc=11096;return;}
case 11096:cyc+=16;pc=10425;return;
case 11099:cyc+=16;A=rd(49434);
if(cyc>=evt){pc=11102;return;}
case 11102:cyc+=8;xor(1);
if(cyc>=evt){pc=11104;return;}
case 11104:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=11107;return;}
case 11107:cyc+=8;C=2;
if(cyc>=evt){pc=11109;return;}
case 11109:cyc+=8;if(fz){cyc+=4;pc=11113;return;}
if(cyc>=evt){pc=11111;return;}
case 11111:cyc+=8;C=254;
if(cyc>=evt){pc=11113;return;}
case 11113:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=11116;return;}
case 11116:cyc+=4;add(C);
if(cyc>=evt){pc=11117;return;}
case 11117:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=11120;return;}
case 11120:cyc+=16;pc=pop();return;
case 11121:cyc+=24;push(11124);pc=11413;return;
if(cyc>=evt){pc=11124;return;}
case 11124:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=11127;return;}
case 11127:cyc+=4;and(A);
if(cyc>=evt){pc=11128;return;}
case 11128:cyc+=8;if(!fz){cyc+=4;pc=11147;return;}
if(cyc>=evt){pc=11130;return;}
case 11130:cyc+=8;fz=(C>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11132;return;}
case 11132:cyc+=8;if(!fz){cyc+=4;pc=11173;return;}
if(cyc>=evt){pc=11134;return;}
case 11134:cyc+=8;fz=(B>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11136;return;}
case 11136:cyc+=8;if(fz){cyc+=4;pc=11173;return;}
if(cyc>=evt){pc=11138;return;}
case 11138:cyc+=8;fz=(C>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11140;return;}
case 11140:cyc+=8;if(!fz){cyc+=4;pc=11173;return;}
if(cyc>=evt){pc=11142;return;}
case 11142:cyc+=8;E=59;
if(cyc>=evt){pc=11144;return;}
case 11144:cyc+=16;pc=10425;return;
case 11147:cyc+=8;fz=(C>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11149;return;}
case 11149:cyc+=8;if(fz){cyc+=4;pc=11156;return;}
if(cyc>=evt){pc=11151;return;}
case 11151:cyc+=8;fz=(B>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11153;return;}
case 11153:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=11154;return;}
case 11154:cyc+=12;pc=11168;return;
case 11156:cyc+=8;fz=(B>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11158;return;}
case 11158:cyc+=8;if(!fz){cyc+=4;pc=11173;return;}
if(cyc>=evt){pc=11160;return;}
case 11160:cyc+=8;fz=(C>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11162;return;}
case 11162:cyc+=8;if(fz){cyc+=4;pc=11173;return;}
if(cyc>=evt){pc=11164;return;}
case 11164:cyc+=8;fz=(B>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11166;return;}
case 11166:cyc+=8;if(!fz){cyc+=4;pc=11173;return;}
if(cyc>=evt){pc=11168;return;}
case 11168:cyc+=8;E=41;
if(cyc>=evt){pc=11170;return;}
case 11170:cyc+=16;pc=10425;return;
case 11173:cyc+=8;E=9;
if(cyc>=evt){pc=11175;return;}
case 11175:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=11178;return;}
case 11178:cyc+=4;cp(E);
if(cyc>=evt){pc=11179;return;}
case 11179:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=11180;return;}
case 11180:cyc+=16;pc=10425;return;
case 11183:cyc+=24;push(11186);pc=13346;return;
if(cyc>=evt){pc=11186;return;}
case 11186:cyc+=8;cp(16);
if(cyc>=evt){pc=11188;return;}
case 11188:cyc+=8;if(!fz){cyc+=4;pc=11228;return;}
if(cyc>=evt){pc=11190;return;}
case 11190:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=11193;return;}
case 11193:cyc+=24;push(11196);pc=11870;return;
if(cyc>=evt){pc=11196;return;}
case 11196:cyc+=4;C=dec(C);
if(cyc>=evt){pc=11197;return;}
case 11197:cyc+=24;push(11200);pc=12048;return;
if(cyc>=evt){pc=11200;return;}
case 11200:cyc+=8;cp(64);
if(cyc>=evt){pc=11202;return;}
case 11202:cyc+=8;if(fz){cyc+=4;pc=11257;return;}
if(cyc>=evt){pc=11204;return;}
case 11204:cyc+=4;xor(A);
if(cyc>=evt){pc=11205;return;}
case 11205:cyc+=16;wr(49423,A);
if(cyc>=evt){pc=11208;return;}
case 11208:cyc+=8;B=13;
if(cyc>=evt){pc=11210;return;}
case 11210:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=11213;return;}
case 11213:cyc+=8;cp(4);
if(cyc>=evt){pc=11215;return;}
case 11215:cyc+=8;if(!fz){cyc+=4;pc=11219;return;}
if(cyc>=evt){pc=11217;return;}
case 11217:cyc+=8;B=17;
if(cyc>=evt){pc=11219;return;}
case 11219:cyc+=4;A=B;
if(cyc>=evt){pc=11220;return;}
case 11220:cyc+=24;push(11223);pc=14993;return;
if(cyc>=evt){pc=11223;return;}
case 11223:cyc+=8;E=104;
if(cyc>=evt){pc=11225;return;}
case 11225:cyc+=16;pc=10425;return;
case 11228:cyc+=8;cp(17);
if(cyc>=evt){pc=11230;return;}
case 11230:cyc+=8;if(!fz){cyc+=4;pc=11257;return;}
if(cyc>=evt){pc=11232;return;}
case 11232:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=11235;return;}
case 11235:cyc+=24;push(11238);pc=11870;return;
if(cyc>=evt){pc=11238;return;}
case 11238:cyc+=4;C=dec(C);
if(cyc>=evt){pc=11239;return;}
case 11239:cyc+=4;C=dec(C);
if(cyc>=evt){pc=11240;return;}
case 11240:cyc+=24;push(11243);pc=12048;return;
if(cyc>=evt){pc=11243;return;}
case 11243:cyc+=8;cp(64);
if(cyc>=evt){pc=11245;return;}
case 11245:cyc+=8;if(fz){cyc+=4;pc=11257;return;}
if(cyc>=evt){pc=11247;return;}
case 11247:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=11250;return;}
case 11250:cyc+=8;sub(2);
if(cyc>=evt){pc=11252;return;}
case 11252:cyc+=16;wr(49425,A);
if(cyc>=evt){pc=11255;return;}
case 11255:cyc+=12;pc=11204;return;
case 11257:cyc+=8;E=54;
if(cyc>=evt){pc=11259;return;}
case 11259:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=11262;return;}
case 11262:cyc+=4;cp(E);
if(cyc>=evt){pc=11263;return;}
case 11263:cyc+=8;if(!fz){cyc+=4;pc=11312;return;}
if(cyc>=evt){pc=11265;return;}
case 11265:cyc+=8;E=55;
if(cyc>=evt){pc=11267;return;}
case 11267:cyc+=4;xor(A);
if(cyc>=evt){pc=11268;return;}
case 11268:cyc+=16;wr(49524,A);
if(cyc>=evt){pc=11271;return;}
case 11271:cyc+=24;push(11274);pc=13378;return;
if(cyc>=evt){pc=11274;return;}
case 11274:cyc+=24;push(11277);pc=13498;return;
if(cyc>=evt){pc=11277;return;}
case 11277:cyc+=4;C=A;
if(cyc>=evt){pc=11278;return;}
case 11278:cyc+=24;push(11281);pc=13406;return;
if(cyc>=evt){pc=11281;return;}
case 11281:cyc+=8;cp(5);
if(cyc>=evt){pc=11283;return;}
case 11283:cyc+=8;if(fz){cyc+=4;pc=11310;return;}
if(cyc>=evt){pc=11285;return;}
case 11285:cyc+=24;push(11288);pc=13498;return;
if(cyc>=evt){pc=11288;return;}
case 11288:cyc+=4;B=A;
if(cyc>=evt){pc=11289;return;}
case 11289:cyc+=4;xor(C);
if(cyc>=evt){pc=11290;return;}
case 11290:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11292;return;}
case 11292:cyc+=8;if(fz){cyc+=4;pc=11310;return;}
if(cyc>=evt){pc=11294;return;}
case 11294:cyc+=8;and(3);
if(cyc>=evt){pc=11296;return;}
case 11296:cyc+=8;if(fz){cyc+=4;pc=11310;return;}
if(cyc>=evt){pc=11298;return;}
case 11298:cyc+=8;cp(3);
if(cyc>=evt){pc=11300;return;}
case 11300:cyc+=8;if(fz){cyc+=4;pc=11310;return;}
if(cyc>=evt){pc=11302;return;}
case 11302:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=11305;return;}
case 11305:cyc+=4;xor(C);
if(cyc>=evt){pc=11306;return;}
case 11306:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11308;return;}
case 11308:cyc+=8;if(!fz){cyc+=4;pc=11312;return;}
if(cyc>=evt){pc=11310;return;}
case 11310:cyc+=8;E=58;
if(cyc>=evt){pc=11312;return;}
case 11312:cyc+=24;push(11315);pc=13378;return;
if(cyc>=evt){pc=11315;return;}
case 11315:cyc+=24;push(11318);pc=13498;return;
if(cyc>=evt){pc=11318;return;}
case 11318:cyc+=8;and(3);
pc=11320;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 11320:cyc+=8;if(fz){cyc+=4;pc=11325;return;}
if(cyc>=evt){pc=11322;return;}
case 11322:cyc+=24;push(11325);pc=11328;return;
if(cyc>=evt){pc=11325;return;}
case 11325:cyc+=16;pc=10425;return;
case 11328:cyc+=4;A=E;
if(cyc>=evt){pc=11329;return;}
case 11329:cyc+=8;cp(41);
if(cyc>=evt){pc=11331;return;}
case 11331:cyc+=8;if(fc){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=11332;return;}
case 11332:cyc+=8;cp(59);
if(cyc>=evt){pc=11334;return;}
case 11334:cyc+=8;if(!fc){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=11335;return;}
case 11335:cyc+=8;add(18);
if(cyc>=evt){pc=11337;return;}
case 11337:cyc+=4;E=A;
if(cyc>=evt){pc=11338;return;}
case 11338:cyc+=16;pc=pop();return;
case 11339:cyc+=24;push(11342);pc=13378;return;
if(cyc>=evt){pc=11342;return;}
case 11342:cyc+=24;push(11345);pc=13498;return;
if(cyc>=evt){pc=11345;return;}
case 11345:cyc+=4;C=A;
if(cyc>=evt){pc=11346;return;}
case 11346:cyc+=24;push(11349);pc=13406;return;
if(cyc>=evt){pc=11349;return;}
case 11349:cyc+=24;push(11352);pc=13498;return;
if(cyc>=evt){pc=11352;return;}
case 11352:cyc+=4;xor(C);
if(cyc>=evt){pc=11353;return;}
case 11353:cyc+=8;and(1);
if(cyc>=evt){pc=11355;return;}
case 11355:cyc+=8;if(fz){cyc+=4;pc=11363;return;}
if(cyc>=evt){pc=11357;return;}
case 11357:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=11360;return;}
case 11360:cyc+=4;xor(C);
if(cyc>=evt){pc=11361;return;}
case 11361:cyc+=8;and(1);
if(cyc>=evt){pc=11363;return;}
case 11363:cyc+=16;pc=pop();return;
case 11364:cyc+=4;A=E;
if(cyc>=evt){pc=11365;return;}
case 11365:cyc+=8;cp(41);
if(cyc>=evt){pc=11367;return;}
case 11367:cyc+=8;if(fc){cyc+=4;pc=11410;return;}
if(cyc>=evt){pc=11369;return;}
case 11369:cyc+=8;cp(77);
if(cyc>=evt){pc=11371;return;}
case 11371:cyc+=8;if(!fc){cyc+=4;pc=11410;return;}
if(cyc>=evt){pc=11373;return;}
case 11373:cyc+=8;cp(47);
if(cyc>=evt){pc=11375;return;}
case 11375:cyc+=8;if(!fc){cyc+=4;pc=11312;return;}
if(cyc>=evt){pc=11377;return;}
case 11377:cyc+=8;cp(44);
if(cyc>=evt){pc=11379;return;}
case 11379:cyc+=8;if(fz){cyc+=4;pc=11385;return;}
if(cyc>=evt){pc=11381;return;}
case 11381:cyc+=8;cp(45);
if(cyc>=evt){pc=11383;return;}
case 11383:cyc+=8;if(!fz){cyc+=4;pc=11397;return;}
if(cyc>=evt){pc=11385;return;}
case 11385:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=11388;return;}
case 11388:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11390;return;}
case 11390:cyc+=8;if(!fz){cyc+=4;pc=11410;return;}
if(cyc>=evt){pc=11392;return;}
case 11392:cyc+=24;push(11395);pc=13422;return;
if(cyc>=evt){pc=11395;return;}
case 11395:cyc+=12;pc=11400;return;
case 11397:cyc+=24;push(11400);pc=13304;return;
if(cyc>=evt){pc=11400;return;}
case 11400:cyc+=24;push(11403);pc=13498;return;
if(cyc>=evt){pc=11403;return;}
case 11403:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11405;return;}
case 11405:cyc+=8;if(fz){cyc+=4;pc=11410;return;}
if(cyc>=evt){pc=11407;return;}
case 11407:cyc+=24;push(11410);pc=11328;return;
if(cyc>=evt){pc=11410;return;}
case 11410:cyc+=16;pc=10425;return;
case 11413:cyc+=24;push(11416);pc=13346;return;
if(cyc>=evt){pc=11416;return;}
case 11416:cyc+=24;push(11419);pc=13498;return;
if(cyc>=evt){pc=11419;return;}
case 11419:cyc+=4;C=A;
if(cyc>=evt){pc=11420;return;}
case 11420:cyc+=24;push(11423);pc=13304;return;
if(cyc>=evt){pc=11423;return;}
case 11423:cyc+=24;push(11426);pc=13498;return;
if(cyc>=evt){pc=11426;return;}
case 11426:cyc+=4;B=A;
if(cyc>=evt){pc=11427;return;}
case 11427:cyc+=4;or(C);
if(cyc>=evt){pc=11428;return;}
case 11428:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11430;return;}
case 11430:cyc+=16;pc=pop();return;
case 11431:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=11434;return;}
case 11434:cyc+=8;cp(20);
if(cyc>=evt){pc=11436;return;}
case 11436:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=11437;return;}
case 11437:cyc+=24;push(11440);pc=13304;return;
if(cyc>=evt){pc=11440;return;}
case 11440:cyc+=24;push(11443);pc=13498;return;
if(cyc>=evt){pc=11443;return;}
case 11443:cyc+=8;fz=(A>>3)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11445;return;}
case 11445:cyc+=16;pc=pop();return;
case 11446:cyc+=16;A=rd(49462);
if(cyc>=evt){pc=11449;return;}
case 11449:cyc+=4;and(A);
if(cyc>=evt){pc=11450;return;}
case 11450:cyc+=8;if(!fz){cyc+=4;pc=11457;return;}
if(cyc>=evt){pc=11452;return;}
case 11452:cyc+=24;push(11455);pc=14912;return;
if(cyc>=evt){pc=11455;return;}
case 11455:cyc+=8;if(!fz){cyc+=4;pc=11460;return;}
if(cyc>=evt){pc=11457;return;}
case 11457:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=11460;return;}
case 11460:cyc+=16;pushaf();
if(cyc>=evt){pc=11461;return;}
case 11461:cyc+=8;A=10;
if(cyc>=evt){pc=11463;return;}
case 11463:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=11466;return;}
case 11466:cyc+=12;popaf();
if(cyc>=evt){pc=11467;return;}
case 11467:cyc+=12;B=76;C=168;
if(cyc>=evt){pc=11470;return;}
case 11470:cyc+=4;add(C);
if(cyc>=evt){pc=11471;return;}
case 11471:cyc+=4;C=A;
if(cyc>=evt){pc=11472;return;}
case 11472:cyc+=8;if(!fc){cyc+=4;pc=11475;return;}
if(cyc>=evt){pc=11474;return;}
case 11474:cyc+=4;B=inc(B);
if(cyc>=evt){pc=11475;return;}
case 11475:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=11476;return;}
case 11476:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11478;return;}
case 11478:cyc+=8;if(!fz){cyc+=4;pc=11486;return;}
if(cyc>=evt){pc=11480;return;}
case 11480:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11482;return;}
case 11482:cyc+=8;if(!fz){cyc+=4;pc=11506;return;}
if(cyc>=evt){pc=11484;return;}
case 11484:cyc+=4;xor(A);
if(cyc>=evt){pc=11485;return;}
case 11485:cyc+=16;pc=pop();return;
case 11486:cyc+=24;push(11489);pc=13378;return;
if(cyc>=evt){pc=11489;return;}
case 11489:cyc+=24;push(11492);pc=13498;return;
if(cyc>=evt){pc=11492;return;}
case 11492:cyc+=12;B=255;C=0;
if(cyc>=evt){pc=11495;return;}
case 11495:cyc+=8;fz=(A>>4)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11497;return;}
case 11497:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=11498;return;}
case 11498:cyc+=24;push(11501);pc=13406;return;
if(cyc>=evt){pc=11501;return;}
case 11501:cyc+=12;B=255;C=255;
if(cyc>=evt){pc=11504;return;}
case 11504:cyc+=12;pc=11556;return;
case 11506:cyc+=16;A=rd(49511);
if(cyc>=evt){pc=11509;return;}
case 11509:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11511;return;}
case 11511:cyc+=8;if(!fz){cyc+=4;pc=11542;return;}
if(cyc>=evt){pc=11513;return;}
case 11513:cyc+=24;push(11516);pc=13346;return;
if(cyc>=evt){pc=11516;return;}
case 11516:cyc+=24;push(11519);pc=13498;return;
if(cyc>=evt){pc=11519;return;}
case 11519:cyc+=12;B=0;C=255;
if(cyc>=evt){pc=11522;return;}
case 11522:cyc+=8;fz=(A>>4)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11524;return;}
case 11524:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=11525;return;}
case 11525:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=11528;return;}
case 11528:cyc+=4;and(A);
if(cyc>=evt){pc=11529;return;}
case 11529:cyc+=8;if(fz){cyc+=4;pc=11542;return;}
if(cyc>=evt){pc=11531;return;}
case 11531:cyc+=24;push(11534);pc=13346;return;
if(cyc>=evt){pc=11534;return;}
case 11534:cyc+=8;cp(20);
if(cyc>=evt){pc=11536;return;}
case 11536:cyc+=8;if(fz){cyc+=4;pc=11542;return;}
if(cyc>=evt){pc=11538;return;}
case 11538:cyc+=8;cp(0);
if(cyc>=evt){pc=11540;return;}
case 11540:cyc+=8;if(!fz){cyc+=4;pc=11484;return;}
if(cyc>=evt){pc=11542;return;}
case 11542:cyc+=24;push(11545);pc=13304;return;
if(cyc>=evt){pc=11545;return;}
case 11545:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=11548;return;}
case 11548:cyc+=12;H=193;L=17;
if(cyc>=evt){pc=11551;return;}
case 11551:cyc+=12;fz=(rd((H<<8|L))>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11553;return;}
case 11553:cyc+=8;if(fz){cyc+=4;pc=11556;return;}
if(cyc>=evt){pc=11555;return;}
case 11555:cyc+=4;C=dec(C);
if(cyc>=evt){pc=11556;return;}
case 11556:cyc+=24;push(11559);pc=13498;return;
if(cyc>=evt){pc=11559;return;}
case 11559:cyc+=8;fz=(A>>4)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11561;return;}
case 11561:cyc+=16;pc=pop();return;
case 11562:cyc+=16;A=rd(49463);
if(cyc>=evt){pc=11565;return;}
case 11565:cyc+=4;and(A);
if(cyc>=evt){pc=11566;return;}
case 11566:cyc+=8;if(!fz){cyc+=4;pc=11573;return;}
if(cyc>=evt){pc=11568;return;}
case 11568:cyc+=24;push(11571);pc=14907;return;
if(cyc>=evt){pc=11571;return;}
case 11571:cyc+=8;if(!fz){cyc+=4;pc=11576;return;}
if(cyc>=evt){pc=11573;return;}
case 11573:cyc+=16;A=rd(49459);
if(cyc>=evt){pc=11576;return;}
case 11576:cyc+=16;pushaf();
if(cyc>=evt){pc=11577;return;}
case 11577:cyc+=8;A=10;
if(cyc>=evt){pc=11579;return;}
case 11579:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=11582;return;}
case 11582:cyc+=12;popaf();
if(cyc>=evt){pc=11583;return;}
case 11583:cyc+=12;B=76;C=168;
if(cyc>=evt){pc=11586;return;}
case 11586:cyc+=4;add(C);
if(cyc>=evt){pc=11587;return;}
case 11587:cyc+=4;C=A;
if(cyc>=evt){pc=11588;return;}
case 11588:cyc+=8;if(!fc){cyc+=4;pc=11591;return;}
if(cyc>=evt){pc=11590;return;}
case 11590:cyc+=4;B=inc(B);
if(cyc>=evt){pc=11591;return;}
case 11591:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=11592;return;}
case 11592:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11594;return;}
case 11594:cyc+=8;if(!fz){cyc+=4;pc=11598;return;}
if(cyc>=evt){pc=11596;return;}
case 11596:cyc+=4;xor(A);
if(cyc>=evt){pc=11597;return;}
case 11597:cyc+=16;pc=pop();return;
case 11598:cyc+=24;push(11601);pc=13332;return;
if(cyc>=evt){pc=11601;return;}
case 11601:cyc+=24;push(11604);pc=13498;return;
if(cyc>=evt){pc=11604;return;}
case 11604:cyc+=8;fz=(A>>4)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11606;return;}
case 11606:cyc+=16;pc=pop();return;
case 11607:cyc+=16;A=rd(49523);
if(cyc>=evt){pc=11610;return;}
case 11610:cyc+=4;and(A);
if(cyc>=evt){pc=11611;return;}
case 11611:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=11612;return;}
case 11612:cyc+=16;A=rd(49462);
if(cyc>=evt){pc=11615;return;}
case 11615:cyc+=4;and(A);
if(cyc>=evt){pc=11616;return;}
case 11616:cyc+=8;if(!fz){cyc+=4;pc=11623;return;}
if(cyc>=evt){pc=11618;return;}
case 11618:cyc+=24;push(11621);pc=14912;return;
if(cyc>=evt){pc=11621;return;}
case 11621:cyc+=8;if(!fz){cyc+=4;pc=11626;return;}
if(cyc>=evt){pc=11623;return;}
case 11623:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=11626;return;}
case 11626:cyc+=16;pushaf();
if(cyc>=evt){pc=11627;return;}
case 11627:cyc+=8;A=10;
if(cyc>=evt){pc=11629;return;}
case 11629:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=11632;return;}
case 11632:cyc+=12;popaf();
if(cyc>=evt){pc=11633;return;}
case 11633:cyc+=12;B=76;C=168;
if(cyc>=evt){pc=11636;return;}
case 11636:cyc+=4;add(C);
if(cyc>=evt){pc=11637;return;}
case 11637:cyc+=4;C=A;
if(cyc>=evt){pc=11638;return;}
case 11638:cyc+=8;if(!fc){cyc+=4;pc=11641;return;}
if(cyc>=evt){pc=11640;return;}
case 11640:cyc+=4;B=inc(B);
if(cyc>=evt){pc=11641;return;}
case 11641:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=11642;return;}
case 11642:cyc+=8;fz=(A>>3)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11644;return;}
case 11644:cyc+=8;if(!fz){cyc+=4;pc=11651;return;}
if(cyc>=evt){pc=11646;return;}
case 11646:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11648;return;}
case 11648:cyc+=8;if(!fz){cyc+=4;pc=11687;return;}
if(cyc>=evt){pc=11650;return;}
case 11650:cyc+=16;pc=pop();return;
case 11651:cyc+=24;push(11654);pc=13378;return;
if(cyc>=evt){pc=11654;return;}
case 11654:cyc+=12;B=255;C=0;
if(cyc>=evt){pc=11657;return;}
case 11657:cyc+=8;cp(11);
if(cyc>=evt){pc=11659;return;}
case 11659:cyc+=8;if(fz){cyc+=4;pc=11670;return;}
if(cyc>=evt){pc=11661;return;}
case 11661:cyc+=24;push(11664);pc=13406;return;
if(cyc>=evt){pc=11664;return;}
case 11664:cyc+=12;B=255;C=255;
if(cyc>=evt){pc=11667;return;}
case 11667:cyc+=8;cp(11);
if(cyc>=evt){pc=11669;return;}
case 11669:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=11670;return;}
case 11670:cyc+=24;push(11673);pc=11870;return;
if(cyc>=evt){pc=11673;return;}
case 11673:cyc+=4;A=B;
if(cyc>=evt){pc=11674;return;}
case 11674:cyc+=16;wr(49521,A);
if(cyc>=evt){pc=11677;return;}
case 11677:cyc+=4;A=C;
if(cyc>=evt){pc=11678;return;}
case 11678:cyc+=16;wr(49522,A);
if(cyc>=evt){pc=11681;return;}
case 11681:cyc+=8;A=4;
if(cyc>=evt){pc=11683;return;}
case 11683:cyc+=16;wr(49523,A);
if(cyc>=evt){pc=11686;return;}
case 11686:cyc+=16;pc=pop();return;
case 11687:cyc+=16;A=rd(49511);
if(cyc>=evt){pc=11690;return;}
case 11690:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11692;return;}
case 11692:cyc+=8;if(fz){cyc+=4;pc=11700;return;}
if(cyc>=evt){pc=11694;return;}
case 11694:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=11697;return;}
case 11697:cyc+=4;and(A);
if(cyc>=evt){pc=11698;return;}
case 11698:cyc+=8;if(!fz){cyc+=4;pc=11741;return;}
if(cyc>=evt){pc=11700;return;}
case 11700:cyc+=24;push(11703);pc=13346;return;
if(cyc>=evt){pc=11703;return;}
case 11703:cyc+=12;B=0;C=255;
if(cyc>=evt){pc=11706;return;}
case 11706:cyc+=12;H=193;L=17;
if(cyc>=evt){pc=11709;return;}
case 11709:cyc+=12;fz=(rd((H<<8|L))>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11711;return;}
case 11711:cyc+=8;if(fz){cyc+=4;pc=11714;return;}
if(cyc>=evt){pc=11713;return;}
case 11713:cyc+=4;C=dec(C);
if(cyc>=evt){pc=11714;return;}
case 11714:cyc+=8;cp(11);
if(cyc>=evt){pc=11716;return;}
case 11716:cyc+=8;if(fz){cyc+=4;pc=11670;return;}
if(cyc>=evt){pc=11718;return;}
case 11718:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=11721;return;}
case 11721:cyc+=4;and(A);
if(cyc>=evt){pc=11722;return;}
case 11722:cyc+=8;if(fz){cyc+=4;pc=11741;return;}
if(cyc>=evt){pc=11724;return;}
case 11724:cyc+=16;A=rd(49511);
if(cyc>=evt){pc=11727;return;}
case 11727:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11729;return;}
case 11729:cyc+=8;if(!fz){cyc+=4;pc=11741;return;}
if(cyc>=evt){pc=11731;return;}
case 11731:cyc+=24;push(11734);pc=13346;return;
if(cyc>=evt){pc=11734;return;}
case 11734:cyc+=8;cp(20);
if(cyc>=evt){pc=11736;return;}
case 11736:cyc+=8;if(fz){cyc+=4;pc=11741;return;}
if(cyc>=evt){pc=11738;return;}
case 11738:cyc+=8;cp(0);
if(cyc>=evt){pc=11740;return;}
case 11740:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=11741;return;}
case 11741:cyc+=24;push(11744);pc=13304;return;
if(cyc>=evt){pc=11744;return;}
case 11744:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=11747;return;}
case 11747:cyc+=12;H=193;L=17;
if(cyc>=evt){pc=11750;return;}
case 11750:cyc+=12;fz=(rd((H<<8|L))>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11752;return;}
case 11752:cyc+=8;if(fz){cyc+=4;pc=11755;return;}
if(cyc>=evt){pc=11754;return;}
case 11754:cyc+=4;C=dec(C);
if(cyc>=evt){pc=11755;return;}
case 11755:cyc+=8;cp(11);
if(cyc>=evt){pc=11757;return;}
case 11757:cyc+=8;if(fz){cyc+=4;pc=11670;return;}
if(cyc>=evt){pc=11759;return;}
case 11759:cyc+=16;pc=pop();return;
case 11760:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=11763;return;}
case 11763:cyc+=4;and(A);
if(cyc>=evt){pc=11764;return;}
case 11764:cyc+=8;if(!fz){cyc+=4;pc=11771;return;}
if(cyc>=evt){pc=11766;return;}
case 11766:cyc+=24;push(11769);pc=13346;return;
if(cyc>=evt){pc=11769;return;}
case 11769:cyc+=12;pc=11774;return;
case 11771:cyc+=24;push(11774);pc=13304;return;
pc=11774;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 11774:cyc+=24;push(11777);pc=13498;return;
if(cyc>=evt){pc=11777;return;}
case 11777:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11779;return;}
case 11779:cyc+=16;pc=pop();return;
case 11780:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=11783;return;}
case 11783:cyc+=4;and(A);
if(cyc>=evt){pc=11784;return;}
case 11784:cyc+=8;if(!fz){cyc+=4;pc=11794;return;}
if(cyc>=evt){pc=11786;return;}
case 11786:cyc+=24;push(11789);pc=13304;return;
if(cyc>=evt){pc=11789;return;}
case 11789:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=11792;return;}
case 11792:cyc+=12;pc=11800;return;
case 11794:cyc+=24;push(11797);pc=13346;return;
if(cyc>=evt){pc=11797;return;}
case 11797:cyc+=12;B=0;C=255;
if(cyc>=evt){pc=11800;return;}
case 11800:cyc+=8;cp(10);
if(cyc>=evt){pc=11802;return;}
case 11802:cyc+=16;pc=pop();return;
case 11803:cyc+=24;push(11806);pc=13304;return;
if(cyc>=evt){pc=11806;return;}
case 11806:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=11809;return;}
case 11809:cyc+=8;cp(22);
if(cyc>=evt){pc=11811;return;}
case 11811:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=11812;return;}
case 11812:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=11815;return;}
case 11815:cyc+=4;and(A);
if(cyc>=evt){pc=11816;return;}
case 11816:cyc+=8;if(!fz){cyc+=4;pc=11826;return;}
if(cyc>=evt){pc=11818;return;}
case 11818:cyc+=24;push(11821);pc=13422;return;
if(cyc>=evt){pc=11821;return;}
case 11821:cyc+=12;B=0;C=1;
if(cyc>=evt){pc=11824;return;}
case 11824:cyc+=12;pc=11832;return;
case 11826:cyc+=24;push(11829);pc=13346;return;
if(cyc>=evt){pc=11829;return;}
case 11829:cyc+=12;B=0;C=255;
if(cyc>=evt){pc=11832;return;}
case 11832:cyc+=8;cp(22);
if(cyc>=evt){pc=11834;return;}
case 11834:cyc+=16;pc=pop();return;
case 11835:cyc+=24;push(11838);pc=13346;return;
if(cyc>=evt){pc=11838;return;}
case 11838:cyc+=24;push(11841);pc=13498;return;
if(cyc>=evt){pc=11841;return;}
case 11841:cyc+=4;C=A;
if(cyc>=evt){pc=11842;return;}
case 11842:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11844;return;}
case 11844:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=11845;return;}
case 11845:cyc+=24;push(11848);pc=13304;return;
if(cyc>=evt){pc=11848;return;}
case 11848:cyc+=24;push(11851);pc=13498;return;
if(cyc>=evt){pc=11851;return;}
case 11851:cyc+=4;B=A;
if(cyc>=evt){pc=11852;return;}
case 11852:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11854;return;}
case 11854:cyc+=16;pc=pop();return;
case 11855:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=11858;return;}
case 11858:cyc+=12;H=193;L=28;
if(cyc>=evt){pc=11861;return;}
case 11861:cyc+=8;sub(rd((H<<8|L)));
if(cyc>=evt){pc=11862;return;}
case 11862:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11864;return;}
case 11864:cyc+=8;if(fz){cyc+=4;pc=11869;return;}
if(cyc>=evt){pc=11866;return;}
case 11866:cyc+=8;xor(255);
if(cyc>=evt){pc=11868;return;}
case 11868:cyc+=4;A=inc(A);
if(cyc>=evt){pc=11869;return;}
case 11869:cyc+=16;pc=pop();return;
case 11870:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=11873;return;}
case 11873:cyc+=4;D=A;
if(cyc>=evt){pc=11874;return;}
case 11874:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=11877;return;}
case 11877:cyc+=4;add(B);
if(cyc>=evt){pc=11878;return;}
case 11878:cyc+=4;B=A;
if(cyc>=evt){pc=11879;return;}
case 11879:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11881;return;}
case 11881:cyc+=8;if(fz){cyc+=4;pc=11902;return;}
if(cyc>=evt){pc=11883;return;}
case 11883:cyc+=8;add(3);
if(cyc>=evt){pc=11885;return;}
case 11885:cyc+=4;B=A;
if(cyc>=evt){pc=11886;return;}
case 11886:cyc+=12;H=198;L=210;
if(cyc>=evt){pc=11889;return;}
case 11889:cyc+=4;A=D;
if(cyc>=evt){pc=11890;return;}
case 11890:cyc+=8;A=sla(A);
if(cyc>=evt){pc=11892;return;}
case 11892:cyc+=8;A=sla(A);
if(cyc>=evt){pc=11894;return;}
case 11894:cyc+=4;add(L);
if(cyc>=evt){pc=11895;return;}
case 11895:cyc+=4;L=A;
if(cyc>=evt){pc=11896;return;}
case 11896:cyc+=8;if(!fc){cyc+=4;pc=11899;return;}
if(cyc>=evt){pc=11898;return;}
case 11898:cyc+=4;H=inc(H);
if(cyc>=evt){pc=11899;return;}
case 11899:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=11900;return;}
case 11900:cyc+=4;A=dec(A);
if(cyc>=evt){pc=11901;return;}
case 11901:cyc+=4;D=A;
if(cyc>=evt){pc=11902;return;}
case 11902:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=11905;return;}
case 11905:cyc+=4;A=inc(A);
if(cyc>=evt){pc=11906;return;}
case 11906:cyc+=8;A=sra(A);
if(cyc>=evt){pc=11908;return;}
case 11908:cyc+=4;add(C);
if(cyc>=evt){pc=11909;return;}
case 11909:cyc+=4;C=A;
if(cyc>=evt){pc=11910;return;}
case 11910:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=11912;return;}
case 11912:cyc+=8;if(fz){cyc+=4;pc=11933;return;}
if(cyc>=evt){pc=11914;return;}
case 11914:cyc+=8;add(10);
if(cyc>=evt){pc=11916;return;}
case 11916:cyc+=4;C=A;
if(cyc>=evt){pc=11917;return;}
case 11917:cyc+=12;H=198;L=208;
if(cyc>=evt){pc=11920;return;}
case 11920:cyc+=4;A=D;
if(cyc>=evt){pc=11921;return;}
case 11921:cyc+=8;A=sla(A);
if(cyc>=evt){pc=11923;return;}
case 11923:cyc+=8;A=sla(A);
if(cyc>=evt){pc=11925;return;}
case 11925:cyc+=4;add(L);
if(cyc>=evt){pc=11926;return;}
case 11926:cyc+=4;L=A;
if(cyc>=evt){pc=11927;return;}
case 11927:cyc+=8;if(!fc){cyc+=4;pc=11930;return;}
if(cyc>=evt){pc=11929;return;}
case 11929:cyc+=4;H=inc(H);
if(cyc>=evt){pc=11930;return;}
case 11930:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=11931;return;}
case 11931:cyc+=4;A=dec(A);
if(cyc>=evt){pc=11932;return;}
case 11932:cyc+=4;D=A;
if(cyc>=evt){pc=11933;return;}
case 11933:cyc+=12;H=0;L=11;
if(cyc>=evt){pc=11936;return;}
case 11936:cyc+=4;A=L;
if(cyc>=evt){pc=11937;return;}
case 11937:cyc+=4;add(B);
if(cyc>=evt){pc=11938;return;}
case 11938:cyc+=4;L=A;
if(cyc>=evt){pc=11939;return;}
case 11939:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=11940;return;}
case 11940:cyc+=4;add(C);
if(cyc>=evt){pc=11941;return;}
case 11941:cyc+=4;C=A;
if(cyc>=evt){pc=11942;return;}
case 11942:cyc+=4;B=D;
if(cyc>=evt){pc=11943;return;}
case 11943:cyc+=16;pc=pop();return;
case 11944:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=11947;return;}
case 11947:cyc+=4;B=A;
if(cyc>=evt){pc=11948;return;}
case 11948:cyc+=12;H=0;L=11;
if(cyc>=evt){pc=11951;return;}
case 11951:cyc+=16;A=rd(49437);
if(cyc>=evt){pc=11954;return;}
case 11954:cyc+=4;add(L);
if(cyc>=evt){pc=11955;return;}
case 11955:cyc+=4;L=A;
if(cyc>=evt){pc=11956;return;}
case 11956:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=11959;return;}
case 11959:cyc+=8;A=sra(A);
if(cyc>=evt){pc=11961;return;}
case 11961:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=11962;return;}
case 11962:cyc+=4;C=A;
if(cyc>=evt){pc=11963;return;}
case 11963:cyc+=16;pc=pop();return;
case 11964:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=11965;return;}
case 11965:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=11966;return;}
case 11966:cyc+=4;A=B;
if(cyc>=evt){pc=11967;return;}
case 11967:cyc+=12;B=0;C=30;
if(cyc>=evt){pc=11970;return;}
case 11970:cyc+=24;push(11973);pc=7544;return;
if(cyc>=evt){pc=11973;return;}
case 11973:cyc+=12;B=196;C=0;
if(cyc>=evt){pc=11976;return;}
case 11976:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=11977;return;}
case 11977:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=11978;return;}
case 11978:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=11979;return;}
case 11979:cyc+=4;A=L;
if(cyc>=evt){pc=11980;return;}
case 11980:cyc+=4;add(C);
if(cyc>=evt){pc=11981;return;}
case 11981:cyc+=4;L=A;
if(cyc>=evt){pc=11982;return;}
case 11982:cyc+=8;if(!fc){cyc+=4;pc=11985;return;}
if(cyc>=evt){pc=11984;return;}
case 11984:cyc+=4;H=inc(H);
if(cyc>=evt){pc=11985;return;}
case 11985:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=11986;return;}
case 11986:cyc+=8;and(224);
if(cyc>=evt){pc=11988;return;}
case 11988:cyc+=16;wr(49517,A);
if(cyc>=evt){pc=11991;return;}
case 11991:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=11992;return;}
case 11992:cyc+=8;and(31);
if(cyc>=evt){pc=11994;return;}
case 11994:cyc+=4;D=A;
if(cyc>=evt){pc=11995;return;}
case 11995:cyc+=4;A=E;
if(cyc>=evt){pc=11996;return;}
case 11996:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=11997;return;}
case 11997:cyc+=8;A=1;
if(cyc>=evt){pc=11999;return;}
case 11999:cyc+=4;cp(E);
if(cyc>=evt){pc=12000;return;}
case 12000:cyc+=8;if(!fz){cyc+=4;pc=12011;return;}
if(cyc>=evt){pc=12002;return;}
case 12002:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=12003;return;}
case 12003:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=12004;return;}
case 12004:cyc+=8;and(31);
if(cyc>=evt){pc=12006;return;}
case 12006:cyc+=8;cp(1);
if(cyc>=evt){pc=12008;return;}
case 12008:cyc+=8;if(!fz){cyc+=4;pc=12011;return;}
if(cyc>=evt){pc=12010;return;}
case 12010:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12011;return;}
case 12011:cyc+=4;A=D;
if(cyc>=evt){pc=12012;return;}
case 12012:cyc+=4;cp(E);
if(cyc>=evt){pc=12013;return;}
case 12013:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=12014;return;}
case 12014:cyc+=8;A=1;
if(cyc>=evt){pc=12016;return;}
case 12016:cyc+=16;wr(49497,A);
if(cyc>=evt){pc=12019;return;}
case 12019:cyc+=16;pc=pop();return;
case 12020:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=12021;return;}
case 12021:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=12022;return;}
case 12022:cyc+=4;A=B;
if(cyc>=evt){pc=12023;return;}
case 12023:cyc+=12;B=0;C=30;
if(cyc>=evt){pc=12026;return;}
case 12026:cyc+=24;push(12029);pc=7544;return;
if(cyc>=evt){pc=12029;return;}
case 12029:cyc+=12;B=196;C=0;
if(cyc>=evt){pc=12032;return;}
case 12032:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=12033;return;}
case 12033:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=12034;return;}
case 12034:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=12035;return;}
case 12035:cyc+=4;A=L;
if(cyc>=evt){pc=12036;return;}
case 12036:cyc+=4;add(C);
if(cyc>=evt){pc=12037;return;}
case 12037:cyc+=4;L=A;
if(cyc>=evt){pc=12038;return;}
case 12038:cyc+=8;if(!fc){cyc+=4;pc=12041;return;}
if(cyc>=evt){pc=12040;return;}
case 12040:cyc+=4;H=inc(H);
if(cyc>=evt){pc=12041;return;}
case 12041:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=12042;return;}
case 12042:cyc+=8;and(31);
if(cyc>=evt){pc=12044;return;}
case 12044:cyc+=4;or(E);
if(cyc>=evt){pc=12045;return;}
case 12045:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=12046;return;}
case 12046:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=12047;return;}
case 12047:cyc+=16;pc=pop();return;
case 12048:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=12049;return;}
case 12049:cyc+=4;A=B;
if(cyc>=evt){pc=12050;return;}
case 12050:cyc+=12;B=0;C=30;
if(cyc>=evt){pc=12053;return;}
case 12053:cyc+=24;push(12056);pc=7544;return;
if(cyc>=evt){pc=12056;return;}
case 12056:cyc+=12;B=196;C=0;
if(cyc>=evt){pc=12059;return;}
case 12059:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=12060;return;}
case 12060:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=12061;return;}
case 12061:cyc+=4;A=L;
if(cyc>=evt){pc=12062;return;}
case 12062:cyc+=4;add(C);
if(cyc>=evt){pc=12063;return;}
case 12063:cyc+=4;L=A;
if(cyc>=evt){pc=12064;return;}
case 12064:cyc+=8;if(!fc){cyc+=4;pc=12067;return;}
if(cyc>=evt){pc=12066;return;}
case 12066:cyc+=4;H=inc(H);
if(cyc>=evt){pc=12067;return;}
case 12067:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=12068;return;}
case 12068:cyc+=8;and(224);
if(cyc>=evt){pc=12070;return;}
case 12070:cyc+=16;pc=pop();return;
case 12071:cyc+=16;A=rd(49418);
if(cyc>=evt){pc=12074;return;}
case 12074:cyc+=12;H=193;L=11;
if(cyc>=evt){pc=12077;return;}
case 12077:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=12078;return;}
case 12078:cyc+=8;if(fc){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=12079;return;}
case 12079:cyc+=4;xor(A);
if(cyc>=evt){pc=12080;return;}
case 12080:cyc+=16;wr(49418,A);
if(cyc>=evt){pc=12083;return;}
case 12083:cyc+=24;push(12086);pc=13064;return;
if(cyc>=evt){pc=12086;return;}
case 12086:cyc+=24;push(12089);pc=14356;return;
if(cyc>=evt){pc=12089;return;}
case 12089:cyc+=24;push(12092);pc=14246;return;
if(cyc>=evt){pc=12092;return;}
case 12092:cyc+=12;H=193;L=32;
if(cyc>=evt){pc=12095;return;}
case 12095:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=12098;return;}
case 12098:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12100;return;}
case 12100:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12102;return;}
case 12102:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12104;return;}
case 12104:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12105;return;}
case 12105:cyc+=12;B=0;C=4;
if(cyc>=evt){pc=12108;return;}
case 12108:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=12111;return;}
case 12111:cyc+=4;add(C);
if(cyc>=evt){pc=12112;return;}
case 12112:cyc+=4;C=A;
if(cyc>=evt){pc=12113;return;}
case 12113:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=12114;return;}
case 12114:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12115;return;}
case 12115:cyc+=16;A=rd(49423);
if(cyc>=evt){pc=12118;return;}
case 12118:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12119;return;}
case 12119:cyc+=24;push(12122);pc=5944;return;
if(cyc>=evt){pc=12122;return;}
case 12122:cyc+=12;H=193;L=40;
if(cyc>=evt){pc=12125;return;}
case 12125:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=12128;return;}
case 12128:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12130;return;}
case 12130:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12132;return;}
case 12132:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12134;return;}
case 12134:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12135;return;}
case 12135:cyc+=12;B=0;C=4;
if(cyc>=evt){pc=12138;return;}
case 12138:cyc+=16;A=rd(49437);
if(cyc>=evt){pc=12141;return;}
case 12141:cyc+=4;add(C);
if(cyc>=evt){pc=12142;return;}
case 12142:cyc+=4;C=A;
if(cyc>=evt){pc=12143;return;}
case 12143:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=12144;return;}
case 12144:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12145;return;}
case 12145:cyc+=16;A=rd(49434);
if(cyc>=evt){pc=12148;return;}
case 12148:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12149;return;}
case 12149:cyc+=24;push(12152);pc=6463;return;
if(cyc>=evt){pc=12152;return;}
case 12152:cyc+=24;push(12155);pc=12316;return;
if(cyc>=evt){pc=12155;return;}
case 12155:cyc+=12;H=198;L=208;
if(cyc>=evt){pc=12158;return;}
case 12158:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=12161;return;}
case 12161:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
pc=12163;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 12163:cyc+=8;if(fz){cyc+=4;pc=12172;return;}
if(cyc>=evt){pc=12165;return;}
case 12165:cyc+=8;add(20);
if(cyc>=evt){pc=12167;return;}
case 12167:cyc+=16;wr(49425,A);
if(cyc>=evt){pc=12170;return;}
case 12170:cyc+=12;pc=12211;return;
case 12172:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=12173;return;}
case 12173:cyc+=8;cp(20);
if(cyc>=evt){pc=12175;return;}
case 12175:cyc+=8;if(fc){cyc+=4;pc=12184;return;}
if(cyc>=evt){pc=12177;return;}
case 12177:cyc+=8;sub(20);
if(cyc>=evt){pc=12179;return;}
case 12179:cyc+=16;wr(49425,A);
if(cyc>=evt){pc=12182;return;}
case 12182:cyc+=12;pc=12211;return;
case 12184:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=12185;return;}
case 12185:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=12188;return;}
case 12188:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=12190;return;}
case 12190:cyc+=8;if(fz){cyc+=4;pc=12199;return;}
if(cyc>=evt){pc=12192;return;}
case 12192:cyc+=8;add(3);
if(cyc>=evt){pc=12194;return;}
case 12194:cyc+=16;wr(49426,A);
if(cyc>=evt){pc=12197;return;}
case 12197:cyc+=12;pc=12211;return;
case 12199:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=12200;return;}
case 12200:cyc+=8;cp(3);
if(cyc>=evt){pc=12202;return;}
case 12202:cyc+=8;if(fc){cyc+=4;pc=12310;return;}
if(cyc>=evt){pc=12204;return;}
case 12204:cyc+=8;sub(3);
if(cyc>=evt){pc=12206;return;}
case 12206:cyc+=16;wr(49426,A);
if(cyc>=evt){pc=12209;return;}
case 12209:cyc+=12;pc=12211;return;
case 12211:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=12212;return;}
case 12212:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=12213;return;}
case 12213:cyc+=24;push(12216);pc=13229;return;
if(cyc>=evt){pc=12216;return;}
case 12216:cyc+=4;xor(A);
if(cyc>=evt){pc=12217;return;}
case 12217:cyc+=16;wr(49463,A);
if(cyc>=evt){pc=12220;return;}
case 12220:cyc+=8;A=106;
if(cyc>=evt){pc=12222;return;}
case 12222:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=12225;return;}
case 12225:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=12226;return;}
case 12226:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=12227;return;}
case 12227:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=12230;return;}
case 12230:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12232;return;}
case 12232:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12234;return;}
case 12234:cyc+=4;C=A;
if(cyc>=evt){pc=12235;return;}
case 12235:cyc+=8;B=0;
if(cyc>=evt){pc=12237;return;}
case 12237:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=12238;return;}
case 12238:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=12239;return;}
case 12239:cyc+=4;or(A);
if(cyc>=evt){pc=12240;return;}
case 12240:cyc+=8;if(fz){cyc+=4;pc=12253;return;}
if(cyc>=evt){pc=12242;return;}
case 12242:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=12244;return;}
case 12244:cyc+=8;if(fz){cyc+=4;pc=12253;return;}
if(cyc>=evt){pc=12246;return;}
case 12246:cyc+=8;A=1;
if(cyc>=evt){pc=12248;return;}
case 12248:cyc+=16;wr(49512,A);
if(cyc>=evt){pc=12251;return;}
case 12251:cyc+=12;pc=12310;return;
case 12253:cyc+=4;A=dec(A);
if(cyc>=evt){pc=12254;return;}
case 12254:cyc+=16;wr(49484,A);
if(cyc>=evt){pc=12257;return;}
case 12257:cyc+=16;A=rd(49506);
if(cyc>=evt){pc=12260;return;}
case 12260:cyc+=16;wr(49505,A);
if(cyc>=evt){pc=12263;return;}
case 12263:cyc+=24;push(12266);pc=7524;return;
if(cyc>=evt){pc=12266;return;}
case 12266:cyc+=24;push(12269);pc=13073;return;
if(cyc>=evt){pc=12269;return;}
case 12269:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=12272;return;}
case 12272:cyc+=8;cp(1);
if(cyc>=evt){pc=12274;return;}
case 12274:cyc+=8;if(!fz){cyc+=4;pc=12290;return;}
if(cyc>=evt){pc=12276;return;}
case 12276:cyc+=16;A=rd(49504);
if(cyc>=evt){pc=12279;return;}
case 12279:cyc+=8;cp(6);
if(cyc>=evt){pc=12281;return;}
case 12281:cyc+=8;if(!fz){cyc+=4;pc=12290;return;}
if(cyc>=evt){pc=12283;return;}
case 12283:cyc+=8;A=9;
if(cyc>=evt){pc=12285;return;}
case 12285:cyc+=24;push(12288);pc=14993;return;
if(cyc>=evt){pc=12288;return;}
case 12288:cyc+=12;pc=12303;return;
case 12290:cyc+=12;B=6;C=1;
if(cyc>=evt){pc=12293;return;}
case 12293:cyc+=24;push(12296);pc=14894;return;
if(cyc>=evt){pc=12296;return;}
case 12296:cyc+=8;if(!fz){cyc+=4;pc=12303;return;}
if(cyc>=evt){pc=12298;return;}
case 12298:cyc+=8;A=1;
if(cyc>=evt){pc=12300;return;}
case 12300:cyc+=24;push(12303);pc=14993;return;
if(cyc>=evt){pc=12303;return;}
case 12303:cyc+=4;xor(A);
if(cyc>=evt){pc=12304;return;}
case 12304:cyc+=16;wr(49524,A);
if(cyc>=evt){pc=12307;return;}
case 12307:cyc+=16;wr(49589,A);
if(cyc>=evt){pc=12310;return;}
case 12310:cyc+=8;A=1;
if(cyc>=evt){pc=12312;return;}
case 12312:cyc+=16;wr(49496,A);
if(cyc>=evt){pc=12315;return;}
case 12315:cyc+=16;pc=pop();return;
case 12316:cyc+=24;push(12319);pc=11431;return;
if(cyc>=evt){pc=12319;return;}
case 12319:cyc+=12;if(fz){cyc+=4;pc=12471;return;}
if(cyc>=evt){pc=12322;return;}
case 12322:cyc+=16;A=rd(49460);
if(cyc>=evt){pc=12325;return;}
case 12325:cyc+=8;cp(89);
if(cyc>=evt){pc=12327;return;}
case 12327:cyc+=8;if(!fz){cyc+=4;pc=12363;return;}
if(cyc>=evt){pc=12329;return;}
case 12329:cyc+=8;A=8;
if(cyc>=evt){pc=12331;return;}
case 12331:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=12334;return;}
case 12334:cyc+=12;H=64;L=69;
if(cyc>=evt){pc=12337;return;}
case 12337:cyc+=16;A=rd(49408);
if(cyc>=evt){pc=12340;return;}
case 12340:cyc+=8;cp(17);
if(cyc>=evt){pc=12342;return;}
case 12342:cyc+=8;if(!fz){cyc+=4;pc=12347;return;}
if(cyc>=evt){pc=12344;return;}
case 12344:cyc+=12;H=64;L=174;
if(cyc>=evt){pc=12347;return;}
case 12347:cyc+=24;push(12350);pc=8129;return;
if(cyc>=evt){pc=12350;return;}
case 12350:cyc+=12;D=132;E=208;
if(cyc>=evt){pc=12353;return;}
case 12353:cyc+=24;push(12356);pc=4858;return;
if(cyc>=evt){pc=12356;return;}
case 12356:cyc+=8;A=1;
if(cyc>=evt){pc=12358;return;}
case 12358:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=12361;return;}
case 12361:cyc+=12;pc=12391;return;
case 12363:cyc+=12;H=192;L=2;
if(cyc>=evt){pc=12366;return;}
case 12366:cyc+=8;A=rd((H<<8|L));if(!L)H=(H-1)&255;L=(L-1)&255;
if(cyc>=evt){pc=12367;return;}
case 12367:cyc+=8;cp(77);
if(cyc>=evt){pc=12369;return;}
case 12369:cyc+=8;if(!fz){cyc+=4;pc=12385;return;}
if(cyc>=evt){pc=12371;return;}
case 12371:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=12374;return;}
case 12374:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12376;return;}
case 12376:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12378;return;}
case 12378:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12380;return;}
case 12380:cyc+=8;add(8);
if(cyc>=evt){pc=12382;return;}
case 12382:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=12383;return;}
case 12383:cyc+=8;if(fz){cyc+=4;pc=12391;return;}
if(cyc>=evt){pc=12385;return;}
case 12385:cyc+=12;B=64;C=144;
if(cyc>=evt){pc=12388;return;}
case 12388:cyc+=24;push(12391);pc=15065;return;
if(cyc>=evt){pc=12391;return;}
case 12391:cyc+=12;H=192;L=0;
if(cyc>=evt){pc=12394;return;}
case 12394:cyc+=12;B=0;C=4;
if(cyc>=evt){pc=12397;return;}
case 12397:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=12400;return;}
case 12400:cyc+=4;add(C);
if(cyc>=evt){pc=12401;return;}
case 12401:cyc+=4;C=A;
if(cyc>=evt){pc=12402;return;}
case 12402:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=12403;return;}
case 12403:cyc+=8;add(40);
if(cyc>=evt){pc=12405;return;}
case 12405:cyc+=4;E=A;
if(cyc>=evt){pc=12406;return;}
case 12406:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12407;return;}
case 12407:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=12410;return;}
case 12410:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12412;return;}
case 12412:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12414;return;}
case 12414:cyc+=8;A=sla(A);
if(cyc>=evt){pc=12416;return;}
case 12416:cyc+=8;add(8);
if(cyc>=evt){pc=12418;return;}
case 12418:cyc+=4;D=A;
if(cyc>=evt){pc=12419;return;}
case 12419:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12420;return;}
case 12420:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=12421;return;}
case 12421:cyc+=8;A=77;
if(cyc>=evt){pc=12423;return;}
case 12423:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12424;return;}
case 12424:cyc+=8;A=5;
if(cyc>=evt){pc=12426;return;}
case 12426:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12427;return;}
case 12427:cyc+=4;A=E;
if(cyc>=evt){pc=12428;return;}
case 12428:cyc+=8;add(8);
if(cyc>=evt){pc=12430;return;}
case 12430:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12431;return;}
case 12431:cyc+=4;A=D;
if(cyc>=evt){pc=12432;return;}
case 12432:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12433;return;}
case 12433:cyc+=8;A=78;
if(cyc>=evt){pc=12435;return;}
case 12435:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12436;return;}
case 12436:cyc+=8;A=5;
if(cyc>=evt){pc=12438;return;}
case 12438:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12439;return;}
case 12439:cyc+=12;H=192;L=132;
if(cyc>=evt){pc=12442;return;}
case 12442:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=12443;return;}
case 12443:cyc+=4;E=inc(E);
if(cyc>=evt){pc=12444;return;}
case 12444:cyc+=4;A=E;
if(cyc>=evt){pc=12445;return;}
case 12445:cyc+=8;sub(8);
if(cyc>=evt){pc=12447;return;}
case 12447:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12448;return;}
case 12448:cyc+=4;A=D;
if(cyc>=evt){pc=12449;return;}
case 12449:cyc+=8;add(8);
if(cyc>=evt){pc=12451;return;}
case 12451:cyc+=4;D=A;
if(cyc>=evt){pc=12452;return;}
case 12452:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12453;return;}
case 12453:cyc+=8;A=126;
if(cyc>=evt){pc=12455;return;}
case 12455:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12456;return;}
case 12456:cyc+=8;A=5;
if(cyc>=evt){pc=12458;return;}
case 12458:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12459;return;}
case 12459:cyc+=4;A=E;
if(cyc>=evt){pc=12460;return;}
case 12460:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12461;return;}
case 12461:cyc+=4;A=D;
if(cyc>=evt){pc=12462;return;}
case 12462:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12463;return;}
case 12463:cyc+=8;A=127;
if(cyc>=evt){pc=12465;return;}
case 12465:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12466;return;}
case 12466:cyc+=8;A=5;
if(cyc>=evt){pc=12468;return;}
case 12468:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12469;return;}
case 12469:cyc+=12;pc=12494;return;
case 12471:cyc+=12;H=192;L=0;
if(cyc>=evt){pc=12474;return;}
case 12474:cyc+=8;B=2;
if(cyc>=evt){pc=12476;return;}
case 12476:cyc+=24;push(12479);pc=7535;return;
if(cyc>=evt){pc=12479;return;}
case 12479:cyc+=12;H=192;L=132;
if(cyc>=evt){pc=12482;return;}
case 12482:cyc+=16;A=rd(49286);
if(cyc>=evt){pc=12485;return;}
case 12485:cyc+=8;cp(126);
if(cyc>=evt){pc=12487;return;}
case 12487:cyc+=8;if(!fz){cyc+=4;pc=12494;return;}
if(cyc>=evt){pc=12489;return;}
case 12489:cyc+=8;B=7;
if(cyc>=evt){pc=12491;return;}
case 12491:cyc+=24;push(12494);pc=7535;return;
if(cyc>=evt){pc=12494;return;}
case 12494:cyc+=12;H=192;L=132;
if(cyc>=evt){pc=12497;return;}
case 12497:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=12498;return;}
case 12498:cyc+=24;push(12501);pc=11446;return;
if(cyc>=evt){pc=12501;return;}
case 12501:cyc+=12;if(!fz){cyc+=12;push(12504);pc=12635;return;}
if(cyc>=evt){pc=12504;return;}
case 12504:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=12505;return;}
case 12505:cyc+=12;B=6;C=1;
if(cyc>=evt){pc=12508;return;}
case 12508:cyc+=24;push(12511);pc=14894;return;
if(cyc>=evt){pc=12511;return;}
case 12511:cyc+=8;if(fz){cyc+=4;pc=12527;return;}
if(cyc>=evt){pc=12513;return;}
case 12513:cyc+=12;B=8;C=16;
if(cyc>=evt){pc=12516;return;}
case 12516:cyc+=24;push(12519);pc=14894;return;
if(cyc>=evt){pc=12519;return;}
case 12519:cyc+=8;if(fz){cyc+=4;pc=12527;return;}
if(cyc>=evt){pc=12521;return;}
case 12521:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=12524;return;}
case 12524:cyc+=4;and(A);
if(cyc>=evt){pc=12525;return;}
case 12525:cyc+=8;if(fz){cyc+=4;pc=12533;return;}
if(cyc>=evt){pc=12527;return;}
case 12527:cyc+=24;push(12530);pc=11562;return;
if(cyc>=evt){pc=12530;return;}
case 12530:cyc+=12;if(!fz){cyc+=12;push(12533);pc=12620;return;}
if(cyc>=evt){pc=12533;return;}
case 12533:cyc+=12;H=192;L=8;
if(cyc>=evt){pc=12536;return;}
case 12536:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=12537;return;}
case 12537:cyc+=4;and(A);
if(cyc>=evt){pc=12538;return;}
case 12538:cyc+=8;if(fz){cyc+=4;pc=12611;return;}
if(cyc>=evt){pc=12540;return;}
case 12540:cyc+=8;sub(20);
if(cyc>=evt){pc=12542;return;}
case 12542:cyc+=8;C=255;
if(cyc>=evt){pc=12544;return;}
case 12544:cyc+=4;C=inc(C);
if(cyc>=evt){pc=12545;return;}
case 12545:cyc+=8;sub(40);
if(cyc>=evt){pc=12547;return;}
case 12547:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=12549;return;}
case 12549:cyc+=8;if(fz){cyc+=4;pc=12544;return;}
if(cyc>=evt){pc=12551;return;}
case 12551:cyc+=4;A=C;
if(cyc>=evt){pc=12552;return;}
case 12552:cyc+=8;cp(3);
if(cyc>=evt){pc=12554;return;}
case 12554:cyc+=8;if(!fc){cyc+=4;pc=12609;return;}
if(cyc>=evt){pc=12556;return;}
case 12556:cyc+=12;B=0;C=7;
if(cyc>=evt){pc=12559;return;}
case 12559:cyc+=4;add(C);
if(cyc>=evt){pc=12560;return;}
case 12560:cyc+=4;C=A;
if(cyc>=evt){pc=12561;return;}
case 12561:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=12562;return;}
case 12562:cyc+=4;C=A;
if(cyc>=evt){pc=12563;return;}
case 12563:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=12564;return;}
case 12564:cyc+=8;A=rd((H<<8|L));if(!L)H=(H-1)&255;L=(L-1)&255;
if(cyc>=evt){pc=12565;return;}
case 12565:cyc+=4;and(A);
if(cyc>=evt){pc=12566;return;}
case 12566:cyc+=8;if(fz){cyc+=4;pc=12611;return;}
if(cyc>=evt){pc=12568;return;}
case 12568:cyc+=8;sub(8);
if(cyc>=evt){pc=12570;return;}
case 12570:cyc+=8;A=srl(A);
if(cyc>=evt){pc=12572;return;}
case 12572:cyc+=8;A=srl(A);
if(cyc>=evt){pc=12574;return;}
case 12574:cyc+=8;A=srl(A);
if(cyc>=evt){pc=12576;return;}
case 12576:cyc+=8;A=srl(A);
if(cyc>=evt){pc=12578;return;}
case 12578:cyc+=4;add(C);
if(cyc>=evt){pc=12579;return;}
case 12579:cyc+=4;C=A;
if(cyc>=evt){pc=12580;return;}
case 12580:cyc+=8;B=0;
if(cyc>=evt){pc=12582;return;}
case 12582:cyc+=24;push(12585);pc=13485;return;
if(cyc>=evt){pc=12585;return;}
case 12585:cyc+=24;push(12588);pc=13498;return;
if(cyc>=evt){pc=12588;return;}
case 12588:cyc+=8;and(192);
if(cyc>=evt){pc=12590;return;}
case 12590:cyc+=4;C=A;
if(cyc>=evt){pc=12591;return;}
case 12591:cyc+=8;if(fz){cyc+=4;pc=12611;return;}
if(cyc>=evt){pc=12593;return;}
case 12593:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=12594;return;}
case 12594:cyc+=8;A=rd((H<<8|L));if(!L)H=(H-1)&255;L=(L-1)&255;
if(cyc>=evt){pc=12595;return;}
case 12595:cyc+=8;fz=(A>>3)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=12597;return;}
case 12597:cyc+=8;if(fz){cyc+=4;pc=12605;return;}
pc=12599;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 12599:cyc+=8;fz=(C>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=12601;return;}
case 12601:cyc+=8;if(fz){cyc+=4;pc=12611;return;}
if(cyc>=evt){pc=12603;return;}
case 12603:cyc+=12;pc=12609;return;
case 12605:cyc+=8;fz=(C>>6)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=12607;return;}
case 12607:cyc+=8;if(fz){cyc+=4;pc=12611;return;}
if(cyc>=evt){pc=12609;return;}
case 12609:cyc+=4;xor(A);
if(cyc>=evt){pc=12610;return;}
case 12610:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=12611;return;}
case 12611:cyc+=4;A=L;
if(cyc>=evt){pc=12612;return;}
case 12612:cyc+=8;add(4);
if(cyc>=evt){pc=12614;return;}
case 12614:cyc+=4;L=A;
if(cyc>=evt){pc=12615;return;}
case 12615:cyc+=8;cp(160);
if(cyc>=evt){pc=12617;return;}
case 12617:cyc+=8;if(!fz){cyc+=4;pc=12536;return;}
if(cyc>=evt){pc=12619;return;}
case 12619:cyc+=16;pc=pop();return;
case 12620:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=12621;return;}
case 12621:cyc+=24;push(12624);pc=11944;return;
if(cyc>=evt){pc=12624;return;}
case 12624:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=12625;return;}
case 12625:cyc+=4;xor(A);
if(cyc>=evt){pc=12626;return;}
case 12626:cyc+=16;wr(49588,A);
if(cyc>=evt){pc=12629;return;}
case 12629:cyc+=24;push(12632);pc=12680;return;
if(cyc>=evt){pc=12632;return;}
case 12632:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=12633;return;}
case 12633:cyc+=12;pc=12648;return;
case 12635:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=12636;return;}
case 12636:cyc+=24;push(12639);pc=11870;return;
if(cyc>=evt){pc=12639;return;}
case 12639:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=12640;return;}
case 12640:cyc+=4;xor(A);
if(cyc>=evt){pc=12641;return;}
case 12641:cyc+=16;wr(49588,A);
if(cyc>=evt){pc=12644;return;}
case 12644:cyc+=24;push(12647);pc=12680;return;
if(cyc>=evt){pc=12647;return;}
case 12647:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=12648;return;}
case 12648:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=12651;return;}
case 12651:cyc+=4;cp(B);
if(cyc>=evt){pc=12652;return;}
case 12652:cyc+=8;if(fz){cyc+=4;pc=12661;return;}
if(cyc>=evt){pc=12654;return;}
case 12654:cyc+=8;B=0;
if(cyc>=evt){pc=12656;return;}
case 12656:cyc+=16;A=rd(103);
if(cyc>=evt){pc=12659;return;}
case 12659:cyc+=12;pc=12668;return;
case 12661:cyc+=8;B=0;
if(cyc>=evt){pc=12663;return;}
case 12663:cyc+=12;H=0;L=104;
if(cyc>=evt){pc=12666;return;}
case 12666:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=12667;return;}
case 12667:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=12668;return;}
case 12668:cyc+=4;D=A;
if(cyc>=evt){pc=12669;return;}
case 12669:cyc+=12;H=0;L=145;
if(cyc>=evt){pc=12672;return;}
case 12672:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=12673;return;}
case 12673:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=12674;return;}
case 12674:cyc+=4;E=A;
if(cyc>=evt){pc=12675;return;}
case 12675:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=12676;return;}
case 12676:cyc+=24;push(12679);pc=12856;return;
if(cyc>=evt){pc=12679;return;}
case 12679:cyc+=16;pc=pop();return;
case 12680:cyc+=4;B=inc(B);
if(cyc>=evt){pc=12681;return;}
case 12681:cyc+=12;H=199;L=75;
if(cyc>=evt){pc=12684;return;}
case 12684:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12685;return;}
case 12685:cyc+=8;cp(255);
if(cyc>=evt){pc=12687;return;}
case 12687:cyc+=8;if(fz){cyc+=4;pc=12816;return;}
if(cyc>=evt){pc=12689;return;}
case 12689:cyc+=4;cp(B);
if(cyc>=evt){pc=12690;return;}
case 12690:cyc+=8;if(fz){cyc+=4;pc=12700;return;}
if(cyc>=evt){pc=12692;return;}
case 12692:cyc+=8;if(!fc){cyc+=4;pc=12816;return;}
if(cyc>=evt){pc=12694;return;}
case 12694:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=12695;return;}
case 12695:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=12696;return;}
case 12696:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=12697;return;}
case 12697:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=12698;return;}
case 12698:cyc+=12;pc=12684;return;
case 12700:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12701;return;}
case 12701:cyc+=4;cp(C);
if(cyc>=evt){pc=12702;return;}
case 12702:cyc+=8;if(!fz){cyc+=4;pc=12695;return;}
if(cyc>=evt){pc=12704;return;}
case 12704:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12705;return;}
case 12705:cyc+=12;D=0;E=0;
if(cyc>=evt){pc=12708;return;}
case 12708:cyc+=8;cp(1);
if(cyc>=evt){pc=12710;return;}
case 12710:cyc+=8;if(fz){cyc+=4;pc=12715;return;}
if(cyc>=evt){pc=12712;return;}
case 12712:cyc+=12;D=1;E=64;
if(cyc>=evt){pc=12715;return;}
case 12715:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=12716;return;}
case 12716:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12717;return;}
case 12717:cyc+=4;A=dec(A);
if(cyc>=evt){pc=12718;return;}
case 12718:cyc+=4;B=A;
if(cyc>=evt){pc=12719;return;}
case 12719:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12720;return;}
case 12720:cyc+=4;C=A;
if(cyc>=evt){pc=12721;return;}
case 12721:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=12722;return;}
case 12722:cyc+=24;push(12725);pc=12020;return;
if(cyc>=evt){pc=12725;return;}
case 12725:cyc+=8;if(fz){cyc+=4;pc=12729;return;}
if(cyc>=evt){pc=12727;return;}
case 12727:cyc+=8;D=D|128;
if(cyc>=evt){pc=12729;return;}
case 12729:cyc+=16;pushaf();
if(cyc>=evt){pc=12730;return;}
case 12730:cyc+=16;A=rd(49588);
if(cyc>=evt){pc=12733;return;}
case 12733:cyc+=4;or(D);
if(cyc>=evt){pc=12734;return;}
case 12734:cyc+=16;wr(49588,A);
if(cyc>=evt){pc=12737;return;}
case 12737:cyc+=12;popaf();
if(cyc>=evt){pc=12738;return;}
case 12738:cyc+=8;and(31);
if(cyc>=evt){pc=12740;return;}
case 12740:cyc+=8;cp(16);
if(cyc>=evt){pc=12742;return;}
case 12742:cyc+=8;if(!fz){cyc+=4;pc=12754;return;}
if(cyc>=evt){pc=12744;return;}
case 12744:cyc+=16;A=rd(49588);
if(cyc>=evt){pc=12747;return;}
case 12747:cyc+=8;A=A|2;
if(cyc>=evt){pc=12749;return;}
case 12749:cyc+=16;wr(49588,A);
if(cyc>=evt){pc=12752;return;}
case 12752:cyc+=12;pc=12811;return;
case 12754:cyc+=12;H=193;L=119;
if(cyc>=evt){pc=12757;return;}
case 12757:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12758;return;}
case 12758:cyc+=4;cp(B);
if(cyc>=evt){pc=12759;return;}
case 12759:cyc+=8;if(!fz){cyc+=4;pc=12784;return;}
if(cyc>=evt){pc=12761;return;}
case 12761:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12762;return;}
case 12762:cyc+=4;cp(C);
if(cyc>=evt){pc=12763;return;}
case 12763:cyc+=8;if(!fz){cyc+=4;pc=12785;return;}
if(cyc>=evt){pc=12765;return;}
case 12765:cyc+=8;D=30;
if(cyc>=evt){pc=12767;return;}
case 12767:cyc+=16;A=rd(49588);
if(cyc>=evt){pc=12770;return;}
case 12770:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=12772;return;}
case 12772:cyc+=8;if(!fz){cyc+=4;pc=12778;return;}
if(cyc>=evt){pc=12774;return;}
case 12774:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=12776;return;}
case 12776:cyc+=8;if(fz){cyc+=4;pc=12780;return;}
if(cyc>=evt){pc=12778;return;}
case 12778:cyc+=8;D=0;
if(cyc>=evt){pc=12780;return;}
case 12780:cyc+=4;A=D;
if(cyc>=evt){pc=12781;return;}
case 12781:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12782;return;}
case 12782:cyc+=12;pc=12811;return;
case 12784:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=12785;return;}
case 12785:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12786;return;}
case 12786:cyc+=4;and(A);
if(cyc>=evt){pc=12787;return;}
case 12787:cyc+=8;if(!fz){cyc+=4;pc=12757;return;}
if(cyc>=evt){pc=12789;return;}
case 12789:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=12790;return;}
case 12790:cyc+=8;D=30;
if(cyc>=evt){pc=12792;return;}
case 12792:cyc+=16;A=rd(49588);
if(cyc>=evt){pc=12795;return;}
case 12795:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=12797;return;}
case 12797:cyc+=8;if(!fz){cyc+=4;pc=12803;return;}
if(cyc>=evt){pc=12799;return;}
case 12799:cyc+=8;fz=(A>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=12801;return;}
case 12801:cyc+=8;if(fz){cyc+=4;pc=12805;return;}
if(cyc>=evt){pc=12803;return;}
case 12803:cyc+=8;D=0;
if(cyc>=evt){pc=12805;return;}
case 12805:cyc+=4;A=D;
if(cyc>=evt){pc=12806;return;}
case 12806:cyc+=8;wr((H<<8|L),A);if(!L)H=(H-1)&255;L=(L-1)&255;
if(cyc>=evt){pc=12807;return;}
case 12807:cyc+=4;A=C;
if(cyc>=evt){pc=12808;return;}
case 12808:cyc+=8;wr((H<<8|L),A);if(!L)H=(H-1)&255;L=(L-1)&255;
if(cyc>=evt){pc=12809;return;}
case 12809:cyc+=4;A=B;
if(cyc>=evt){pc=12810;return;}
case 12810:cyc+=8;wr((H<<8|L),A);if(!L)H=(H-1)&255;L=(L-1)&255;
if(cyc>=evt){pc=12811;return;}
case 12811:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=12812;return;}
case 12812:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=12813;return;}
case 12813:cyc+=16;pc=12684;return;
case 12816:cyc+=16;A=rd(49588);
if(cyc>=evt){pc=12819;return;}
case 12819:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=12821;return;}
case 12821:cyc+=8;if(fz){cyc+=4;pc=12855;return;}
if(cyc>=evt){pc=12823;return;}
case 12823:cyc+=8;A=1;
if(cyc>=evt){pc=12825;return;}
case 12825:cyc+=16;wr(49497,A);
if(cyc>=evt){pc=12828;return;}
case 12828:cyc+=16;A=rd(49588);
if(cyc>=evt){pc=12831;return;}
case 12831:cyc+=8;fz=(A>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=12833;return;}
case 12833:cyc+=8;if(fz){cyc+=4;pc=12840;return;}
if(cyc>=evt){pc=12835;return;}
case 12835:cyc+=12;B=64;C=69;
if(cyc>=evt){pc=12838;return;}
case 12838:cyc+=12;pc=12852;return;
case 12840:cyc+=8;fz=(A>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=12842;return;}
case 12842:cyc+=8;if(!fz){cyc+=4;pc=12849;return;}
if(cyc>=evt){pc=12844;return;}
case 12844:cyc+=12;B=64;C=63;
if(cyc>=evt){pc=12847;return;}
case 12847:cyc+=12;pc=12852;return;
case 12849:cyc+=12;B=64;C=57;
if(cyc>=evt){pc=12852;return;}
case 12852:cyc+=24;push(12855);pc=15065;return;
if(cyc>=evt){pc=12855;return;}
case 12855:cyc+=16;pc=pop();return;
case 12856:cyc+=12;H=192;L=132;
if(cyc>=evt){pc=12859;return;}
case 12859:cyc+=8;C=22;
if(cyc>=evt){pc=12861;return;}
case 12861:cyc+=16;A=rd(49483);
if(cyc>=evt){pc=12864;return;}
case 12864:cyc+=4;or(A);
if(cyc>=evt){pc=12865;return;}
case 12865:cyc+=8;if(!fz){cyc+=4;pc=12868;return;}
if(cyc>=evt){pc=12867;return;}
case 12867:cyc+=4;C=inc(C);
if(cyc>=evt){pc=12868;return;}
case 12868:cyc+=8;cp(2);
if(cyc>=evt){pc=12870;return;}
case 12870:cyc+=8;if(!fz){cyc+=4;pc=12873;return;}
if(cyc>=evt){pc=12872;return;}
case 12872:cyc+=4;C=inc(C);
if(cyc>=evt){pc=12873;return;}
case 12873:cyc+=4;A=E;
if(cyc>=evt){pc=12874;return;}
case 12874:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12875;return;}
case 12875:cyc+=4;A=D;
if(cyc>=evt){pc=12876;return;}
case 12876:cyc+=8;add(8);
if(cyc>=evt){pc=12878;return;}
case 12878:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12879;return;}
case 12879:cyc+=8;add(8);
if(cyc>=evt){pc=12881;return;}
case 12881:cyc+=4;D=A;
if(cyc>=evt){pc=12882;return;}
case 12882:cyc+=8;A=79;
if(cyc>=evt){pc=12884;return;}
case 12884:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12885;return;}
case 12885:cyc+=4;A=C;
if(cyc>=evt){pc=12886;return;}
case 12886:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12887;return;}
case 12887:cyc+=4;A=E;
if(cyc>=evt){pc=12888;return;}
case 12888:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12889;return;}
case 12889:cyc+=4;A=D;
if(cyc>=evt){pc=12890;return;}
case 12890:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12891;return;}
case 12891:cyc+=8;add(8);
if(cyc>=evt){pc=12893;return;}
case 12893:cyc+=4;D=A;
if(cyc>=evt){pc=12894;return;}
case 12894:cyc+=8;A=80;
if(cyc>=evt){pc=12896;return;}
case 12896:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12897;return;}
case 12897:cyc+=4;A=C;
if(cyc>=evt){pc=12898;return;}
case 12898:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12899;return;}
case 12899:cyc+=4;A=E;
if(cyc>=evt){pc=12900;return;}
case 12900:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12901;return;}
case 12901:cyc+=8;add(8);
if(cyc>=evt){pc=12903;return;}
case 12903:cyc+=4;E=A;
if(cyc>=evt){pc=12904;return;}
case 12904:cyc+=4;A=D;
if(cyc>=evt){pc=12905;return;}
case 12905:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12906;return;}
case 12906:cyc+=8;sub(24);
if(cyc>=evt){pc=12908;return;}
case 12908:cyc+=4;D=A;
if(cyc>=evt){pc=12909;return;}
case 12909:cyc+=8;A=81;
if(cyc>=evt){pc=12911;return;}
case 12911:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12912;return;}
case 12912:cyc+=4;A=C;
if(cyc>=evt){pc=12913;return;}
case 12913:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12914;return;}
case 12914:cyc+=4;A=E;
if(cyc>=evt){pc=12915;return;}
case 12915:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12916;return;}
case 12916:cyc+=4;A=D;
if(cyc>=evt){pc=12917;return;}
case 12917:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12918;return;}
case 12918:cyc+=8;add(8);
if(cyc>=evt){pc=12920;return;}
case 12920:cyc+=4;D=A;
if(cyc>=evt){pc=12921;return;}
case 12921:cyc+=8;A=82;
if(cyc>=evt){pc=12923;return;}
case 12923:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12924;return;}
case 12924:cyc+=4;A=C;
if(cyc>=evt){pc=12925;return;}
case 12925:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12926;return;}
case 12926:cyc+=4;A=E;
if(cyc>=evt){pc=12927;return;}
case 12927:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12928;return;}
case 12928:cyc+=4;A=D;
if(cyc>=evt){pc=12929;return;}
case 12929:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12930;return;}
case 12930:cyc+=8;add(8);
if(cyc>=evt){pc=12932;return;}
case 12932:cyc+=4;D=A;
if(cyc>=evt){pc=12933;return;}
case 12933:cyc+=8;A=83;
if(cyc>=evt){pc=12935;return;}
case 12935:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12936;return;}
case 12936:cyc+=4;A=C;
if(cyc>=evt){pc=12937;return;}
case 12937:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12938;return;}
case 12938:cyc+=4;A=E;
if(cyc>=evt){pc=12939;return;}
case 12939:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12940;return;}
case 12940:cyc+=4;A=D;
if(cyc>=evt){pc=12941;return;}
case 12941:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12942;return;}
case 12942:cyc+=8;add(8);
if(cyc>=evt){pc=12944;return;}
case 12944:cyc+=4;D=A;
if(cyc>=evt){pc=12945;return;}
case 12945:cyc+=8;A=84;
if(cyc>=evt){pc=12947;return;}
case 12947:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12948;return;}
case 12948:cyc+=4;A=C;
if(cyc>=evt){pc=12949;return;}
case 12949:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12950;return;}
case 12950:cyc+=4;A=E;
if(cyc>=evt){pc=12951;return;}
case 12951:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12952;return;}
case 12952:cyc+=4;A=D;
if(cyc>=evt){pc=12953;return;}
case 12953:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
pc=12954;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 12954:cyc+=8;A=85;
if(cyc>=evt){pc=12956;return;}
case 12956:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12957;return;}
case 12957:cyc+=4;A=C;
if(cyc>=evt){pc=12958;return;}
case 12958:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12959;return;}
case 12959:cyc+=16;pc=pop();return;
case 12960:cyc+=12;H=192;L=132;
if(cyc>=evt){pc=12963;return;}
case 12963:cyc+=8;C=22;
if(cyc>=evt){pc=12965;return;}
case 12965:cyc+=16;A=rd(49483);
if(cyc>=evt){pc=12968;return;}
case 12968:cyc+=4;or(A);
if(cyc>=evt){pc=12969;return;}
case 12969:cyc+=8;if(!fz){cyc+=4;pc=12972;return;}
if(cyc>=evt){pc=12971;return;}
case 12971:cyc+=4;C=inc(C);
if(cyc>=evt){pc=12972;return;}
case 12972:cyc+=8;cp(2);
if(cyc>=evt){pc=12974;return;}
case 12974:cyc+=8;if(!fz){cyc+=4;pc=12977;return;}
if(cyc>=evt){pc=12976;return;}
case 12976:cyc+=4;C=inc(C);
if(cyc>=evt){pc=12977;return;}
case 12977:cyc+=4;A=E;
if(cyc>=evt){pc=12978;return;}
case 12978:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12979;return;}
case 12979:cyc+=4;A=D;
if(cyc>=evt){pc=12980;return;}
case 12980:cyc+=8;add(8);
if(cyc>=evt){pc=12982;return;}
case 12982:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12983;return;}
case 12983:cyc+=8;add(8);
if(cyc>=evt){pc=12985;return;}
case 12985:cyc+=4;D=A;
if(cyc>=evt){pc=12986;return;}
case 12986:cyc+=8;A=88;
if(cyc>=evt){pc=12988;return;}
case 12988:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12989;return;}
case 12989:cyc+=4;A=C;
if(cyc>=evt){pc=12990;return;}
case 12990:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12991;return;}
case 12991:cyc+=4;A=E;
if(cyc>=evt){pc=12992;return;}
case 12992:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12993;return;}
case 12993:cyc+=4;A=D;
if(cyc>=evt){pc=12994;return;}
case 12994:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=12995;return;}
case 12995:cyc+=8;add(8);
if(cyc>=evt){pc=12997;return;}
case 12997:cyc+=4;D=A;
if(cyc>=evt){pc=12998;return;}
case 12998:cyc+=8;A=89;
if(cyc>=evt){pc=13000;return;}
case 13000:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13001;return;}
case 13001:cyc+=4;A=C;
if(cyc>=evt){pc=13002;return;}
case 13002:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13003;return;}
case 13003:cyc+=4;A=E;
if(cyc>=evt){pc=13004;return;}
case 13004:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13005;return;}
case 13005:cyc+=8;add(8);
if(cyc>=evt){pc=13007;return;}
case 13007:cyc+=4;E=A;
if(cyc>=evt){pc=13008;return;}
case 13008:cyc+=4;A=D;
if(cyc>=evt){pc=13009;return;}
case 13009:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13010;return;}
case 13010:cyc+=8;sub(24);
if(cyc>=evt){pc=13012;return;}
case 13012:cyc+=4;D=A;
if(cyc>=evt){pc=13013;return;}
case 13013:cyc+=8;A=90;
if(cyc>=evt){pc=13015;return;}
case 13015:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13016;return;}
case 13016:cyc+=4;A=C;
if(cyc>=evt){pc=13017;return;}
case 13017:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13018;return;}
case 13018:cyc+=4;A=E;
if(cyc>=evt){pc=13019;return;}
case 13019:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13020;return;}
case 13020:cyc+=4;A=D;
if(cyc>=evt){pc=13021;return;}
case 13021:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13022;return;}
case 13022:cyc+=8;add(8);
if(cyc>=evt){pc=13024;return;}
case 13024:cyc+=4;D=A;
if(cyc>=evt){pc=13025;return;}
case 13025:cyc+=8;A=91;
if(cyc>=evt){pc=13027;return;}
case 13027:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13028;return;}
case 13028:cyc+=4;A=C;
if(cyc>=evt){pc=13029;return;}
case 13029:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13030;return;}
case 13030:cyc+=4;A=E;
if(cyc>=evt){pc=13031;return;}
case 13031:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13032;return;}
case 13032:cyc+=4;A=D;
if(cyc>=evt){pc=13033;return;}
case 13033:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13034;return;}
case 13034:cyc+=8;add(8);
if(cyc>=evt){pc=13036;return;}
case 13036:cyc+=4;D=A;
if(cyc>=evt){pc=13037;return;}
case 13037:cyc+=8;A=92;
if(cyc>=evt){pc=13039;return;}
case 13039:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13040;return;}
case 13040:cyc+=4;A=C;
if(cyc>=evt){pc=13041;return;}
case 13041:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13042;return;}
case 13042:cyc+=4;A=E;
if(cyc>=evt){pc=13043;return;}
case 13043:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13044;return;}
case 13044:cyc+=4;A=D;
if(cyc>=evt){pc=13045;return;}
case 13045:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13046;return;}
case 13046:cyc+=8;add(8);
if(cyc>=evt){pc=13048;return;}
case 13048:cyc+=4;D=A;
if(cyc>=evt){pc=13049;return;}
case 13049:cyc+=8;A=93;
if(cyc>=evt){pc=13051;return;}
case 13051:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13052;return;}
case 13052:cyc+=4;A=C;
if(cyc>=evt){pc=13053;return;}
case 13053:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13054;return;}
case 13054:cyc+=4;A=E;
if(cyc>=evt){pc=13055;return;}
case 13055:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13056;return;}
case 13056:cyc+=4;A=D;
if(cyc>=evt){pc=13057;return;}
case 13057:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13058;return;}
case 13058:cyc+=8;A=94;
if(cyc>=evt){pc=13060;return;}
case 13060:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13061;return;}
case 13061:cyc+=4;A=C;
if(cyc>=evt){pc=13062;return;}
case 13062:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=13063;return;}
case 13063:cyc+=16;pc=pop();return;
case 13064:cyc+=12;H=192;L=132;
if(cyc>=evt){pc=13067;return;}
case 13067:cyc+=8;B=7;
if(cyc>=evt){pc=13069;return;}
case 13069:cyc+=24;push(13072);pc=7535;return;
if(cyc>=evt){pc=13072;return;}
case 13072:cyc+=16;pc=pop();return;
case 13073:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=13076;return;}
case 13076:cyc+=8;cp(30);
if(cyc>=evt){pc=13078;return;}
case 13078:cyc+=8;if(!fc){cyc+=4;pc=13094;return;}
if(cyc>=evt){pc=13080;return;}
case 13080:cyc+=4;C=A;
if(cyc>=evt){pc=13081;return;}
case 13081:cyc+=8;B=0;
if(cyc>=evt){pc=13083;return;}
case 13083:cyc+=12;H=199;L=51;
if(cyc>=evt){pc=13086;return;}
case 13086:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=13087;return;}
case 13087:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=13088;return;}
case 13088:cyc+=8;and(31);
if(cyc>=evt){pc=13090;return;}
case 13090:cyc+=8;cp(30);
if(cyc>=evt){pc=13092;return;}
case 13092:cyc+=8;if(fc){cyc+=4;pc=13111;return;}
if(cyc>=evt){pc=13094;return;}
case 13094:cyc+=8;A=107;
if(cyc>=evt){pc=13096;return;}
case 13096:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=13099;return;}
case 13099:cyc+=4;xor(A);
if(cyc>=evt){pc=13100;return;}
case 13100:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=13103;return;}
case 13103:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=13106;return;}
case 13106:cyc+=16;wr(49437,A);
if(cyc>=evt){pc=13109;return;}
case 13109:cyc+=12;pc=13186;return;
case 13111:cyc+=8;E=0;
if(cyc>=evt){pc=13113;return;}
case 13113:cyc+=8;cp(10);
if(cyc>=evt){pc=13115;return;}
case 13115:cyc+=8;if(fc){cyc+=4;pc=13122;return;}
if(cyc>=evt){pc=13117;return;}
case 13117:cyc+=8;sub(10);
if(cyc>=evt){pc=13119;return;}
case 13119:cyc+=4;E=inc(E);
if(cyc>=evt){pc=13120;return;}
case 13120:cyc+=12;pc=13113;return;
case 13122:cyc+=8;A=sla(A);
if(cyc>=evt){pc=13124;return;}
case 13124:cyc+=4;A=inc(A);
if(cyc>=evt){pc=13125;return;}
case 13125:cyc+=16;wr(49436,A);
if(cyc>=evt){pc=13128;return;}
case 13128:cyc+=4;A=E;
if(cyc>=evt){pc=13129;return;}
case 13129:cyc+=16;wr(49437,A);
if(cyc>=evt){pc=13132;return;}
case 13132:cyc+=4;xor(A);
if(cyc>=evt){pc=13133;return;}
case 13133:cyc+=12;fz=(rd((H<<8|L))>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=13135;return;}
case 13135:cyc+=8;if(fz){cyc+=4;pc=13139;return;}
if(cyc>=evt){pc=13137;return;}
case 13137:cyc+=8;A=A|128;
if(cyc>=evt){pc=13139;return;}
case 13139:cyc+=16;wr(49434,A);
if(cyc>=evt){pc=13142;return;}
case 13142:cyc+=8;A=108;
if(cyc>=evt){pc=13144;return;}
case 13144:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=13147;return;}
case 13147:cyc+=12;H=199;L=200;
if(cyc>=evt){pc=13150;return;}
case 13150:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=13151;return;}
case 13151:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=13152;return;}
case 13152:cyc+=8;cp(30);
if(cyc>=evt){pc=13154;return;}
case 13154:cyc+=8;if(!fz){cyc+=4;pc=13157;return;}
if(cyc>=evt){pc=13156;return;}
case 13156:cyc+=4;xor(A);
if(cyc>=evt){pc=13157;return;}
case 13157:cyc+=16;wr(49504,A);
if(cyc>=evt){pc=13160;return;}
case 13160:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=13163;return;}
case 13163:cyc+=8;cp(3);
if(cyc>=evt){pc=13165;return;}
case 13165:cyc+=8;if(!fz){cyc+=4;pc=13171;return;}
if(cyc>=evt){pc=13167;return;}
case 13167:cyc+=8;A=3;
if(cyc>=evt){pc=13169;return;}
case 13169:cyc+=12;pc=13186;return;
case 13171:cyc+=16;A=rd(49504);
if(cyc>=evt){pc=13174;return;}
case 13174:cyc+=4;and(A);
if(cyc>=evt){pc=13175;return;}
case 13175:cyc+=8;if(!fz){cyc+=4;pc=13184;return;}
if(cyc>=evt){pc=13177;return;}
case 13177:cyc+=24;push(13180);pc=13282;return;
if(cyc>=evt){pc=13180;return;}
case 13180:cyc+=8;A=128;
if(cyc>=evt){pc=13182;return;}
case 13182:cyc+=12;pc=13186;return;
case 13184:cyc+=8;A=1;
if(cyc>=evt){pc=13186;return;}
case 13186:cyc+=16;wr(49429,A);
if(cyc>=evt){pc=13189;return;}
case 13189:cyc+=12;H=0;L=205;
if(cyc>=evt){pc=13192;return;}
case 13192:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=13195;return;}
case 13195:cyc+=4;add(L);
if(cyc>=evt){pc=13196;return;}
case 13196:cyc+=4;L=A;
if(cyc>=evt){pc=13197;return;}
case 13197:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=13198;return;}
case 13198:cyc+=16;wr(49430,A);
if(cyc>=evt){pc=13201;return;}
case 13201:cyc+=12;H=0;L=224;
if(cyc>=evt){pc=13204;return;}
case 13204:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=13207;return;}
case 13207:cyc+=4;add(L);
if(cyc>=evt){pc=13208;return;}
case 13208:cyc+=4;L=A;
if(cyc>=evt){pc=13209;return;}
case 13209:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=13210;return;}
case 13210:cyc+=16;wr(49431,A);
if(cyc>=evt){pc=13213;return;}
case 13213:cyc+=16;wr(49433,A);
if(cyc>=evt){pc=13216;return;}
case 13216:cyc+=4;xor(A);
if(cyc>=evt){pc=13217;return;}
case 13217:cyc+=16;wr(49432,A);
if(cyc>=evt){pc=13220;return;}
case 13220:cyc+=8;A=1;
if(cyc>=evt){pc=13222;return;}
case 13222:cyc+=16;wr(49497,A);
if(cyc>=evt){pc=13225;return;}
case 13225:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=13228;return;}
case 13228:cyc+=16;pc=pop();return;
case 13229:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=13232;return;}
case 13232:cyc+=4;and(A);
if(cyc>=evt){pc=13233;return;}
case 13233:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=13234;return;}
case 13234:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=13237;return;}
case 13237:cyc+=4;C=A;
if(cyc>=evt){pc=13238;return;}
case 13238:cyc+=8;B=0;
if(cyc>=evt){pc=13240;return;}
case 13240:cyc+=12;H=199;L=200;
if(cyc>=evt){pc=13243;return;}
case 13243:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=13244;return;}
case 13244:cyc+=16;A=rd(49504);
if(cyc>=evt){pc=13247;return;}
case 13247:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=13248;return;}
case 13248:cyc+=12;H=199;L=51;
if(cyc>=evt){pc=13251;return;}
case 13251:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=13252;return;}
case 13252:cyc+=16;A=rd(49437);
if(cyc>=evt){pc=13255;return;}
case 13255:cyc+=12;B=0;C=11;
if(cyc>=evt){pc=13258;return;}
case 13258:cyc+=4;add(C);
if(cyc>=evt){pc=13259;return;}
case 13259:cyc+=4;C=A;
if(cyc>=evt){pc=13260;return;}
case 13260:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=13261;return;}
case 13261:cyc+=4;C=A;
if(cyc>=evt){pc=13262;return;}
case 13262:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=13265;return;}
case 13265:cyc+=8;A=srl(A);
if(cyc>=evt){pc=13267;return;}
case 13267:cyc+=4;add(C);
if(cyc>=evt){pc=13268;return;}
case 13268:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=13269;return;}
case 13269:cyc+=16;A=rd(49434);
if(cyc>=evt){pc=13272;return;}
case 13272:cyc+=4;and(A);
if(cyc>=evt){pc=13273;return;}
case 13273:cyc+=8;if(fz){cyc+=4;pc=13277;return;}
if(cyc>=evt){pc=13275;return;}
case 13275:cyc+=16;wr((H<<8|L),rd((H<<8|L))|128);
if(cyc>=evt){pc=13277;return;}
case 13277:cyc+=4;xor(A);
if(cyc>=evt){pc=13278;return;}
case 13278:cyc+=16;wr(49429,A);
if(cyc>=evt){pc=13281;return;}
case 13281:cyc+=16;pc=pop();return;
case 13282:cyc+=8;A=125;
if(cyc>=evt){pc=13284;return;}
case 13284:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=13287;return;}
case 13287:cyc+=24;push(13290);pc=13332;return;
if(cyc>=evt){pc=13290;return;}
case 13290:cyc+=8;cp(18);
if(cyc>=evt){pc=13292;return;}
case 13292:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=13293;return;}
case 13293:cyc+=12;H=193;L=28;
if(cyc>=evt){pc=13296;return;}
case 13296:cyc+=16;wr((H<<8|L),rd((H<<8|L))&254);
if(cyc>=evt){pc=13298;return;}
case 13298:cyc+=8;A=118;
if(cyc>=evt){pc=13300;return;}
case 13300:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=13303;return;}
case 13303:cyc+=16;pc=pop();return;
case 13304:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=13305;return;}
case 13305:cyc+=12;H=0;L=7;
if(cyc>=evt){pc=13308;return;}
case 13308:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=13311;return;}
case 13311:cyc+=4;add(L);
if(cyc>=evt){pc=13312;return;}
case 13312:cyc+=4;L=A;
if(cyc>=evt){pc=13313;return;}
case 13313:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=13316;return;}
case 13316:cyc+=8;A=sra(A);
if(cyc>=evt){pc=13318;return;}
case 13318:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=13319;return;}
case 13319:cyc+=12;H=192;L=172;
if(cyc>=evt){pc=13322;return;}
case 13322:cyc+=4;add(L);
if(cyc>=evt){pc=13323;return;}
case 13323:cyc+=4;L=A;
if(cyc>=evt){pc=13324;return;}
case 13324:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=13325;return;}
case 13325:cyc+=16;wr(49518,A);
if(cyc>=evt){pc=13328;return;}
case 13328:cyc+=8;and(31);
if(cyc>=evt){pc=13330;return;}
case 13330:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=13331;return;}
case 13331:cyc+=16;pc=pop();return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 13332:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=13333;return;}
case 13333:cyc+=12;H=0;L=7;
if(cyc>=evt){pc=13336;return;}
case 13336:cyc+=16;A=rd(49437);
if(cyc>=evt){pc=13339;return;}
case 13339:cyc+=4;add(L);
if(cyc>=evt){pc=13340;return;}
case 13340:cyc+=4;L=A;
if(cyc>=evt){pc=13341;return;}
case 13341:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=13344;return;}
case 13344:cyc+=12;pc=13316;return;
case 13346:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=13347;return;}
case 13347:cyc+=12;H=0;L=7;
if(cyc>=evt){pc=13350;return;}
case 13350:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=13353;return;}
case 13353:cyc+=4;add(L);
if(cyc>=evt){pc=13354;return;}
case 13354:cyc+=4;L=A;
if(cyc>=evt){pc=13355;return;}
case 13355:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=13358;return;}
case 13358:cyc+=8;sub(2);
if(cyc>=evt){pc=13360;return;}
case 13360:cyc+=12;pc=13316;return;
case 13362:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=13363;return;}
case 13363:cyc+=12;H=0;L=7;
if(cyc>=evt){pc=13366;return;}
case 13366:cyc+=16;A=rd(49437);
if(cyc>=evt){pc=13369;return;}
case 13369:cyc+=4;add(L);
if(cyc>=evt){pc=13370;return;}
case 13370:cyc+=4;L=A;
if(cyc>=evt){pc=13371;return;}
case 13371:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=13374;return;}
case 13374:cyc+=8;sub(2);
if(cyc>=evt){pc=13376;return;}
case 13376:cyc+=12;pc=13316;return;
case 13378:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=13379;return;}
case 13379:cyc+=12;H=0;L=7;
if(cyc>=evt){pc=13382;return;}
case 13382:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=13385;return;}
case 13385:cyc+=4;add(L);
if(cyc>=evt){pc=13386;return;}
case 13386:cyc+=4;L=A;
if(cyc>=evt){pc=13387;return;}
case 13387:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=13390;return;}
case 13390:cyc+=8;A=sra(A);
if(cyc>=evt){pc=13392;return;}
case 13392:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=13393;return;}
case 13393:cyc+=12;H=192;L=161;
if(cyc>=evt){pc=13396;return;}
case 13396:cyc+=4;add(L);
if(cyc>=evt){pc=13397;return;}
case 13397:cyc+=4;L=A;
if(cyc>=evt){pc=13398;return;}
case 13398:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=13399;return;}
case 13399:cyc+=16;wr(49518,A);
if(cyc>=evt){pc=13402;return;}
case 13402:cyc+=8;and(31);
if(cyc>=evt){pc=13404;return;}
case 13404:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=13405;return;}
case 13405:cyc+=16;pc=pop();return;
case 13406:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=13407;return;}
case 13407:cyc+=12;H=0;L=7;
if(cyc>=evt){pc=13410;return;}
case 13410:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=13413;return;}
case 13413:cyc+=4;add(L);
if(cyc>=evt){pc=13414;return;}
case 13414:cyc+=4;L=A;
if(cyc>=evt){pc=13415;return;}
case 13415:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=13418;return;}
case 13418:cyc+=8;sub(2);
if(cyc>=evt){pc=13420;return;}
case 13420:cyc+=12;pc=13390;return;
case 13422:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=13423;return;}
case 13423:cyc+=12;H=0;L=7;
if(cyc>=evt){pc=13426;return;}
case 13426:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=13429;return;}
case 13429:cyc+=4;add(L);
if(cyc>=evt){pc=13430;return;}
case 13430:cyc+=4;L=A;
if(cyc>=evt){pc=13431;return;}
case 13431:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=13434;return;}
case 13434:cyc+=8;add(2);
if(cyc>=evt){pc=13436;return;}
case 13436:cyc+=8;cp(20);
if(cyc>=evt){pc=13438;return;}
case 13438:cyc+=8;if(fc){cyc+=4;pc=13316;return;}
if(cyc>=evt){pc=13440;return;}
case 13440:cyc+=8;A=18;
if(cyc>=evt){pc=13442;return;}
case 13442:cyc+=12;pc=13316;return;
case 13444:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=13445;return;}
case 13445:cyc+=12;H=0;L=7;
if(cyc>=evt){pc=13448;return;}
case 13448:cyc+=16;A=rd(49437);
if(cyc>=evt){pc=13451;return;}
case 13451:cyc+=4;add(L);
if(cyc>=evt){pc=13452;return;}
case 13452:cyc+=4;L=A;
if(cyc>=evt){pc=13453;return;}
case 13453:cyc+=16;A=rd(49436);
if(cyc>=evt){pc=13456;return;}
case 13456:cyc+=12;pc=13434;return;
case 13458:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=13459;return;}
case 13459:cyc+=12;H=0;L=7;
if(cyc>=evt){pc=13462;return;}
case 13462:cyc+=16;A=rd(49428);
if(cyc>=evt){pc=13465;return;}
case 13465:cyc+=4;add(L);
if(cyc>=evt){pc=13466;return;}
case 13466:cyc+=4;L=A;
if(cyc>=evt){pc=13467;return;}
case 13467:cyc+=16;A=rd(49427);
if(cyc>=evt){pc=13470;return;}
case 13470:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=13472;return;}
case 13472:cyc+=12;if(!fz){cyc+=4;pc=13316;return;}
if(cyc>=evt){pc=13475;return;}
case 13475:cyc+=8;cp(20);
if(cyc>=evt){pc=13477;return;}
case 13477:cyc+=12;if(fc){cyc+=4;pc=13316;return;}
if(cyc>=evt){pc=13480;return;}
case 13480:cyc+=8;A=19;
if(cyc>=evt){pc=13482;return;}
case 13482:cyc+=16;pc=13316;return;
case 13485:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=13486;return;}
case 13486:cyc+=12;H=192;L=172;
if(cyc>=evt){pc=13489;return;}
case 13489:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=13490;return;}
case 13490:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=13491;return;}
case 13491:cyc+=16;wr(49518,A);
if(cyc>=evt){pc=13494;return;}
case 13494:cyc+=8;and(31);
if(cyc>=evt){pc=13496;return;}
case 13496:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=13497;return;}
case 13497:cyc+=16;pc=pop();return;
case 13498:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=13499;return;}
case 13499:cyc+=12;H=0;L=21;
if(cyc>=evt){pc=13502;return;}
case 13502:cyc+=4;add(L);
if(cyc>=evt){pc=13503;return;}
case 13503:cyc+=4;L=A;
if(cyc>=evt){pc=13504;return;}
case 13504:cyc+=8;if(!fc){cyc+=4;pc=13507;return;}
if(cyc>=evt){pc=13506;return;}
case 13506:cyc+=4;H=inc(H);
if(cyc>=evt){pc=13507;return;}
case 13507:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=13508;return;}
case 13508:cyc+=4;L=A;
if(cyc>=evt){pc=13509;return;}
case 13509:cyc+=8;fz=(A>>5)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=13511;return;}
case 13511:cyc+=8;if(fz){cyc+=4;pc=13524;return;}
if(cyc>=evt){pc=13513;return;}
case 13513:cyc+=16;A=rd(49518);
if(cyc>=evt){pc=13516;return;}
case 13516:cyc+=8;and(224);
if(cyc>=evt){pc=13518;return;}
case 13518:cyc+=8;cp(64);
if(cyc>=evt){pc=13520;return;}
case 13520:cyc+=8;if(!fz){cyc+=4;pc=13524;return;}
if(cyc>=evt){pc=13522;return;}
case 13522:cyc+=8;L=L|4;
if(cyc>=evt){pc=13524;return;}
case 13524:cyc+=4;A=L;
if(cyc>=evt){pc=13525;return;}
case 13525:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=13526;return;}
case 13526:cyc+=16;pc=pop();return;
case 13527:cyc+=8;A=2;
if(cyc>=evt){pc=13529;return;}
case 13529:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=13532;return;}
case 13532:cyc+=12;H=154;L=128;
if(cyc>=evt){pc=13535;return;}
case 13535:cyc+=12;D=105;E=223;
if(cyc>=evt){pc=13538;return;}
case 13538:cyc+=12;B=1;C=2;
if(cyc>=evt){pc=13541;return;}
case 13541:cyc+=24;push(13544);pc=4922;return;
if(cyc>=evt){pc=13544;return;}
case 13544:cyc+=12;B=255;C=193;
if(cyc>=evt){pc=13547;return;}
case 13547:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=13548;return;}
case 13548:cyc+=16;A=rd(49501);
if(cyc>=evt){pc=13551;return;}
case 13551:cyc+=4;and(A);
if(cyc>=evt){pc=13552;return;}
case 13552:cyc+=8;if(fz){cyc+=4;pc=13579;return;}
if(cyc>=evt){pc=13554;return;}
case 13554:cyc+=4;C=A;
if(cyc>=evt){pc=13555;return;}
case 13555:cyc+=8;cp(8);
if(cyc>=evt){pc=13557;return;}
case 13557:cyc+=8;if(fc){cyc+=4;pc=13561;return;}
if(cyc>=evt){pc=13559;return;}
case 13559:cyc+=8;C=7;
if(cyc>=evt){pc=13561;return;}
case 13561:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=13562;return;}
case 13562:cyc+=12;D=105;E=227;
if(cyc>=evt){pc=13565;return;}
case 13565:cyc+=12;B=1;C=2;
if(cyc>=evt){pc=13568;return;}
case 13568:cyc+=24;push(13571);pc=4922;return;
if(cyc>=evt){pc=13571;return;}
case 13571:cyc+=12;B=255;C=193;
if(cyc>=evt){pc=13574;return;}
case 13574:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=13575;return;}
case 13575:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=13576;return;}
case 13576:cyc+=4;C=dec(C);
if(cyc>=evt){pc=13577;return;}
case 13577:cyc+=8;if(!fz){cyc+=4;pc=13561;return;}
if(cyc>=evt){pc=13579;return;}
case 13579:cyc+=16;A=rd(49501);
if(cyc>=evt){pc=13582;return;}
case 13582:cyc+=4;C=A;
if(cyc>=evt){pc=13583;return;}
case 13583:cyc+=8;cp(7);
if(cyc>=evt){pc=13585;return;}
case 13585:cyc+=8;if(!fc){cyc+=4;pc=13622;return;}
if(cyc>=evt){pc=13587;return;}
case 13587:cyc+=16;A=rd(49502);
if(cyc>=evt){pc=13590;return;}
case 13590:cyc+=8;cp(8);
if(cyc>=evt){pc=13592;return;}
case 13592:cyc+=8;if(fc){cyc+=4;pc=13596;return;}
if(cyc>=evt){pc=13594;return;}
case 13594:cyc+=8;A=7;
if(cyc>=evt){pc=13596;return;}
case 13596:cyc+=4;sub(C);
if(cyc>=evt){pc=13597;return;}
case 13597:cyc+=8;if(fz){cyc+=4;pc=13622;return;}
if(cyc>=evt){pc=13599;return;}
case 13599:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=13601;return;}
case 13601:cyc+=8;if(!fz){cyc+=4;pc=13622;return;}
if(cyc>=evt){pc=13603;return;}
case 13603:cyc+=4;C=A;
if(cyc>=evt){pc=13604;return;}
case 13604:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=13605;return;}
case 13605:cyc+=12;D=105;E=229;
if(cyc>=evt){pc=13608;return;}
case 13608:cyc+=12;B=1;C=2;
if(cyc>=evt){pc=13611;return;}
case 13611:cyc+=24;push(13614);pc=4922;return;
if(cyc>=evt){pc=13614;return;}
case 13614:cyc+=12;B=255;C=193;
if(cyc>=evt){pc=13617;return;}
case 13617:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=13618;return;}
case 13618:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=13619;return;}
case 13619:cyc+=4;C=dec(C);
if(cyc>=evt){pc=13620;return;}
case 13620:cyc+=8;if(!fz){cyc+=4;pc=13604;return;}
if(cyc>=evt){pc=13622;return;}
case 13622:cyc+=4;A=L;
if(cyc>=evt){pc=13623;return;}
case 13623:cyc+=8;and(31);
if(cyc>=evt){pc=13625;return;}
case 13625:cyc+=8;cp(8);
if(cyc>=evt){pc=13627;return;}
case 13627:cyc+=8;if(fz){cyc+=4;pc=13644;return;}
if(cyc>=evt){pc=13629;return;}
case 13629:cyc+=12;D=105;E=223;
if(cyc>=evt){pc=13632;return;}
case 13632:cyc+=12;B=1;C=2;
if(cyc>=evt){pc=13635;return;}
case 13635:cyc+=24;push(13638);pc=4922;return;
if(cyc>=evt){pc=13638;return;}
case 13638:cyc+=12;B=255;C=193;
if(cyc>=evt){pc=13641;return;}
case 13641:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=13642;return;}
case 13642:cyc+=12;pc=13622;return;
case 13644:cyc+=12;H=154;L=147;
if(cyc>=evt){pc=13647;return;}
case 13647:cyc+=12;D=105;E=223;
if(cyc>=evt){pc=13650;return;}
case 13650:cyc+=12;B=1;C=2;
if(cyc>=evt){pc=13653;return;}
case 13653:cyc+=24;push(13656);pc=4922;return;
if(cyc>=evt){pc=13656;return;}
case 13656:cyc+=12;B=255;C=191;
if(cyc>=evt){pc=13659;return;}
case 13659:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=13660;return;}
case 13660:cyc+=16;A=rd(49429);
if(cyc>=evt){pc=13663;return;}
case 13663:cyc+=8;cp(1);
if(cyc>=evt){pc=13665;return;}
case 13665:cyc+=8;if(!fz){cyc+=4;pc=13697;return;}
if(cyc>=evt){pc=13667;return;}
case 13667:cyc+=16;A=rd(49504);
if(cyc>=evt){pc=13670;return;}
case 13670:cyc+=4;and(A);
if(cyc>=evt){pc=13671;return;}
case 13671:cyc+=8;if(fz){cyc+=4;pc=13697;return;}
if(cyc>=evt){pc=13673;return;}
case 13673:cyc+=8;C=6;
if(cyc>=evt){pc=13675;return;}
case 13675:cyc+=4;cp(C);
if(cyc>=evt){pc=13676;return;}
case 13676:cyc+=8;if(!fc){cyc+=4;pc=13679;return;}
if(cyc>=evt){pc=13678;return;}
case 13678:cyc+=4;C=A;
if(cyc>=evt){pc=13679;return;}
case 13679:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=13680;return;}
case 13680:cyc+=12;D=105;E=231;
if(cyc>=evt){pc=13683;return;}
case 13683:cyc+=12;B=1;C=2;
if(cyc>=evt){pc=13686;return;}
case 13686:cyc+=24;push(13689);pc=4922;return;
if(cyc>=evt){pc=13689;return;}
case 13689:cyc+=12;B=255;C=191;
if(cyc>=evt){pc=13692;return;}
case 13692:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=13693;return;}
case 13693:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=13694;return;}
case 13694:cyc+=4;C=dec(C);
if(cyc>=evt){pc=13695;return;}
case 13695:cyc+=8;if(!fz){cyc+=4;pc=13679;return;}
if(cyc>=evt){pc=13697;return;}
case 13697:cyc+=4;A=L;
if(cyc>=evt){pc=13698;return;}
case 13698:cyc+=8;and(31);
if(cyc>=evt){pc=13700;return;}
case 13700:cyc+=8;cp(12);
if(cyc>=evt){pc=13702;return;}
case 13702:cyc+=8;if(fz){cyc+=4;pc=13719;return;}
if(cyc>=evt){pc=13704;return;}
case 13704:cyc+=12;D=105;E=223;
if(cyc>=evt){pc=13707;return;}
case 13707:cyc+=12;B=1;C=2;
if(cyc>=evt){pc=13710;return;}
case 13710:cyc+=24;push(13713);pc=4922;return;
if(cyc>=evt){pc=13713;return;}
case 13713:cyc+=12;B=255;C=191;
if(cyc>=evt){pc=13716;return;}
case 13716:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=13717;return;}
case 13717:cyc+=12;pc=13697;return;
case 13719:cyc+=8;A=1;
if(cyc>=evt){pc=13721;return;}
case 13721:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=13724;return;}
case 13724:cyc+=4;xor(A);
if(cyc>=evt){pc=13725;return;}
case 13725:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=13728;return;}
case 13728:cyc+=16;pc=pop();return;
case 13729:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=13732;return;}
case 13732:cyc+=8;cp(17);
if(cyc>=evt){pc=13734;return;}
case 13734:cyc+=8;if(!fc){cyc+=4;pc=13809;return;}
if(cyc>=evt){pc=13736;return;}
case 13736:cyc+=8;A=2;
if(cyc>=evt){pc=13738;return;}
case 13738:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=13741;return;}
case 13741:cyc+=12;D=105;E=223;
if(cyc>=evt){pc=13744;return;}
case 13744:cyc+=12;H=154;L=136;
if(cyc>=evt){pc=13747;return;}
case 13747:cyc+=12;B=1;C=2;
if(cyc>=evt){pc=13750;return;}
case 13750:cyc+=24;push(13753);pc=4922;return;
if(cyc>=evt){pc=13753;return;}
case 13753:cyc+=12;H=154;L=137;
if(cyc>=evt){pc=13756;return;}
case 13756:cyc+=12;D=105;E=225;
if(cyc>=evt){pc=13759;return;}
case 13759:cyc+=12;B=1;C=2;
if(cyc>=evt){pc=13762;return;}
case 13762:cyc+=24;push(13765);pc=4922;return;
if(cyc>=evt){pc=13765;return;}
case 13765:cyc+=16;A=rd(49507);
if(cyc>=evt){pc=13768;return;}
case 13768:cyc+=4;L=A;
if(cyc>=evt){pc=13769;return;}
case 13769:cyc+=8;H=0;
if(cyc>=evt){pc=13771;return;}
case 13771:cyc+=8;A=10;
if(cyc>=evt){pc=13773;return;}
case 13773:cyc+=24;push(13776);pc=7593;return;
if(cyc>=evt){pc=13776;return;}
case 13776:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=13777;return;}
case 13777:cyc+=4;A=L;
if(cyc>=evt){pc=13778;return;}
case 13778:cyc+=12;H=154;L=138;
pc=13781;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 13781:cyc+=24;push(13784);pc=13880;return;
if(cyc>=evt){pc=13784;return;}
case 13784:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=13785;return;}
case 13785:cyc+=4;A=H;
if(cyc>=evt){pc=13786;return;}
case 13786:cyc+=12;H=154;L=139;
if(cyc>=evt){pc=13789;return;}
case 13789:cyc+=24;push(13792);pc=13880;return;
if(cyc>=evt){pc=13792;return;}
case 13792:cyc+=12;D=105;E=223;
if(cyc>=evt){pc=13795;return;}
case 13795:cyc+=12;H=154;L=140;
if(cyc>=evt){pc=13798;return;}
case 13798:cyc+=12;B=1;C=2;
if(cyc>=evt){pc=13801;return;}
case 13801:cyc+=24;push(13804);pc=4922;return;
if(cyc>=evt){pc=13804;return;}
case 13804:cyc+=8;A=1;
if(cyc>=evt){pc=13806;return;}
case 13806:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=13809;return;}
case 13809:cyc+=4;xor(A);
if(cyc>=evt){pc=13810;return;}
case 13810:cyc+=16;wr(49499,A);
if(cyc>=evt){pc=13813;return;}
case 13813:cyc+=16;pc=pop();return;
case 13814:cyc+=8;A=2;
if(cyc>=evt){pc=13816;return;}
case 13816:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=13819;return;}
case 13819:cyc+=8;A=4;
if(cyc>=evt){pc=13821;return;}
case 13821:cyc+=24;push(13824);pc=7904;return;
if(cyc>=evt){pc=13824;return;}
case 13824:cyc+=24;push(13827);pc=7894;return;
if(cyc>=evt){pc=13827;return;}
case 13827:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=13830;return;}
case 13830:cyc+=8;cp(17);
if(cyc>=evt){pc=13832;return;}
case 13832:cyc+=8;if(!fc){cyc+=4;pc=13874;return;}
if(cyc>=evt){pc=13834;return;}
case 13834:cyc+=12;D=106;E=7;
if(cyc>=evt){pc=13837;return;}
case 13837:cyc+=12;H=154;L=134;
if(cyc>=evt){pc=13840;return;}
case 13840:cyc+=12;B=5;C=2;
if(cyc>=evt){pc=13843;return;}
case 13843:cyc+=24;push(13846);pc=4922;return;
if(cyc>=evt){pc=13846;return;}
case 13846:cyc+=16;A=rd(49482);
if(cyc>=evt){pc=13849;return;}
case 13849:cyc+=8;cp(12);
if(cyc>=evt){pc=13851;return;}
case 13851:cyc+=8;if(fc){cyc+=4;pc=13855;return;}
if(cyc>=evt){pc=13853;return;}
case 13853:cyc+=8;A=12;
if(cyc>=evt){pc=13855;return;}
case 13855:cyc+=12;H=154;L=141;
if(cyc>=evt){pc=13858;return;}
case 13858:cyc+=8;cp(10);
if(cyc>=evt){pc=13860;return;}
case 13860:cyc+=8;if(fc){cyc+=4;pc=13871;return;}
if(cyc>=evt){pc=13862;return;}
case 13862:cyc+=16;pushaf();
if(cyc>=evt){pc=13863;return;}
case 13863:cyc+=8;A=1;
if(cyc>=evt){pc=13865;return;}
case 13865:cyc+=24;push(13868);pc=13880;return;
if(cyc>=evt){pc=13868;return;}
case 13868:cyc+=12;popaf();
if(cyc>=evt){pc=13869;return;}
case 13869:cyc+=8;sub(10);
if(cyc>=evt){pc=13871;return;}
case 13871:cyc+=24;push(13874);pc=13880;return;
if(cyc>=evt){pc=13874;return;}
case 13874:cyc+=8;A=1;
if(cyc>=evt){pc=13876;return;}
case 13876:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=13879;return;}
case 13879:cyc+=16;pc=pop();return;
case 13880:cyc+=8;A=sla(A);
if(cyc>=evt){pc=13882;return;}
case 13882:cyc+=12;D=105;E=243;
if(cyc>=evt){pc=13885;return;}
case 13885:cyc+=4;add(E);
if(cyc>=evt){pc=13886;return;}
case 13886:cyc+=4;E=A;
if(cyc>=evt){pc=13887;return;}
case 13887:cyc+=8;if(!fc){cyc+=4;pc=13890;return;}
if(cyc>=evt){pc=13889;return;}
case 13889:cyc+=4;D=inc(D);
if(cyc>=evt){pc=13890;return;}
case 13890:cyc+=12;B=1;C=2;
if(cyc>=evt){pc=13893;return;}
case 13893:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=13894;return;}
case 13894:cyc+=24;push(13897);pc=4922;return;
if(cyc>=evt){pc=13897;return;}
case 13897:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=13898;return;}
case 13898:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=13899;return;}
case 13899:cyc+=16;pc=pop();return;
case 13900:cyc+=8;A=2;
if(cyc>=evt){pc=13902;return;}
case 13902:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=13905;return;}
case 13905:cyc+=24;push(13908);pc=7894;return;
if(cyc>=evt){pc=13908;return;}
case 13908:cyc+=12;D=106;E=17;
if(cyc>=evt){pc=13911;return;}
case 13911:cyc+=12;H=154;L=136;
if(cyc>=evt){pc=13914;return;}
case 13914:cyc+=12;B=5;C=2;
if(cyc>=evt){pc=13917;return;}
case 13917:cyc+=24;push(13920);pc=4922;return;
if(cyc>=evt){pc=13920;return;}
case 13920:cyc+=8;A=1;
if(cyc>=evt){pc=13922;return;}
case 13922:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=13925;return;}
case 13925:cyc+=16;pc=pop();return;
case 13926:cyc+=8;A=2;
if(cyc>=evt){pc=13928;return;}
case 13928:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=13931;return;}
case 13931:cyc+=8;A=4;
if(cyc>=evt){pc=13933;return;}
case 13933:cyc+=24;push(13936);pc=7904;return;
if(cyc>=evt){pc=13936;return;}
case 13936:cyc+=24;push(13939);pc=7894;return;
if(cyc>=evt){pc=13939;return;}
case 13939:cyc+=12;D=106;E=27;
if(cyc>=evt){pc=13942;return;}
case 13942:cyc+=12;H=154;L=129;
if(cyc>=evt){pc=13945;return;}
case 13945:cyc+=12;B=10;C=2;
if(cyc>=evt){pc=13948;return;}
case 13948:cyc+=24;push(13951);pc=4922;return;
if(cyc>=evt){pc=13951;return;}
case 13951:cyc+=8;A=2;
if(cyc>=evt){pc=13953;return;}
case 13953:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=13956;return;}
case 13956:cyc+=12;H=154;L=139;
if(cyc>=evt){pc=13959;return;}
case 13959:cyc+=12;D=193;E=196;
if(cyc>=evt){pc=13962;return;}
case 13962:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=13963;return;}
case 13963:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=13964;return;}
case 13964:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=13965;return;}
case 13965:cyc+=24;push(13968);pc=13880;return;
if(cyc>=evt){pc=13968;return;}
case 13968:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=13969;return;}
case 13969:cyc+=4;A=E;
if(cyc>=evt){pc=13970;return;}
case 13970:cyc+=8;cp(204);
if(cyc>=evt){pc=13972;return;}
case 13972:cyc+=8;if(!fz){cyc+=4;pc=13962;return;}
if(cyc>=evt){pc=13974;return;}
case 13974:cyc+=8;A=1;
if(cyc>=evt){pc=13976;return;}
case 13976:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=13979;return;}
case 13979:cyc+=16;pc=pop();return;
case 14031:cyc+=16;A=rd(49500);
if(cyc>=evt){pc=14034;return;}
case 14034:cyc+=4;and(A);
if(cyc>=evt){pc=14035;return;}
case 14035:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14036;return;}
case 14036:cyc+=16;A=rd(49515);
if(cyc>=evt){pc=14039;return;}
case 14039:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=14042;return;}
case 14042:cyc+=12;B=0;C=0;
if(cyc>=evt){pc=14045;return;}
case 14045:cyc+=12;H=192;L=172;
if(cyc>=evt){pc=14048;return;}
case 14048:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=14049;return;}
case 14049:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14050;return;}
case 14050:cyc+=8;and(31);
if(cyc>=evt){pc=14052;return;}
case 14052:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=14053;return;}
case 14053:cyc+=8;cp(19);
if(cyc>=evt){pc=14055;return;}
case 14055:cyc+=8;if(fz){cyc+=4;pc=14061;return;}
if(cyc>=evt){pc=14057;return;}
case 14057:cyc+=8;cp(30);
if(cyc>=evt){pc=14059;return;}
case 14059:cyc+=8;if(!fz){cyc+=4;pc=14135;return;}
if(cyc>=evt){pc=14061;return;}
case 14061:cyc+=12;H=152;L=162;
if(cyc>=evt){pc=14064;return;}
case 14064:cyc+=4;A=B;
if(cyc>=evt){pc=14065;return;}
case 14065:cyc+=8;cp(1);
if(cyc>=evt){pc=14067;return;}
case 14067:cyc+=8;if(fc){cyc+=4;pc=14079;return;}
if(cyc>=evt){pc=14069;return;}
case 14069:cyc+=12;H=153;L=66;
if(cyc>=evt){pc=14072;return;}
case 14072:cyc+=8;cp(2);
if(cyc>=evt){pc=14074;return;}
case 14074:cyc+=8;if(fc){cyc+=4;pc=14079;return;}
if(cyc>=evt){pc=14076;return;}
case 14076:cyc+=12;H=153;L=226;
if(cyc>=evt){pc=14079;return;}
case 14079:cyc+=4;A=C;
if(cyc>=evt){pc=14080;return;}
case 14080:cyc+=8;A=sla(A);
if(cyc>=evt){pc=14082;return;}
case 14082:cyc+=4;add(L);
if(cyc>=evt){pc=14083;return;}
case 14083:cyc+=4;L=A;
if(cyc>=evt){pc=14084;return;}
case 14084:cyc+=8;if(!fc){cyc+=4;pc=14087;return;}
if(cyc>=evt){pc=14086;return;}
case 14086:cyc+=4;H=inc(H);
if(cyc>=evt){pc=14087;return;}
case 14087:cyc+=16;A=rd(49410);
if(cyc>=evt){pc=14090;return;}
case 14090:cyc+=8;A=srl(A);
if(cyc>=evt){pc=14092;return;}
case 14092:cyc+=8;A=srl(A);
if(cyc>=evt){pc=14094;return;}
case 14094:cyc+=4;add(C);
if(cyc>=evt){pc=14095;return;}
case 14095:cyc+=8;and(3);
if(cyc>=evt){pc=14097;return;}
case 14097:cyc+=12;D=2;E=28;
if(cyc>=evt){pc=14100;return;}
case 14100:cyc+=8;if(fz){cyc+=4;pc=14119;return;}
if(cyc>=evt){pc=14102;return;}
case 14102:cyc+=12;D=2;E=34;
if(cyc>=evt){pc=14105;return;}
case 14105:cyc+=8;cp(1);
if(cyc>=evt){pc=14107;return;}
case 14107:cyc+=8;if(fz){cyc+=4;pc=14119;return;}
if(cyc>=evt){pc=14109;return;}
case 14109:cyc+=12;D=2;E=40;
if(cyc>=evt){pc=14112;return;}
case 14112:cyc+=8;cp(2);
if(cyc>=evt){pc=14114;return;}
case 14114:cyc+=8;if(fz){cyc+=4;pc=14119;return;}
if(cyc>=evt){pc=14116;return;}
case 14116:cyc+=12;D=2;E=46;
if(cyc>=evt){pc=14119;return;}
case 14119:cyc+=16;A=rd(49513);
if(cyc>=evt){pc=14122;return;}
case 14122:cyc+=4;add(E);
if(cyc>=evt){pc=14123;return;}
case 14123:cyc+=4;E=A;
if(cyc>=evt){pc=14124;return;}
case 14124:cyc+=16;A=rd(49514);
if(cyc>=evt){pc=14127;return;}
case 14127:cyc+=4;adc(D);
if(cyc>=evt){pc=14128;return;}
case 14128:cyc+=4;D=A;
if(cyc>=evt){pc=14129;return;}
case 14129:cyc+=12;B=2;C=3;
if(cyc>=evt){pc=14132;return;}
case 14132:cyc+=24;push(14135);pc=4922;return;
if(cyc>=evt){pc=14135;return;}
case 14135:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=14136;return;}
case 14136:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=14137;return;}
case 14137:cyc+=4;C=inc(C);
if(cyc>=evt){pc=14138;return;}
case 14138:cyc+=4;A=C;
if(cyc>=evt){pc=14139;return;}
case 14139:cyc+=8;cp(10);
if(cyc>=evt){pc=14141;return;}
case 14141:cyc+=8;if(fc){cyc+=4;pc=14048;return;}
if(cyc>=evt){pc=14143;return;}
case 14143:cyc+=8;C=0;
if(cyc>=evt){pc=14145;return;}
case 14145:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=14146;return;}
case 14146:cyc+=4;B=inc(B);
if(cyc>=evt){pc=14147;return;}
case 14147:cyc+=4;A=B;
if(cyc>=evt){pc=14148;return;}
case 14148:cyc+=8;cp(3);
if(cyc>=evt){pc=14150;return;}
case 14150:cyc+=8;if(fc){cyc+=4;pc=14048;return;}
if(cyc>=evt){pc=14152;return;}
case 14152:cyc+=8;A=1;
if(cyc>=evt){pc=14154;return;}
case 14154:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=14157;return;}
case 14157:cyc+=4;xor(A);
if(cyc>=evt){pc=14158;return;}
case 14158:cyc+=16;wr(49500,A);
if(cyc>=evt){pc=14161;return;}
case 14161:cyc+=16;pc=pop();return;
case 14162:cyc+=16;A=rd(49515);
if(cyc>=evt){pc=14165;return;}
case 14165:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=14168;return;}
case 14168:cyc+=12;H=153;L=104;
if(cyc>=evt){pc=14171;return;}
case 14171:cyc+=12;B=2;C=4;
if(cyc>=evt){pc=14174;return;}
case 14174:cyc+=12;D=2;E=52;
if(cyc>=evt){pc=14177;return;}
case 14177:cyc+=16;A=rd(49507);
if(cyc>=evt){pc=14180;return;}
case 14180:cyc+=8;cp(55);
if(cyc>=evt){pc=14182;return;}
case 14182:cyc+=8;if(!fc){cyc+=4;pc=14201;return;}
if(cyc>=evt){pc=14184;return;}
case 14184:cyc+=12;D=2;E=60;
if(cyc>=evt){pc=14187;return;}
case 14187:cyc+=8;cp(40);
if(cyc>=evt){pc=14189;return;}
case 14189:cyc+=8;if(!fc){cyc+=4;pc=14201;return;}
if(cyc>=evt){pc=14191;return;}
case 14191:cyc+=12;D=2;E=68;
if(cyc>=evt){pc=14194;return;}
case 14194:cyc+=8;cp(25);
if(cyc>=evt){pc=14196;return;}
case 14196:cyc+=8;if(!fc){cyc+=4;pc=14201;return;}
if(cyc>=evt){pc=14198;return;}
case 14198:cyc+=12;D=2;E=76;
if(cyc>=evt){pc=14201;return;}
case 14201:cyc+=16;A=rd(49513);
if(cyc>=evt){pc=14204;return;}
case 14204:cyc+=4;add(E);
if(cyc>=evt){pc=14205;return;}
case 14205:cyc+=4;E=A;
if(cyc>=evt){pc=14206;return;}
case 14206:cyc+=16;A=rd(49514);
if(cyc>=evt){pc=14209;return;}
case 14209:cyc+=4;adc(D);
if(cyc>=evt){pc=14210;return;}
case 14210:cyc+=4;D=A;
if(cyc>=evt){pc=14211;return;}
case 14211:cyc+=24;push(14214);pc=4953;return;
if(cyc>=evt){pc=14214;return;}
case 14214:cyc+=8;A=1;
if(cyc>=evt){pc=14216;return;}
case 14216:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=14219;return;}
case 14219:cyc+=16;pc=pop();return;
case 14220:cyc+=16;pushaf();
if(cyc>=evt){pc=14221;return;}
case 14221:cyc+=16;A=rd(49425);
if(cyc>=evt){pc=14224;return;}
case 14224:cyc+=8;A=srl(A);
if(cyc>=evt){pc=14226;return;}
case 14226:cyc+=4;add(C);
if(cyc>=evt){pc=14227;return;}
case 14227:cyc+=4;A=inc(A);
if(cyc>=evt){pc=14228;return;}
case 14228:cyc+=16;wr(49525,A);
if(cyc>=evt){pc=14231;return;}
case 14231:cyc+=16;A=rd(49426);
if(cyc>=evt){pc=14234;return;}
case 14234:cyc+=4;add(B);
if(cyc>=evt){pc=14235;return;}
case 14235:cyc+=4;A=inc(A);
if(cyc>=evt){pc=14236;return;}
case 14236:cyc+=16;wr(49526,A);
if(cyc>=evt){pc=14239;return;}
case 14239:cyc+=8;A=22;
if(cyc>=evt){pc=14241;return;}
case 14241:cyc+=16;wr(49524,A);
if(cyc>=evt){pc=14244;return;}
case 14244:cyc+=12;popaf();
if(cyc>=evt){pc=14245;return;}
case 14245:cyc+=16;pc=pop();return;
case 14246:cyc+=16;A=rd(49523);
if(cyc>=evt){pc=14249;return;}
case 14249:cyc+=4;and(A);
if(cyc>=evt){pc=14250;return;}
case 14250:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14251;return;}
case 14251:cyc+=16;A=rd(49524);
if(cyc>=evt){pc=14254;return;}
case 14254:cyc+=4;and(A);
if(cyc>=evt){pc=14255;return;}
case 14255:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14256;return;}
case 14256:cyc+=8;cp(11);
if(cyc>=evt){pc=14258;return;}
case 14258:cyc+=8;if(!fz){cyc+=4;pc=14264;return;}
if(cyc>=evt){pc=14260;return;}
case 14260:cyc+=12;H=193;L=118;
if(cyc>=evt){pc=14263;return;}
case 14263:cyc+=12;wr((H<<8|L),inc(rd((H<<8|L))));
if(cyc>=evt){pc=14264;return;}
case 14264:cyc+=16;A=rd(49526);
if(cyc>=evt){pc=14267;return;}
case 14267:cyc+=12;H=0;L=7;
if(cyc>=evt){pc=14270;return;}
case 14270:cyc+=4;add(L);
if(cyc>=evt){pc=14271;return;}
case 14271:cyc+=4;L=A;
if(cyc>=evt){pc=14272;return;}
case 14272:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=14273;return;}
case 14273:cyc+=12;H=192;L=160;
if(cyc>=evt){pc=14276;return;}
case 14276:cyc+=4;add(L);
if(cyc>=evt){pc=14277;return;}
case 14277:cyc+=4;L=A;
if(cyc>=evt){pc=14278;return;}
case 14278:cyc+=16;A=rd(49525);
if(cyc>=evt){pc=14281;return;}
case 14281:cyc+=4;add(L);
if(cyc>=evt){pc=14282;return;}
case 14282:cyc+=4;L=A;
if(cyc>=evt){pc=14283;return;}
case 14283:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=14284;return;}
case 14284:cyc+=8;cp(11);
if(cyc>=evt){pc=14286;return;}
case 14286:cyc+=8;if(fz){cyc+=4;pc=14307;return;}
if(cyc>=evt){pc=14288;return;}
case 14288:cyc+=16;A=rd(49525);
pc=14291;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 14291:cyc+=4;A=inc(A);
if(cyc>=evt){pc=14292;return;}
case 14292:cyc+=8;cp(11);
if(cyc>=evt){pc=14294;return;}
case 14294:cyc+=8;if(fc){cyc+=4;pc=14298;return;}
if(cyc>=evt){pc=14296;return;}
case 14296:cyc+=8;sub(11);
if(cyc>=evt){pc=14298;return;}
case 14298:cyc+=16;wr(49525,A);
if(cyc>=evt){pc=14301;return;}
case 14301:cyc+=12;H=193;L=116;
if(cyc>=evt){pc=14304;return;}
case 14304:cyc+=12;wr((H<<8|L),dec(rd((H<<8|L))));
if(cyc>=evt){pc=14305;return;}
case 14305:cyc+=12;pc=14251;return;
case 14307:cyc+=16;A=rd(49526);
if(cyc>=evt){pc=14310;return;}
case 14310:cyc+=12;H=0;L=3;
if(cyc>=evt){pc=14313;return;}
case 14313:cyc+=4;add(L);
if(cyc>=evt){pc=14314;return;}
case 14314:cyc+=4;L=A;
if(cyc>=evt){pc=14315;return;}
case 14315:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=14316;return;}
case 14316:cyc+=8;add(40);
if(cyc>=evt){pc=14318;return;}
case 14318:cyc+=4;E=A;
if(cyc>=evt){pc=14319;return;}
case 14319:cyc+=16;A=rd(49525);
if(cyc>=evt){pc=14322;return;}
case 14322:cyc+=12;H=0;L=103;
if(cyc>=evt){pc=14325;return;}
case 14325:cyc+=4;add(L);
if(cyc>=evt){pc=14326;return;}
case 14326:cyc+=4;L=A;
if(cyc>=evt){pc=14327;return;}
case 14327:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=14328;return;}
case 14328:cyc+=4;D=A;
if(cyc>=evt){pc=14329;return;}
case 14329:cyc+=24;push(14332);pc=12856;return;
if(cyc>=evt){pc=14332;return;}
case 14332:cyc+=12;B=64;C=0;
if(cyc>=evt){pc=14335;return;}
case 14335:cyc+=24;push(14338);pc=15065;return;
if(cyc>=evt){pc=14338;return;}
case 14338:cyc+=16;A=rd(49525);
if(cyc>=evt){pc=14341;return;}
case 14341:cyc+=4;A=inc(A);
if(cyc>=evt){pc=14342;return;}
case 14342:cyc+=8;cp(11);
if(cyc>=evt){pc=14344;return;}
case 14344:cyc+=8;if(fc){cyc+=4;pc=14348;return;}
if(cyc>=evt){pc=14346;return;}
case 14346:cyc+=8;sub(11);
if(cyc>=evt){pc=14348;return;}
case 14348:cyc+=16;wr(49525,A);
if(cyc>=evt){pc=14351;return;}
case 14351:cyc+=12;H=193;L=116;
if(cyc>=evt){pc=14354;return;}
case 14354:cyc+=12;wr((H<<8|L),dec(rd((H<<8|L))));
if(cyc>=evt){pc=14355;return;}
case 14355:cyc+=16;pc=pop();return;
case 14356:cyc+=16;A=rd(49523);
if(cyc>=evt){pc=14359;return;}
case 14359:cyc+=4;and(A);
if(cyc>=evt){pc=14360;return;}
case 14360:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14361;return;}
case 14361:cyc+=4;A=dec(A);
if(cyc>=evt){pc=14362;return;}
case 14362:cyc+=16;wr(49523,A);
if(cyc>=evt){pc=14365;return;}
case 14365:cyc+=8;cp(4);
if(cyc>=evt){pc=14367;return;}
case 14367:cyc+=8;if(!fc){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14368;return;}
case 14368:cyc+=8;cp(3);
if(cyc>=evt){pc=14370;return;}
case 14370:cyc+=8;if(fz){cyc+=4;pc=14382;return;}
if(cyc>=evt){pc=14372;return;}
case 14372:cyc+=8;cp(2);
if(cyc>=evt){pc=14374;return;}
case 14374:cyc+=8;if(fz){cyc+=4;pc=14391;return;}
if(cyc>=evt){pc=14376;return;}
case 14376:cyc+=8;cp(1);
if(cyc>=evt){pc=14378;return;}
case 14378:cyc+=8;if(fz){cyc+=4;pc=14399;return;}
if(cyc>=evt){pc=14380;return;}
case 14380:cyc+=12;pc=14429;return;
case 14382:cyc+=24;push(14385);pc=14589;return;
if(cyc>=evt){pc=14385;return;}
case 14385:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14386;return;}
case 14386:cyc+=4;E=dec(E);
if(cyc>=evt){pc=14387;return;}
case 14387:cyc+=24;push(14390);pc=12856;return;
if(cyc>=evt){pc=14390;return;}
case 14390:cyc+=16;pc=pop();return;
case 14391:cyc+=24;push(14394);pc=14589;return;
if(cyc>=evt){pc=14394;return;}
case 14394:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14395;return;}
case 14395:cyc+=24;push(14398);pc=12856;return;
if(cyc>=evt){pc=14398;return;}
case 14398:cyc+=16;pc=pop();return;
case 14399:cyc+=16;A=rd(49521);
if(cyc>=evt){pc=14402;return;}
case 14402:cyc+=4;B=A;
if(cyc>=evt){pc=14403;return;}
case 14403:cyc+=16;A=rd(49522);
if(cyc>=evt){pc=14406;return;}
case 14406:cyc+=4;C=A;
if(cyc>=evt){pc=14407;return;}
case 14407:cyc+=8;E=0;
if(cyc>=evt){pc=14409;return;}
case 14409:cyc+=24;push(14412);pc=11964;return;
if(cyc>=evt){pc=14412;return;}
case 14412:cyc+=24;push(14415);pc=14589;return;
if(cyc>=evt){pc=14415;return;}
case 14415:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14416;return;}
case 14416:cyc+=16;A=rd(49410);
if(cyc>=evt){pc=14419;return;}
case 14419:cyc+=8;and(15);
if(cyc>=evt){pc=14421;return;}
case 14421:cyc+=4;add(E);
if(cyc>=evt){pc=14422;return;}
case 14422:cyc+=8;add(12);
if(cyc>=evt){pc=14424;return;}
case 14424:cyc+=4;E=A;
if(cyc>=evt){pc=14425;return;}
case 14425:cyc+=24;push(14428);pc=12960;return;
if(cyc>=evt){pc=14428;return;}
case 14428:cyc+=16;pc=pop();return;
case 14429:cyc+=16;A=rd(49521);
if(cyc>=evt){pc=14432;return;}
case 14432:cyc+=4;B=A;
if(cyc>=evt){pc=14433;return;}
case 14433:cyc+=16;A=rd(49522);
if(cyc>=evt){pc=14436;return;}
case 14436:cyc+=4;C=A;
if(cyc>=evt){pc=14437;return;}
case 14437:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=14438;return;}
case 14438:cyc+=4;A=B;
if(cyc>=evt){pc=14439;return;}
case 14439:cyc+=12;B=0;C=30;
if(cyc>=evt){pc=14442;return;}
case 14442:cyc+=24;push(14445);pc=7544;return;
if(cyc>=evt){pc=14445;return;}
case 14445:cyc+=12;B=196;C=0;
if(cyc>=evt){pc=14448;return;}
case 14448:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=14449;return;}
case 14449:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=14450;return;}
case 14450:cyc+=4;A=L;
if(cyc>=evt){pc=14451;return;}
case 14451:cyc+=4;add(C);
if(cyc>=evt){pc=14452;return;}
case 14452:cyc+=4;L=A;
if(cyc>=evt){pc=14453;return;}
case 14453:cyc+=8;if(!fc){cyc+=4;pc=14456;return;}
if(cyc>=evt){pc=14455;return;}
case 14455:cyc+=4;H=inc(H);
if(cyc>=evt){pc=14456;return;}
case 14456:cyc+=4;A=C;
if(cyc>=evt){pc=14457;return;}
case 14457:cyc+=8;add(10);
if(cyc>=evt){pc=14459;return;}
case 14459:cyc+=4;C=A;
if(cyc>=evt){pc=14460;return;}
case 14460:cyc+=8;cp(30);
if(cyc>=evt){pc=14462;return;}
case 14462:cyc+=8;if(fc){cyc+=4;pc=14509;return;}
if(cyc>=evt){pc=14464;return;}
case 14464:cyc+=12;H=198;L=211;
if(cyc>=evt){pc=14467;return;}
case 14467:cyc+=4;A=B;
if(cyc>=evt){pc=14468;return;}
case 14468:cyc+=8;A=sla(A);
if(cyc>=evt){pc=14470;return;}
case 14470:cyc+=8;A=sla(A);
if(cyc>=evt){pc=14472;return;}
case 14472:cyc+=4;add(L);
if(cyc>=evt){pc=14473;return;}
case 14473:cyc+=4;L=A;
if(cyc>=evt){pc=14474;return;}
case 14474:cyc+=8;if(!fc){cyc+=4;pc=14477;return;}
if(cyc>=evt){pc=14476;return;}
case 14476:cyc+=4;H=inc(H);
if(cyc>=evt){pc=14477;return;}
case 14477:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=14478;return;}
case 14478:cyc+=4;A=dec(A);
if(cyc>=evt){pc=14479;return;}
case 14479:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=14481;return;}
case 14481:cyc+=8;if(!fz){cyc+=4;pc=14588;return;}
if(cyc>=evt){pc=14483;return;}
case 14483:cyc+=4;B=A;
if(cyc>=evt){pc=14484;return;}
case 14484:cyc+=4;A=C;
if(cyc>=evt){pc=14485;return;}
case 14485:cyc+=8;sub(30);
if(cyc>=evt){pc=14487;return;}
case 14487:cyc+=4;C=A;
if(cyc>=evt){pc=14488;return;}
case 14488:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=14489;return;}
case 14489:cyc+=4;A=B;
if(cyc>=evt){pc=14490;return;}
case 14490:cyc+=12;B=0;C=30;
if(cyc>=evt){pc=14493;return;}
case 14493:cyc+=24;push(14496);pc=7544;return;
if(cyc>=evt){pc=14496;return;}
case 14496:cyc+=12;B=196;C=0;
if(cyc>=evt){pc=14499;return;}
case 14499:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=14500;return;}
case 14500:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=14501;return;}
case 14501:cyc+=4;A=L;
if(cyc>=evt){pc=14502;return;}
case 14502:cyc+=4;add(C);
if(cyc>=evt){pc=14503;return;}
case 14503:cyc+=4;L=A;
if(cyc>=evt){pc=14504;return;}
case 14504:cyc+=8;if(!fc){cyc+=4;pc=14507;return;}
if(cyc>=evt){pc=14506;return;}
case 14506:cyc+=4;H=inc(H);
if(cyc>=evt){pc=14507;return;}
case 14507:cyc+=12;pc=14516;return;
case 14509:cyc+=4;A=L;
if(cyc>=evt){pc=14510;return;}
case 14510:cyc+=8;add(10);
if(cyc>=evt){pc=14512;return;}
case 14512:cyc+=4;L=A;
if(cyc>=evt){pc=14513;return;}
case 14513:cyc+=8;if(!fc){cyc+=4;pc=14516;return;}
if(cyc>=evt){pc=14515;return;}
case 14515:cyc+=4;H=inc(H);
if(cyc>=evt){pc=14516;return;}
case 14516:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=14517;return;}
case 14517:cyc+=8;and(31);
if(cyc>=evt){pc=14519;return;}
case 14519:cyc+=8;if(fz){cyc+=4;pc=14456;return;}
if(cyc>=evt){pc=14521;return;}
case 14521:cyc+=8;cp(11);
if(cyc>=evt){pc=14523;return;}
case 14523:cyc+=8;if(!fz){cyc+=4;pc=14537;return;}
if(cyc>=evt){pc=14525;return;}
case 14525:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=14526;return;}
case 14526:cyc+=8;E=0;
if(cyc>=evt){pc=14528;return;}
case 14528:cyc+=24;push(14531);pc=11964;return;
if(cyc>=evt){pc=14531;return;}
case 14531:cyc+=24;push(14534);pc=15150;return;
if(cyc>=evt){pc=14534;return;}
case 14534:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=14535;return;}
case 14535:cyc+=12;pc=14456;return;
case 14537:cyc+=8;cp(1);
if(cyc>=evt){pc=14539;return;}
case 14539:cyc+=8;if(fz){cyc+=4;pc=14580;return;}
if(cyc>=evt){pc=14541;return;}
case 14541:cyc+=8;cp(6);
if(cyc>=evt){pc=14543;return;}
case 14543:cyc+=8;if(fz){cyc+=4;pc=14563;return;}
if(cyc>=evt){pc=14545;return;}
case 14545:cyc+=8;cp(15);
if(cyc>=evt){pc=14547;return;}
case 14547:cyc+=8;if(fz){cyc+=4;pc=14563;return;}
if(cyc>=evt){pc=14549;return;}
case 14549:cyc+=8;cp(19);
if(cyc>=evt){pc=14551;return;}
case 14551:cyc+=8;if(!fz){cyc+=4;pc=14558;return;}
if(cyc>=evt){pc=14553;return;}
case 14553:cyc+=8;E=30;
if(cyc>=evt){pc=14555;return;}
case 14555:cyc+=24;push(14558);pc=11964;return;
if(cyc>=evt){pc=14558;return;}
case 14558:cyc+=24;push(14561);pc=15150;return;
if(cyc>=evt){pc=14561;return;}
case 14561:cyc+=12;pc=14588;return;
case 14563:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=14564;return;}
case 14564:cyc+=8;A=4;
if(cyc>=evt){pc=14566;return;}
case 14566:cyc+=16;wr(49588,A);
if(cyc>=evt){pc=14569;return;}
case 14569:cyc+=24;push(14572);pc=12680;return;
if(cyc>=evt){pc=14572;return;}
case 14572:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=14573;return;}
case 14573:cyc+=16;A=rd(49588);
if(cyc>=evt){pc=14576;return;}
case 14576:cyc+=8;fz=(A>>7)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=14578;return;}
case 14578:cyc+=8;if(!fz){cyc+=4;pc=14583;return;}
if(cyc>=evt){pc=14580;return;}
case 14580:cyc+=24;push(14583);pc=15150;return;
if(cyc>=evt){pc=14583;return;}
case 14583:cyc+=8;E=14;
if(cyc>=evt){pc=14585;return;}
case 14585:cyc+=24;push(14588);pc=11964;return;
if(cyc>=evt){pc=14588;return;}
case 14588:cyc+=16;pc=pop();return;
case 14589:cyc+=12;H=193;L=113;
if(cyc>=evt){pc=14592;return;}
case 14592:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=14595;return;}
case 14595:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=14596;return;}
case 14596:cyc+=8;if(fz){cyc+=4;pc=14642;return;}
if(cyc>=evt){pc=14598;return;}
case 14598:cyc+=12;B=198;C=210;
if(cyc>=evt){pc=14601;return;}
case 14601:cyc+=8;A=sla(A);
if(cyc>=evt){pc=14603;return;}
case 14603:cyc+=8;A=sla(A);
if(cyc>=evt){pc=14605;return;}
case 14605:cyc+=4;add(C);
if(cyc>=evt){pc=14606;return;}
case 14606:cyc+=4;C=A;
if(cyc>=evt){pc=14607;return;}
case 14607:cyc+=8;if(!fc){cyc+=4;pc=14610;return;}
if(cyc>=evt){pc=14609;return;}
case 14609:cyc+=4;B=inc(B);
if(cyc>=evt){pc=14610;return;}
case 14610:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=14611;return;}
case 14611:cyc+=4;A=dec(A);
if(cyc>=evt){pc=14612;return;}
case 14612:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=14613;return;}
case 14613:cyc+=8;if(fz){cyc+=4;pc=14635;return;}
if(cyc>=evt){pc=14615;return;}
case 14615:cyc+=12;B=198;C=208;
if(cyc>=evt){pc=14618;return;}
case 14618:cyc+=8;A=sla(A);
if(cyc>=evt){pc=14620;return;}
case 14620:cyc+=8;A=sla(A);
if(cyc>=evt){pc=14622;return;}
case 14622:cyc+=4;add(C);
if(cyc>=evt){pc=14623;return;}
case 14623:cyc+=4;C=A;
if(cyc>=evt){pc=14624;return;}
case 14624:cyc+=8;if(!fc){cyc+=4;pc=14627;return;}
if(cyc>=evt){pc=14626;return;}
case 14626:cyc+=4;B=inc(B);
if(cyc>=evt){pc=14627;return;}
case 14627:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=14628;return;}
case 14628:cyc+=4;A=dec(A);
if(cyc>=evt){pc=14629;return;}
case 14629:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=14630;return;}
case 14630:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14631;return;}
case 14631:cyc+=8;A=40;
if(cyc>=evt){pc=14633;return;}
case 14633:cyc+=12;pc=14645;return;
case 14635:cyc+=16;A=rd(49522);
if(cyc>=evt){pc=14638;return;}
case 14638:cyc+=8;add(10);
if(cyc>=evt){pc=14640;return;}
case 14640:cyc+=12;pc=14645;return;
case 14642:cyc+=16;A=rd(49522);
if(cyc>=evt){pc=14645;return;}
case 14645:cyc+=16;pushaf();
if(cyc>=evt){pc=14646;return;}
case 14646:cyc+=12;H=0;L=104;
if(cyc>=evt){pc=14649;return;}
case 14649:cyc+=4;add(L);
if(cyc>=evt){pc=14650;return;}
case 14650:cyc+=4;L=A;
if(cyc>=evt){pc=14651;return;}
case 14651:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=14652;return;}
case 14652:cyc+=4;D=A;
if(cyc>=evt){pc=14653;return;}
case 14653:cyc+=12;H=0;L=145;
if(cyc>=evt){pc=14656;return;}
case 14656:cyc+=12;popaf();
if(cyc>=evt){pc=14657;return;}
case 14657:cyc+=4;add(L);
if(cyc>=evt){pc=14658;return;}
case 14658:cyc+=4;L=A;
if(cyc>=evt){pc=14659;return;}
case 14659:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=14660;return;}
case 14660:cyc+=4;E=A;
if(cyc>=evt){pc=14661;return;}
case 14661:cyc+=4;xor(A);
if(cyc>=evt){pc=14662;return;}
case 14662:cyc+=16;pc=pop();return;
case 14663:cyc+=12;H=255;L=68;
if(cyc>=evt){pc=14666;return;}
case 14666:cyc+=8;A=145;
if(cyc>=evt){pc=14668;return;}
case 14668:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=14669;return;}
case 14669:cyc+=8;if(!fz){cyc+=4;pc=14668;return;}
if(cyc>=evt){pc=14671;return;}
case 14671:cyc+=12;A=rd(65344);
if(cyc>=evt){pc=14673;return;}
case 14673:cyc+=8;and(127);
if(cyc>=evt){pc=14675;return;}
case 14675:cyc+=12;wr(65344,A);
if(cyc>=evt){pc=14677;return;}
case 14677:cyc+=16;pc=pop();return;
case 14678:cyc+=24;push(14681);pc=14912;return;
if(cyc>=evt){pc=14681;return;}
case 14681:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14682;return;}
case 14682:cyc+=8;E=5;
if(cyc>=evt){pc=14684;return;}
case 14684:cyc+=16;A=rd(49458);
if(cyc>=evt){pc=14687;return;}
case 14687:cyc+=8;cp(4);
pc=14689;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 14689:cyc+=8;if(fz){cyc+=4;pc=14702;return;}
if(cyc>=evt){pc=14691;return;}
case 14691:cyc+=8;cp(6);
if(cyc>=evt){pc=14693;return;}
case 14693:cyc+=8;if(fz){cyc+=4;pc=14702;return;}
if(cyc>=evt){pc=14695;return;}
case 14695:cyc+=4;E=inc(E);
if(cyc>=evt){pc=14696;return;}
case 14696:cyc+=8;cp(5);
if(cyc>=evt){pc=14698;return;}
case 14698:cyc+=8;if(fz){cyc+=4;pc=14702;return;}
if(cyc>=evt){pc=14700;return;}
case 14700:cyc+=8;E=4;
if(cyc>=evt){pc=14702;return;}
case 14702:cyc+=4;A=E;
if(cyc>=evt){pc=14703;return;}
case 14703:cyc+=16;wr(49456,A);
if(cyc>=evt){pc=14706;return;}
case 14706:cyc+=16;pc=pop();return;
case 14707:cyc+=8;A=2;
if(cyc>=evt){pc=14709;return;}
case 14709:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=14712;return;}
case 14712:cyc+=12;D=105;E=233;
if(cyc>=evt){pc=14715;return;}
case 14715:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=14716;return;}
case 14716:cyc+=4;B=A;
if(cyc>=evt){pc=14717;return;}
case 14717:cyc+=8;A=1;
if(cyc>=evt){pc=14719;return;}
case 14719:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=14722;return;}
case 14722:cyc+=12;H=192;L=0;
if(cyc>=evt){pc=14725;return;}
case 14725:cyc+=8;A=140;
if(cyc>=evt){pc=14727;return;}
case 14727:cyc+=4;E=A;
if(cyc>=evt){pc=14728;return;}
case 14728:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14729;return;}
case 14729:cyc+=16;A=rd(49612);
if(cyc>=evt){pc=14732;return;}
case 14732:cyc+=4;C=A;
if(cyc>=evt){pc=14733;return;}
case 14733:cyc+=8;add(11);
if(cyc>=evt){pc=14735;return;}
case 14735:cyc+=8;A=sla(A);
if(cyc>=evt){pc=14737;return;}
case 14737:cyc+=8;A=sla(A);
if(cyc>=evt){pc=14739;return;}
case 14739:cyc+=8;A=sla(A);
if(cyc>=evt){pc=14741;return;}
case 14741:cyc+=8;add(8);
if(cyc>=evt){pc=14743;return;}
case 14743:cyc+=4;D=A;
if(cyc>=evt){pc=14744;return;}
case 14744:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14745;return;}
case 14745:cyc+=4;A=B;
if(cyc>=evt){pc=14746;return;}
case 14746:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14747;return;}
case 14747:cyc+=4;xor(A);
if(cyc>=evt){pc=14748;return;}
case 14748:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14749;return;}
case 14749:cyc+=4;A=E;
if(cyc>=evt){pc=14750;return;}
case 14750:cyc+=8;add(8);
if(cyc>=evt){pc=14752;return;}
case 14752:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14753;return;}
case 14753:cyc+=4;A=D;
if(cyc>=evt){pc=14754;return;}
case 14754:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14755;return;}
case 14755:cyc+=4;A=B;
if(cyc>=evt){pc=14756;return;}
case 14756:cyc+=4;A=inc(A);
if(cyc>=evt){pc=14757;return;}
case 14757:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14758;return;}
case 14758:cyc+=4;xor(A);
if(cyc>=evt){pc=14759;return;}
case 14759:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14760;return;}
case 14760:cyc+=8;A=1;
if(cyc>=evt){pc=14762;return;}
case 14762:cyc+=16;wr(49496,A);
if(cyc>=evt){pc=14765;return;}
case 14765:cyc+=16;pc=pop();return;
case 14766:cyc+=8;B=8;
if(cyc>=evt){pc=14768;return;}
case 14768:cyc+=12;H=193;L=196;
if(cyc>=evt){pc=14771;return;}
case 14771:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=14772;return;}
case 14772:cyc+=8;xor(5);
if(cyc>=evt){pc=14774;return;}
case 14774:cyc+=8;fz=(A>>3)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=14776;return;}
case 14776:cyc+=8;if(fz){cyc+=4;pc=14780;return;}
if(cyc>=evt){pc=14778;return;}
case 14778:cyc+=8;A=A&251;
if(cyc>=evt){pc=14780;return;}
case 14780:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14781;return;}
case 14781:cyc+=4;B=dec(B);
if(cyc>=evt){pc=14782;return;}
case 14782:cyc+=8;if(!fz){cyc+=4;pc=14771;return;}
if(cyc>=evt){pc=14784;return;}
case 14784:cyc+=8;{const t=(H<<8|L)-1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=14785;return;}
case 14785:cyc+=8;B=4;
if(cyc>=evt){pc=14787;return;}
case 14787:cyc+=12;D=193;E=196;
if(cyc>=evt){pc=14790;return;}
case 14790:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=14791;return;}
case 14791:cyc+=16;pushaf();
if(cyc>=evt){pc=14792;return;}
case 14792:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=14793;return;}
case 14793:cyc+=8;wr((H<<8|L),A);if(!L)H=(H-1)&255;L=(L-1)&255;
if(cyc>=evt){pc=14794;return;}
case 14794:cyc+=12;popaf();
if(cyc>=evt){pc=14795;return;}
case 14795:cyc+=8;wr(D<<8|E,A);
if(cyc>=evt){pc=14796;return;}
case 14796:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=14797;return;}
case 14797:cyc+=4;B=dec(B);
if(cyc>=evt){pc=14798;return;}
case 14798:cyc+=8;if(!fz){cyc+=4;pc=14790;return;}
if(cyc>=evt){pc=14800;return;}
case 14800:cyc+=16;pc=pop();return;
case 14801:cyc+=24;push(14804);pc=14766;return;
if(cyc>=evt){pc=14804;return;}
case 14804:cyc+=12;B=193;C=201;
if(cyc>=evt){pc=14807;return;}
case 14807:cyc+=12;H=193;L=196;
if(cyc>=evt){pc=14810;return;}
case 14810:cyc+=24;push(14813);pc=14822;return;
if(cyc>=evt){pc=14813;return;}
case 14813:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14814;return;}
case 14814:cyc+=24;push(14817);pc=14822;return;
if(cyc>=evt){pc=14817;return;}
case 14817:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14818;return;}
case 14818:cyc+=24;push(14821);pc=14822;return;
if(cyc>=evt){pc=14821;return;}
case 14821:cyc+=16;pc=pop();return;
case 14822:cyc+=24;push(14825);pc=14836;return;
if(cyc>=evt){pc=14825;return;}
case 14825:cyc+=4;E=A;
if(cyc>=evt){pc=14826;return;}
case 14826:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=14827;return;}
case 14827:cyc+=8;{const t=(B<<8|C)+1;B=(t>>8)&255;C=t&255;}
if(cyc>=evt){pc=14828;return;}
case 14828:cyc+=4;cp(E);
if(cyc>=evt){pc=14829;return;}
case 14829:cyc+=16;pc=pop();return;
case 14830:cyc+=24;push(14833);pc=14836;return;
if(cyc>=evt){pc=14833;return;}
case 14833:cyc+=8;wr(B<<8|C,A);
if(cyc>=evt){pc=14834;return;}
case 14834:cyc+=8;{const t=(B<<8|C)+1;B=(t>>8)&255;C=t&255;}
if(cyc>=evt){pc=14835;return;}
case 14835:cyc+=16;pc=pop();return;
case 14836:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14837;return;}
case 14837:cyc+=8;add(rd((H<<8|L)));
if(cyc>=evt){pc=14838;return;}
case 14838:cyc+=8;cp(10);
if(cyc>=evt){pc=14840;return;}
case 14840:cyc+=8;if(fc){cyc+=4;pc=14844;return;}
if(cyc>=evt){pc=14842;return;}
case 14842:cyc+=8;sub(10);
if(cyc>=evt){pc=14844;return;}
case 14844:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=14845;return;}
case 14845:cyc+=16;pc=pop();return;
case 14846:cyc+=8;A=1;
if(cyc>=evt){pc=14848;return;}
case 14848:cyc+=16;wr(49591,A);
if(cyc>=evt){pc=14851;return;}
case 14851:cyc+=8;B=8;
if(cyc>=evt){pc=14853;return;}
case 14853:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14854;return;}
case 14854:cyc+=4;C=A;
if(cyc>=evt){pc=14855;return;}
case 14855:cyc+=8;A=rd((H<<8|L));if(!L)H=(H-1)&255;L=(L-1)&255;
if(cyc>=evt){pc=14856;return;}
case 14856:cyc+=4;A^=255;fn=1;fh=1;
if(cyc>=evt){pc=14857;return;}
case 14857:cyc+=4;and(C);
if(cyc>=evt){pc=14858;return;}
case 14858:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14859;return;}
case 14859:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=14860;return;}
case 14860:cyc+=4;B=dec(B);
if(cyc>=evt){pc=14861;return;}
case 14861:cyc+=8;if(!fz){cyc+=4;pc=14853;return;}
if(cyc>=evt){pc=14863;return;}
case 14863:cyc+=16;pc=pop();return;
case 14864:cyc+=8;A=1;
if(cyc>=evt){pc=14866;return;}
case 14866:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=14869;return;}
case 14869:cyc+=16;A=rd(49501);
if(cyc>=evt){pc=14872;return;}
case 14872:cyc+=4;and(A);
if(cyc>=evt){pc=14873;return;}
case 14873:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14874;return;}
case 14874:cyc+=4;A=dec(A);
if(cyc>=evt){pc=14875;return;}
case 14875:cyc+=16;wr(49501,A);
if(cyc>=evt){pc=14878;return;}
case 14878:cyc+=16;pc=pop();return;
case 14879:cyc+=8;A=1;
if(cyc>=evt){pc=14881;return;}
case 14881:cyc+=16;wr(49498,A);
if(cyc>=evt){pc=14884;return;}
case 14884:cyc+=16;A=rd(49504);
if(cyc>=evt){pc=14887;return;}
case 14887:cyc+=4;and(A);
if(cyc>=evt){pc=14888;return;}
case 14888:cyc+=8;if(fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14889;return;}
case 14889:cyc+=4;A=dec(A);
if(cyc>=evt){pc=14890;return;}
case 14890:cyc+=16;wr(49504,A);
if(cyc>=evt){pc=14893;return;}
case 14893:cyc+=16;pc=pop();return;
case 14894:cyc+=16;A=rd(49481);
if(cyc>=evt){pc=14897;return;}
case 14897:cyc+=8;cp(6);
if(cyc>=evt){pc=14899;return;}
case 14899:cyc+=4;cp(B);
if(cyc>=evt){pc=14900;return;}
case 14900:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14901;return;}
case 14901:cyc+=16;A=rd(49484);
if(cyc>=evt){pc=14904;return;}
case 14904:cyc+=4;A=inc(A);
if(cyc>=evt){pc=14905;return;}
case 14905:cyc+=4;cp(C);
if(cyc>=evt){pc=14906;return;}
case 14906:cyc+=16;pc=pop();return;
case 14907:cyc+=16;A=rd(49457);
if(cyc>=evt){pc=14910;return;}
case 14910:cyc+=12;pc=14915;return;
case 14912:cyc+=16;A=rd(49456);
if(cyc>=evt){pc=14915;return;}
case 14915:cyc+=8;cp(106);
if(cyc>=evt){pc=14917;return;}
case 14917:cyc+=16;pc=pop();return;
case 14918:cyc+=24;push(14921);pc=14953;return;
if(cyc>=evt){pc=14921;return;}
case 14921:cyc+=12;pc=14931;return;
case 14923:cyc+=16;A=rd(49621);
if(cyc>=evt){pc=14926;return;}
case 14926:cyc+=4;L=A;
if(cyc>=evt){pc=14927;return;}
case 14927:cyc+=16;A=rd(49622);
if(cyc>=evt){pc=14930;return;}
case 14930:cyc+=4;H=A;
if(cyc>=evt){pc=14931;return;}
case 14931:cyc+=8;A=3;
if(cyc>=evt){pc=14933;return;}
case 14933:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=14936;return;}
case 14936:cyc+=8;A=rd((H<<8|L));
if(cyc>=evt){pc=14937;return;}
case 14937:cyc+=16;pushaf();
if(cyc>=evt){pc=14938;return;}
case 14938:cyc+=8;A=1;
if(cyc>=evt){pc=14940;return;}
case 14940:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=14943;return;}
case 14943:cyc+=12;popaf();
if(cyc>=evt){pc=14944;return;}
case 14944:cyc+=8;cp(106);
if(cyc>=evt){pc=14946;return;}
case 14946:cyc+=16;wr(49457,A);
if(cyc>=evt){pc=14949;return;}
case 14949:cyc+=8;if(!fz){cyc+=4;pc=14952;return;}
if(cyc>=evt){pc=14951;return;}
case 14951:cyc+=16;pc=pop();return;
case 14952:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=14953;return;}
case 14953:cyc+=4;A=L;
if(cyc>=evt){pc=14954;return;}
case 14954:cyc+=16;wr(49621,A);
if(cyc>=evt){pc=14957;return;}
case 14957:cyc+=4;A=H;
if(cyc>=evt){pc=14958;return;}
case 14958:cyc+=16;wr(49622,A);
if(cyc>=evt){pc=14961;return;}
case 14961:cyc+=16;pc=pop();return;
case 14962:cyc+=16;A=rd(49622);
if(cyc>=evt){pc=14965;return;}
case 14965:cyc+=4;cp(B);
if(cyc>=evt){pc=14966;return;}
case 14966:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=14967;return;}
case 14967:cyc+=16;A=rd(49621);
if(cyc>=evt){pc=14970;return;}
case 14970:cyc+=4;cp(C);
if(cyc>=evt){pc=14971;return;}
case 14971:cyc+=16;pc=pop();return;
case 14992:cyc+=4;xor(A);
if(cyc>=evt){pc=14993;return;}
case 14993:if(GK[14993]){pc=14993;if(ghooks[14993]())return;}
cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=14994;return;}
case 14994:cyc+=4;C=A;
if(cyc>=evt){pc=14995;return;}
case 14995:cyc+=16;A=rd(32767);
if(cyc>=evt){pc=14998;return;}
case 14998:cyc+=16;pushaf();
if(cyc>=evt){pc=14999;return;}
case 14999:cyc+=8;A=15;
if(cyc>=evt){pc=15001;return;}
case 15001:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=15004;return;}
case 15004:cyc+=4;A=C;
if(cyc>=evt){pc=15005;return;}
case 15005:cyc+=24;push(15008);pc=24995;return;
if(cyc>=evt){pc=15008;return;}
case 15008:cyc+=12;popaf();
if(cyc>=evt){pc=15009;return;}
case 15009:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=15012;return;}
case 15012:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=15013;return;}
case 15013:cyc+=16;pc=pop();return;
case 15014:cyc+=16;A=rd(49592);
if(cyc>=evt){pc=15017;return;}
case 15017:cyc+=4;and(A);
if(cyc>=evt){pc=15018;return;}
case 15018:cyc+=8;if(!fz){cyc+=12;pc=pop();return;}
if(cyc>=evt){pc=15019;return;}
case 15019:cyc+=8;A=23;
if(cyc>=evt){pc=15021;return;}
case 15021:cyc+=12;pc=14993;return;
case 15023:cyc+=8;A=0;
if(cyc>=evt){pc=15025;return;}
case 15025:cyc+=16;wr(49593,A);
if(cyc>=evt){pc=15028;return;}
case 15028:cyc+=16;wr(65318,A);
if(cyc>=evt){pc=15031;return;}
case 15031:cyc+=8;A=128;
if(cyc>=evt){pc=15033;return;}
case 15033:cyc+=16;wr(65318,A);
if(cyc>=evt){pc=15036;return;}
case 15036:cyc+=8;A=119;
if(cyc>=evt){pc=15038;return;}
case 15038:cyc+=16;wr(65316,A);
if(cyc>=evt){pc=15041;return;}
case 15041:cyc+=8;A=222;
if(cyc>=evt){pc=15043;return;}
case 15043:cyc+=16;wr(65317,A);
if(cyc>=evt){pc=15046;return;}
case 15046:cyc+=16;pc=pop();return;
case 15047:cyc+=16;A=rd(49477);
if(cyc>=evt){pc=15050;return;}
case 15050:cyc+=4;C=A;
if(cyc>=evt){pc=15051;return;}
case 15051:cyc+=16;A=rd(49478);
if(cyc>=evt){pc=15054;return;}
case 15054:cyc+=4;B=A;
if(cyc>=evt){pc=15055;return;}
case 15055:cyc+=12;pc=15065;return;
case 15057:cyc+=16;A=rd(49474);
if(cyc>=evt){pc=15060;return;}
case 15060:cyc+=4;C=A;
if(cyc>=evt){pc=15061;return;}
case 15061:cyc+=16;A=rd(49475);
if(cyc>=evt){pc=15064;return;}
case 15064:cyc+=4;B=A;
if(cyc>=evt){pc=15065;return;}
case 15065:cyc+=16;pushaf();
if(cyc>=evt){pc=15066;return;}
case 15066:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=15067;return;}
case 15067:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=15068;return;}
case 15068:cyc+=16;SP=(SP-1)&65535;m[SP]=H;SP=(SP-1)&65535;m[SP]=L;
if(cyc>=evt){pc=15069;return;}
case 15069:cyc+=8;A=15;
if(cyc>=evt){pc=15071;return;}
case 15071:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=15074;return;}
case 15074:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=15075;return;}
case 15075:cyc+=8;{const t=(B<<8|C)+1;B=(t>>8)&255;C=t&255;}
if(cyc>=evt){pc=15076;return;}
case 15076:cyc+=8;cp(1);
if(cyc>=evt){pc=15078;return;}
case 15078:cyc+=8;if(!fz){cyc+=4;pc=15088;return;}
if(cyc>=evt){pc=15080;return;}
case 15080:cyc+=12;H=255;L=16;
if(cyc>=evt){pc=15083;return;}
case 15083:cyc+=12;D=5;E=17;
if(cyc>=evt){pc=15086;return;}
case 15086:cyc+=12;pc=15110;return;
case 15088:cyc+=8;cp(2);
if(cyc>=evt){pc=15090;return;}
case 15090:cyc+=8;if(!fz){cyc+=4;pc=15100;return;}
if(cyc>=evt){pc=15092;return;}
case 15092:cyc+=12;H=255;L=22;
pc=15095;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 15095:cyc+=12;D=4;E=34;
if(cyc>=evt){pc=15098;return;}
case 15098:cyc+=12;pc=15110;return;
case 15100:cyc+=8;cp(4);
if(cyc>=evt){pc=15102;return;}
case 15102:cyc+=8;if(!fz){cyc+=4;pc=15125;return;}
if(cyc>=evt){pc=15104;return;}
case 15104:cyc+=12;H=255;L=32;
if(cyc>=evt){pc=15107;return;}
case 15107:cyc+=12;D=4;E=136;
if(cyc>=evt){pc=15110;return;}
case 15110:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=15111;return;}
case 15111:cyc+=8;{const t=(B<<8|C)+1;B=(t>>8)&255;C=t&255;}
if(cyc>=evt){pc=15112;return;}
case 15112:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=15113;return;}
case 15113:cyc+=4;D=dec(D);
if(cyc>=evt){pc=15114;return;}
case 15114:cyc+=8;if(!fz){cyc+=4;pc=15110;return;}
if(cyc>=evt){pc=15116;return;}
case 15116:cyc+=16;A=rd(65317);
if(cyc>=evt){pc=15119;return;}
case 15119:cyc+=4;or(E);
if(cyc>=evt){pc=15120;return;}
case 15120:cyc+=16;wr(65317,A);
if(cyc>=evt){pc=15123;return;}
case 15123:cyc+=12;pc=15074;return;
case 15125:cyc+=8;A=1;
if(cyc>=evt){pc=15127;return;}
case 15127:cyc+=16;wr(8192,A);
if(cyc>=evt){pc=15130;return;}
case 15130:cyc+=12;L=m[SP];H=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=15131;return;}
case 15131:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=15132;return;}
case 15132:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=15133;return;}
case 15133:cyc+=12;popaf();
if(cyc>=evt){pc=15134;return;}
case 15134:cyc+=16;pc=pop();return;
case 15135:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=15136;return;}
case 15136:cyc+=16;A=rd(49520);
if(cyc>=evt){pc=15139;return;}
case 15139:cyc+=4;and(A);
if(cyc>=evt){pc=15140;return;}
case 15140:cyc+=8;if(!fz){cyc+=4;pc=15148;return;}
if(cyc>=evt){pc=15142;return;}
case 15142:cyc+=12;B=64;C=50;
if(cyc>=evt){pc=15145;return;}
case 15145:cyc+=24;push(15148);pc=15065;return;
if(cyc>=evt){pc=15148;return;}
case 15148:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=15149;return;}
case 15149:cyc+=16;pc=pop();return;
case 15150:cyc+=16;SP=(SP-1)&65535;m[SP]=B;SP=(SP-1)&65535;m[SP]=C;
if(cyc>=evt){pc=15151;return;}
case 15151:cyc+=12;B=64;C=38;
if(cyc>=evt){pc=15154;return;}
case 15154:cyc+=24;push(15157);pc=15065;return;
if(cyc>=evt){pc=15157;return;}
case 15157:cyc+=12;C=m[SP];B=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=15158;return;}
case 15158:cyc+=16;pc=pop();return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 24995:cyc+=16;pushaf();
if(cyc>=evt){pc=24996;return;}
case 24996:cyc+=16;SP=(SP-1)&65535;m[SP]=D;SP=(SP-1)&65535;m[SP]=E;
if(cyc>=evt){pc=24997;return;}
case 24997:cyc+=12;H=193;L=184;
if(cyc>=evt){pc=25000;return;}
case 25000:cyc+=8;cp(rd((H<<8|L)));
if(cyc>=evt){pc=25001;return;}
case 25001:cyc+=8;if(fz){cyc+=4;pc=25078;return;}
if(cyc>=evt){pc=25003;return;}
case 25003:cyc+=12;B=64;C=178;
if(cyc>=evt){pc=25006;return;}
case 25006:cyc+=8;A=sla(A);
if(cyc>=evt){pc=25008;return;}
case 25008:cyc+=4;add(C);
if(cyc>=evt){pc=25009;return;}
case 25009:cyc+=4;C=A;
if(cyc>=evt){pc=25010;return;}
case 25010:cyc+=8;if(!fc){cyc+=4;pc=25013;return;}
if(cyc>=evt){pc=25012;return;}
case 25012:cyc+=4;B=inc(B);
if(cyc>=evt){pc=25013;return;}
case 25013:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=25014;return;}
case 25014:cyc+=4;E=A;
if(cyc>=evt){pc=25015;return;}
case 25015:cyc+=8;{const t=(B<<8|C)+1;B=(t>>8)&255;C=t&255;}
if(cyc>=evt){pc=25016;return;}
case 25016:cyc+=8;A=rd(B<<8|C);
if(cyc>=evt){pc=25017;return;}
case 25017:cyc+=4;D=A;
if(cyc>=evt){pc=25018;return;}
case 25018:cyc+=4;or(E);
if(cyc>=evt){pc=25019;return;}
case 25019:cyc+=8;if(fz){cyc+=4;pc=25078;return;}
if(cyc>=evt){pc=25021;return;}
case 25021:cyc+=4;C=E;
if(cyc>=evt){pc=25022;return;}
case 25022:cyc+=4;B=D;
if(cyc>=evt){pc=25023;return;}
case 25023:cyc+=12;H=193;L=188;
if(cyc>=evt){pc=25026;return;}
case 25026:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=25027;return;}
case 25027:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=25028;return;}
case 25028:cyc+=4;add(C);
if(cyc>=evt){pc=25029;return;}
case 25029:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25030;return;}
case 25030:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=25031;return;}
case 25031:cyc+=8;{const t=(D<<8|E)+1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=25032;return;}
case 25032:cyc+=4;adc(B);
if(cyc>=evt){pc=25033;return;}
case 25033:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25034;return;}
case 25034:cyc+=4;A=L;
if(cyc>=evt){pc=25035;return;}
case 25035:cyc+=8;cp(196);
if(cyc>=evt){pc=25037;return;}
case 25037:cyc+=8;if(!fz){cyc+=4;pc=25026;return;}
if(cyc>=evt){pc=25039;return;}
case 25039:cyc+=12;H=193;L=186;
if(cyc>=evt){pc=25042;return;}
case 25042:cyc+=4;xor(A);
if(cyc>=evt){pc=25043;return;}
case 25043:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25044;return;}
case 25044:cyc+=8;wr((H<<8|L),A);
if(cyc>=evt){pc=25045;return;}
case 25045:cyc+=12;H=255;L=48;
if(cyc>=evt){pc=25048;return;}
case 25048:cyc+=8;A=255;
if(cyc>=evt){pc=25050;return;}
case 25050:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25051;return;}
case 25051:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25052;return;}
case 25052:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25053;return;}
case 25053:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25054;return;}
case 25054:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25055;return;}
case 25055:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25056;return;}
case 25056:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25057;return;}
case 25057:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25058;return;}
case 25058:cyc+=8;A=0;
if(cyc>=evt){pc=25060;return;}
case 25060:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25061;return;}
case 25061:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25062;return;}
case 25062:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25063;return;}
case 25063:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25064;return;}
case 25064:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25065;return;}
case 25065:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25066;return;}
case 25066:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25067;return;}
case 25067:cyc+=8;wr((H<<8|L),A);L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25068;return;}
case 25068:cyc+=8;A=219;
if(cyc>=evt){pc=25070;return;}
case 25070:cyc+=16;wr(65317,A);
if(cyc>=evt){pc=25073;return;}
case 25073:cyc+=8;A=15;
if(cyc>=evt){pc=25075;return;}
case 25075:cyc+=16;wr(49593,A);
if(cyc>=evt){pc=25078;return;}
case 25078:cyc+=12;E=m[SP];D=m[(SP+1)&65535];SP=(SP+2)&65535;
if(cyc>=evt){pc=25079;return;}
case 25079:cyc+=12;popaf();
if(cyc>=evt){pc=25080;return;}
case 25080:cyc+=16;wr(49592,A);
if(cyc>=evt){pc=25083;return;}
case 25083:cyc+=4;and(A);
if(cyc>=evt){pc=25084;return;}
case 25084:cyc+=12;if(fz){cyc+=4;pc=15023;return;}
if(cyc>=evt){pc=25087;return;}
case 25087:cyc+=16;pc=pop();return;
case 25088:cyc+=12;H=193;L=185;
if(cyc>=evt){pc=25091;return;}
case 25091:cyc+=12;fz=(rd((H<<8|L))>>0)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=25093;return;}
case 25093:cyc+=8;if(fz){cyc+=4;pc=25202;return;}
if(cyc>=evt){pc=25095;return;}
case 25095:cyc+=16;A=rd(49596);
if(cyc>=evt){pc=25098;return;}
case 25098:cyc+=4;L=A;
if(cyc>=evt){pc=25099;return;}
case 25099:cyc+=16;A=rd(49597);
if(cyc>=evt){pc=25102;return;}
case 25102:cyc+=4;H=A;
if(cyc>=evt){pc=25103;return;}
case 25103:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25104;return;}
case 25104:cyc+=4;C=A;
if(cyc>=evt){pc=25105;return;}
case 25105:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25106;return;}
case 25106:cyc+=4;B=A;
if(cyc>=evt){pc=25107;return;}
case 25107:cyc+=12;D=193;E=187;
if(cyc>=evt){pc=25110;return;}
case 25110:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=25111;return;}
case 25111:cyc+=4;cp(B);
if(cyc>=evt){pc=25112;return;}
case 25112:cyc+=8;if(fc){cyc+=4;pc=25202;return;}
if(cyc>=evt){pc=25114;return;}
case 25114:cyc+=8;if(!fz){cyc+=4;pc=25121;return;}
if(cyc>=evt){pc=25116;return;}
case 25116:cyc+=8;{const t=(D<<8|E)-1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=25117;return;}
case 25117:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=25118;return;}
case 25118:cyc+=4;cp(C);
if(cyc>=evt){pc=25119;return;}
case 25119:cyc+=8;if(fc){cyc+=4;pc=25202;return;}
if(cyc>=evt){pc=25121;return;}
case 25121:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25122;return;}
case 25122:cyc+=4;and(A);
if(cyc>=evt){pc=25123;return;}
case 25123:cyc+=8;if(!fz){cyc+=4;pc=25132;return;}
if(cyc>=evt){pc=25125;return;}
case 25125:cyc+=12;H=193;L=185;
if(cyc>=evt){pc=25128;return;}
case 25128:cyc+=16;wr((H<<8|L),rd((H<<8|L))&254);
if(cyc>=evt){pc=25130;return;}
case 25130:cyc+=12;pc=25202;return;
case 25132:cyc+=8;sub(24);
if(cyc>=evt){pc=25134;return;}
case 25134:cyc+=8;A=sla(A);
if(cyc>=evt){pc=25136;return;}
case 25136:cyc+=4;C=A;
if(cyc>=evt){pc=25137;return;}
case 25137:cyc+=8;A=64;
if(cyc>=evt){pc=25139;return;}
case 25139:cyc+=16;wr(65300,A);
if(cyc>=evt){pc=25142;return;}
case 25142:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25143;return;}
case 25143:cyc+=8;A=sla(A);
if(cyc>=evt){pc=25145;return;}
case 25145:cyc+=8;if(fc){cyc+=4;pc=25149;return;}
if(cyc>=evt){pc=25147;return;}
case 25147:cyc+=8;A=255;
if(cyc>=evt){pc=25149;return;}
case 25149:cyc+=8;and(240);
if(cyc>=evt){pc=25151;return;}
case 25151:cyc+=4;B=A;
if(cyc>=evt){pc=25152;return;}
case 25152:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25153;return;}
case 25153:cyc+=8;and(127);
if(cyc>=evt){pc=25155;return;}
case 25155:cyc+=8;A=srl(A);
if(cyc>=evt){pc=25157;return;}
case 25157:cyc+=8;A=srl(A);
if(cyc>=evt){pc=25159;return;}
case 25159:cyc+=8;A=srl(A);
if(cyc>=evt){pc=25161;return;}
case 25161:cyc+=8;A=srl(A);
if(cyc>=evt){pc=25163;return;}
case 25163:cyc+=8;if(!fz){cyc+=4;pc=25167;return;}
if(cyc>=evt){pc=25165;return;}
case 25165:cyc+=8;or(1);
if(cyc>=evt){pc=25167;return;}
case 25167:cyc+=4;or(B);
if(cyc>=evt){pc=25168;return;}
case 25168:cyc+=16;wr(65298,A);
if(cyc>=evt){pc=25171;return;}
case 25171:cyc+=8;B=0;
if(cyc>=evt){pc=25173;return;}
case 25173:cyc+=4;A=L;
if(cyc>=evt){pc=25174;return;}
case 25174:cyc+=16;wr(49596,A);
if(cyc>=evt){pc=25177;return;}
case 25177:cyc+=4;A=H;
if(cyc>=evt){pc=25178;return;}
case 25178:cyc+=16;wr(49597,A);
if(cyc>=evt){pc=25181;return;}
case 25181:cyc+=12;H=96;L=249;
if(cyc>=evt){pc=25184;return;}
case 25184:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=25185;return;}
case 25185:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25186;return;}
case 25186:cyc+=16;wr(65299,A);
if(cyc>=evt){pc=25189;return;}
case 25189:cyc+=8;A=0;
if(cyc>=evt){pc=25191;return;}
case 25191:cyc+=16;wr(65296,A);
if(cyc>=evt){pc=25194;return;}
case 25194:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25195;return;}
case 25195:cyc+=8;or(128);
if(cyc>=evt){pc=25197;return;}
case 25197:cyc+=16;wr(65300,A);
if(cyc>=evt){pc=25200;return;}
case 25200:cyc+=12;pc=25095;return;
case 25202:cyc+=12;H=193;L=185;
if(cyc>=evt){pc=25205;return;}
case 25205:cyc+=12;fz=(rd((H<<8|L))>>1)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=25207;return;}
case 25207:cyc+=8;if(fz){cyc+=4;pc=25311;return;}
if(cyc>=evt){pc=25209;return;}
case 25209:cyc+=16;A=rd(49598);
if(cyc>=evt){pc=25212;return;}
case 25212:cyc+=4;L=A;
if(cyc>=evt){pc=25213;return;}
case 25213:cyc+=16;A=rd(49599);
if(cyc>=evt){pc=25216;return;}
case 25216:cyc+=4;H=A;
if(cyc>=evt){pc=25217;return;}
case 25217:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25218;return;}
case 25218:cyc+=4;C=A;
if(cyc>=evt){pc=25219;return;}
case 25219:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25220;return;}
case 25220:cyc+=4;B=A;
if(cyc>=evt){pc=25221;return;}
case 25221:cyc+=12;D=193;E=187;
if(cyc>=evt){pc=25224;return;}
case 25224:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=25225;return;}
case 25225:cyc+=4;cp(B);
if(cyc>=evt){pc=25226;return;}
case 25226:cyc+=8;if(fc){cyc+=4;pc=25311;return;}
if(cyc>=evt){pc=25228;return;}
case 25228:cyc+=8;if(!fz){cyc+=4;pc=25235;return;}
if(cyc>=evt){pc=25230;return;}
case 25230:cyc+=8;{const t=(D<<8|E)-1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=25231;return;}
case 25231:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=25232;return;}
case 25232:cyc+=4;cp(C);
if(cyc>=evt){pc=25233;return;}
case 25233:cyc+=8;if(fc){cyc+=4;pc=25311;return;}
if(cyc>=evt){pc=25235;return;}
case 25235:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25236;return;}
case 25236:cyc+=4;and(A);
if(cyc>=evt){pc=25237;return;}
case 25237:cyc+=8;if(!fz){cyc+=4;pc=25246;return;}
if(cyc>=evt){pc=25239;return;}
case 25239:cyc+=12;H=193;L=185;
if(cyc>=evt){pc=25242;return;}
case 25242:cyc+=16;wr((H<<8|L),rd((H<<8|L))&253);
if(cyc>=evt){pc=25244;return;}
case 25244:cyc+=12;pc=25311;return;
case 25246:cyc+=8;sub(24);
if(cyc>=evt){pc=25248;return;}
case 25248:cyc+=8;A=sla(A);
if(cyc>=evt){pc=25250;return;}
case 25250:cyc+=4;C=A;
if(cyc>=evt){pc=25251;return;}
case 25251:cyc+=8;A=64;
if(cyc>=evt){pc=25253;return;}
case 25253:cyc+=16;wr(65305,A);
if(cyc>=evt){pc=25256;return;}
case 25256:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25257;return;}
case 25257:cyc+=8;A=sla(A);
if(cyc>=evt){pc=25259;return;}
case 25259:cyc+=8;if(fc){cyc+=4;pc=25263;return;}
if(cyc>=evt){pc=25261;return;}
case 25261:cyc+=8;A=255;
if(cyc>=evt){pc=25263;return;}
case 25263:cyc+=8;and(240);
if(cyc>=evt){pc=25265;return;}
case 25265:cyc+=4;B=A;
if(cyc>=evt){pc=25266;return;}
case 25266:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25267;return;}
case 25267:cyc+=8;and(127);
if(cyc>=evt){pc=25269;return;}
case 25269:cyc+=8;A=srl(A);
if(cyc>=evt){pc=25271;return;}
case 25271:cyc+=8;A=srl(A);
if(cyc>=evt){pc=25273;return;}
case 25273:cyc+=8;A=srl(A);
if(cyc>=evt){pc=25275;return;}
case 25275:cyc+=8;A=srl(A);
if(cyc>=evt){pc=25277;return;}
case 25277:cyc+=8;if(!fz){cyc+=4;pc=25281;return;}
if(cyc>=evt){pc=25279;return;}
case 25279:cyc+=8;or(1);
if(cyc>=evt){pc=25281;return;}
case 25281:cyc+=4;or(B);
if(cyc>=evt){pc=25282;return;}
case 25282:cyc+=16;wr(65303,A);
if(cyc>=evt){pc=25285;return;}
case 25285:cyc+=8;B=0;
if(cyc>=evt){pc=25287;return;}
case 25287:cyc+=4;A=L;
if(cyc>=evt){pc=25288;return;}
case 25288:cyc+=16;wr(49598,A);
if(cyc>=evt){pc=25291;return;}
case 25291:cyc+=4;A=H;
if(cyc>=evt){pc=25292;return;}
case 25292:cyc+=16;wr(49599,A);
if(cyc>=evt){pc=25295;return;}
case 25295:cyc+=12;H=96;L=249;
if(cyc>=evt){pc=25298;return;}
case 25298:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=25299;return;}
case 25299:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25300;return;}
case 25300:cyc+=16;wr(65304,A);
if(cyc>=evt){pc=25303;return;}
case 25303:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25304;return;}
case 25304:cyc+=8;or(128);
if(cyc>=evt){pc=25306;return;}
case 25306:cyc+=16;wr(65305,A);
if(cyc>=evt){pc=25309;return;}
case 25309:cyc+=12;pc=25209;return;
case 25311:cyc+=12;H=193;L=185;
if(cyc>=evt){pc=25314;return;}
case 25314:cyc+=12;fz=(rd((H<<8|L))>>2)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=25316;return;}
case 25316:cyc+=8;if(fz){cyc+=4;pc=25409;return;}
if(cyc>=evt){pc=25318;return;}
case 25318:cyc+=16;A=rd(49600);
if(cyc>=evt){pc=25321;return;}
case 25321:cyc+=4;L=A;
if(cyc>=evt){pc=25322;return;}
case 25322:cyc+=16;A=rd(49601);
if(cyc>=evt){pc=25325;return;}
case 25325:cyc+=4;H=A;
if(cyc>=evt){pc=25326;return;}
case 25326:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25327;return;}
case 25327:cyc+=4;C=A;
if(cyc>=evt){pc=25328;return;}
case 25328:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25329;return;}
case 25329:cyc+=4;B=A;
if(cyc>=evt){pc=25330;return;}
case 25330:cyc+=12;D=193;E=187;
if(cyc>=evt){pc=25333;return;}
case 25333:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=25334;return;}
case 25334:cyc+=4;cp(B);
if(cyc>=evt){pc=25335;return;}
case 25335:cyc+=8;if(fc){cyc+=4;pc=25409;return;}
if(cyc>=evt){pc=25337;return;}
case 25337:cyc+=8;if(!fz){cyc+=4;pc=25344;return;}
if(cyc>=evt){pc=25339;return;}
case 25339:cyc+=8;{const t=(D<<8|E)-1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=25340;return;}
case 25340:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=25341;return;}
case 25341:cyc+=4;cp(C);
if(cyc>=evt){pc=25342;return;}
case 25342:cyc+=8;if(fc){cyc+=4;pc=25409;return;}
if(cyc>=evt){pc=25344;return;}
case 25344:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25345;return;}
case 25345:cyc+=4;and(A);
if(cyc>=evt){pc=25346;return;}
case 25346:cyc+=8;if(!fz){cyc+=4;pc=25355;return;}
if(cyc>=evt){pc=25348;return;}
case 25348:cyc+=12;H=193;L=185;
if(cyc>=evt){pc=25351;return;}
case 25351:cyc+=16;wr((H<<8|L),rd((H<<8|L))&251);
if(cyc>=evt){pc=25353;return;}
case 25353:cyc+=12;pc=25409;return;
case 25355:cyc+=8;sub(24);
if(cyc>=evt){pc=25357;return;}
case 25357:cyc+=8;A=sla(A);
if(cyc>=evt){pc=25359;return;}
case 25359:cyc+=4;C=A;
if(cyc>=evt){pc=25360;return;}
case 25360:cyc+=8;B=0;
if(cyc>=evt){pc=25362;return;}
case 25362:cyc+=8;A=0;
if(cyc>=evt){pc=25364;return;}
case 25364:cyc+=16;wr(65306,A);
if(cyc>=evt){pc=25367;return;}
case 25367:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
pc=25368;return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}},
function(){switch(pc){
case 25368:cyc+=8;A=32;
if(cyc>=evt){pc=25370;return;}
case 25370:cyc+=16;wr(65308,A);
if(cyc>=evt){pc=25373;return;}
case 25373:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25374;return;}
case 25374:cyc+=8;xor(255);
if(cyc>=evt){pc=25376;return;}
case 25376:cyc+=4;A=inc(A);
if(cyc>=evt){pc=25377;return;}
case 25377:cyc+=16;wr(65307,A);
if(cyc>=evt){pc=25380;return;}
case 25380:cyc+=4;A=L;
if(cyc>=evt){pc=25381;return;}
case 25381:cyc+=16;wr(49600,A);
if(cyc>=evt){pc=25384;return;}
case 25384:cyc+=4;A=H;
if(cyc>=evt){pc=25385;return;}
case 25385:cyc+=16;wr(49601,A);
if(cyc>=evt){pc=25388;return;}
case 25388:cyc+=12;H=96;L=249;
if(cyc>=evt){pc=25391;return;}
case 25391:cyc+=8;addhl((B<<8|C));
if(cyc>=evt){pc=25392;return;}
case 25392:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25393;return;}
case 25393:cyc+=16;wr(65309,A);
if(cyc>=evt){pc=25396;return;}
case 25396:cyc+=8;A=128;
if(cyc>=evt){pc=25398;return;}
case 25398:cyc+=16;wr(65306,A);
if(cyc>=evt){pc=25401;return;}
case 25401:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25402;return;}
case 25402:cyc+=8;or(192);
if(cyc>=evt){pc=25404;return;}
case 25404:cyc+=16;wr(65310,A);
if(cyc>=evt){pc=25407;return;}
case 25407:cyc+=12;pc=25318;return;
case 25409:cyc+=12;H=193;L=185;
if(cyc>=evt){pc=25412;return;}
case 25412:cyc+=12;fz=(rd((H<<8|L))>>3)&1?0:1;fn=0;fh=1;
if(cyc>=evt){pc=25414;return;}
case 25414:cyc+=8;if(fz){cyc+=4;pc=25486;return;}
if(cyc>=evt){pc=25416;return;}
case 25416:cyc+=16;A=rd(49602);
if(cyc>=evt){pc=25419;return;}
case 25419:cyc+=4;L=A;
if(cyc>=evt){pc=25420;return;}
case 25420:cyc+=16;A=rd(49603);
if(cyc>=evt){pc=25423;return;}
case 25423:cyc+=4;H=A;
if(cyc>=evt){pc=25424;return;}
case 25424:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25425;return;}
case 25425:cyc+=4;C=A;
if(cyc>=evt){pc=25426;return;}
case 25426:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25427;return;}
case 25427:cyc+=4;B=A;
if(cyc>=evt){pc=25428;return;}
case 25428:cyc+=12;D=193;E=187;
if(cyc>=evt){pc=25431;return;}
case 25431:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=25432;return;}
case 25432:cyc+=4;cp(B);
if(cyc>=evt){pc=25433;return;}
case 25433:cyc+=8;if(fc){cyc+=4;pc=25486;return;}
if(cyc>=evt){pc=25435;return;}
case 25435:cyc+=8;if(!fz){cyc+=4;pc=25442;return;}
if(cyc>=evt){pc=25437;return;}
case 25437:cyc+=8;{const t=(D<<8|E)-1;D=(t>>8)&255;E=t&255;}
if(cyc>=evt){pc=25438;return;}
case 25438:cyc+=8;A=rd(D<<8|E);
if(cyc>=evt){pc=25439;return;}
case 25439:cyc+=4;cp(C);
if(cyc>=evt){pc=25440;return;}
case 25440:cyc+=8;if(fc){cyc+=4;pc=25486;return;}
if(cyc>=evt){pc=25442;return;}
case 25442:cyc+=8;A=rd((H<<8|L));L=(L+1)&255;if(!L)H=(H+1)&255;
if(cyc>=evt){pc=25443;return;}
case 25443:cyc+=4;and(A);
if(cyc>=evt){pc=25444;return;}
case 25444:cyc+=8;if(!fz){cyc+=4;pc=25453;return;}
if(cyc>=evt){pc=25446;return;}
case 25446:cyc+=12;H=193;L=185;
if(cyc>=evt){pc=25449;return;}
case 25449:cyc+=16;wr((H<<8|L),rd((H<<8|L))&247);
if(cyc>=evt){pc=25451;return;}
case 25451:cyc+=12;pc=25486;return;
case 25453:cyc+=12;B=242;C=8;
if(cyc>=evt){pc=25456;return;}
case 25456:cyc+=8;A=64;
if(cyc>=evt){pc=25458;return;}
case 25458:cyc+=16;wr(65315,A);
if(cyc>=evt){pc=25461;return;}
case 25461:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=25462;return;}
case 25462:cyc+=8;{const t=(H<<8|L)+1;H=(t>>8)&255;L=t&255;}
if(cyc>=evt){pc=25463;return;}
case 25463:cyc+=4;A=B;
if(cyc>=evt){pc=25464;return;}
case 25464:cyc+=16;wr(65313,A);
if(cyc>=evt){pc=25467;return;}
case 25467:cyc+=4;A=C;
if(cyc>=evt){pc=25468;return;}
case 25468:cyc+=16;wr(65314,A);
if(cyc>=evt){pc=25471;return;}
case 25471:cyc+=8;A=128;
if(cyc>=evt){pc=25473;return;}
case 25473:cyc+=16;wr(65315,A);
if(cyc>=evt){pc=25476;return;}
case 25476:cyc+=4;A=L;
if(cyc>=evt){pc=25477;return;}
case 25477:cyc+=16;wr(49602,A);
if(cyc>=evt){pc=25480;return;}
case 25480:cyc+=4;A=H;
if(cyc>=evt){pc=25481;return;}
case 25481:cyc+=16;wr(49603,A);
if(cyc>=evt){pc=25484;return;}
case 25484:cyc+=12;pc=25416;return;
case 25486:cyc+=16;A=rd(49593);
if(cyc>=evt){pc=25489;return;}
case 25489:cyc+=8;and(15);
if(cyc>=evt){pc=25491;return;}
case 25491:cyc+=8;if(!fz){cyc+=4;pc=25496;return;}
if(cyc>=evt){pc=25493;return;}
case 25493:cyc+=16;wr(49592,A);
if(cyc>=evt){pc=25496;return;}
case 25496:cyc+=16;pc=pop();return;
default:throw new Error("bad pc in chunk "+pc.toString(16));}}
];
const PCT=new Int16Array(0x8000).fill(-1);
{const t=[72,0,256,0,257,0,336,0,337,0,340,0,343,0,345,0,346,0,348,0,351,0,353,0,354,0,356,0,358,0,361,0,362,0,365,0,368,0,370,0,372,0,374,0,376,0,377,0,379,0,381,0,383,0,385,0,388,0,389,0,390,0,391,0,393,0,395,0,396,0,398,0,400,0,402,0,405,0,408,0,410,0,412,0,414,0,415,0,418,0,421,0,424,0,427,0,430,0,433,0,435,0,438,0,441,0,443,0,446,0,449,0,452,0,455,0,456,0,457,0,460,0,463,0,465,0,468,0,469,0,472,0,474,0,477,0,480,0,483,0,486,0,489,0,492,0,495,0,498,0,501,0,503,0,505,0,506,0,509,0,512,0,515,0,518,0,519,0,521,0,522,0,525,0,528,0,531,0,534,0,536,0,539,0,542,0,544,0,546,0,548,0,550,0,551,0,553,0,555,0,557,0,559,0,561,0,562,0,564,0,567,0,570,0,573,0,574,0,576,0,578,0,579,0,581,0,583,0,585,0,586,0,589,0,591,0,594,0,596,0,599,0,601,0,604,0,605,0,607,0,609,0,611,0,613,0,616,0,619,0,622,0,624,0,626,0,629,0,632,0,635,0,638,0,641,0,644,0,647,0,650,0,652,0,655,0,658,0,660,0,662,0,665,0,667,0,669,0,671,0,672,0,675,0,678,0,681,0,684,0,685,0,687,0,688,0,691,0,694,0,697,0,700,0,702,0,705,0,708,0,710,0,713,0,716,0,719,0,722,0,724,0,727,0,730,0,732,0,735,0,737,0,739,0,742,0,744,0,747,0,749,0,751,0,754,0,756,0,758,0,761,0,763,0,765,0,767,0,770,0,772,0,774,0,777,0,779,0,781,0,783,0,786,0,788,0,790,0,793,0,795,0,797,0,799,0,802,0,804,0,806,0,809,0,812,0,815,0,818,0,821,0,824,0,826,0,829,0,830,0,832,0,835,0,837,0,840,0,843,0,845,1,848,1,851,1,854,1,857,1,860,1,862,1,865,1,868,1,870,1,873,1,875,1,878,1,880,1,883,1,885,1,888,1,889,1,892,1,895,1,898,1,901,1,904,1,907,1,910,1,913,1,916,1,919,1,922,1,924,1,926,1,929,1,932,1,935,1,938,1,939,1,941,1,942,1,944,1,945,1,948,1,951,1,953,1,956,1,959,1,962,1,965,1,968,1,971,1,974,1,977,1,980,1,983,1,986,1,988,1,990,1,993,1,994,1,996,1,999,1,1001,1,1002,1,1005,1,1007,1,1009,1,1010,1,1012,1,1014,1,1015,1,1016,1,1017,1,1019,1,1020,1,1023,1,1026,1,1029,1,1031,1,1034,1,1035,1,1037,1,1039,1,1042,1,1044,1,1047,1,1050,1,1053,1,1056,1,1059,1,1060,1,1062,1,1063,1,1066,1,1069,1,1070,1,1073,1,1076,1,1078,1,1081,1,1083,1,1086,1,1088,1,1091,1,1094,1,1097,1,1100,1,1103,1,1106,1,1109,1,1112,1,1115,1,1116,1,1118,1,1119,1,1122,1,1125,1,1128,1,1130,1,1132,1,1135,1,1138,1,1141,1,1144,1,1146,1,1148,1,1150,1,1153,1,1155,1,1158,1,1160,1,1163,1,1166,1,1168,1,1171,1,1173,1,1176,1,1179,1,1182,1,1183,1,1185,1,1188,1,1191,1,1193,1,1196,1,1198,1,1200,1,1202,1,1204,1,1207,1,1209,1,1211,1,1213,1,1216,1,1218,1,1221,1,1223,1,1225,1,1228,1,1230,1,1232,1,1233,1,1236,1,1238,1,1241,1,1243,1,1246,1,1248,1,1250,1,1252,1,1255,1,1257,1,1259,1,1261,1,1264,1,1266,1,1268,1,1270,1,1273,1,1275,1,1277,1,1279,1,1282,1,1284,1,1287,1,1289,1,1291,1,1294,1,1297,1,1299,1,1301,1,1303,1,1306,1,1309,1,1312,1,1315,1,1318,1,1319,1,1322,1,1324,1,1327,1,1329,1,1332,1,1335,1,1338,1,1339,1,1341,1,1344,1,1347,1,1349,1,1352,1,1354,1,1356,1,1359,1,1361,1,1363,1,1365,1,1368,1,1371,1,1374,1,1375,1,1377,1,1380,2,1383,2,1385,2,1388,2,1390,2,1392,2,1393,2,1396,2,1398,2,1401,2,1404,2,1406,2,1408,2,1410,2,1413,2,1416,2,1418,2,1421,2,1423,2,1425,2,1428,2,1430,2,1432,2,1435,2,1438,2,1440,2,1443,2,1444,2,1446,2,1448,2,1451,2,1454,2,1457,2,1459,2,1462,2,1463,2,1465,2,1468,2,1470,2,1473,2,1474,2,1477,2,1480,2,1481,2,1484,2,1487,2,1489,2,1492,2,1494,2,1497,2,1499,2,1502,2,1503,2,1506,2,1509,2,1512,2,1515,2,1518,2,1521,2,1524,2,1527,2,1530,2,1533,2,1536,2,1539,2,1542,2,1545,2,1548,2,1551,2,1554,2,1557,2,1560,2,1562,2,1564,2,1567,2,1570,2,1573,2,1575,2,1578,2,1581,2,1584,2,1587,2,1590,2,1593,2,1596,2,1598,2,1600,2,1602,2,1604,2,1606,2,1608,2,1610,2,1613,2,1615,2,1617,2,1620,2,1623,2,1626,2,1627,2,1630,2,1633,2,1635,2,1637,2,1640,2,1643,2,1646,2,1649,2,1651,2,1654,2,1657,2,1660,2,1661,2,1664,2,1667,2,1669,2,1671,2,1674,2,1677,2,1680,2,1681,2,1684,2,1687,2,1688,2,1690,2,1693,2,1694,2,1696,2,1699,2,1701,2,1704,2,1705,2,1708,2,1711,2,1713,2,1716,2,1719,2,1722,2,1725,2,1726,2,1729,2,1732,2,1734,2,1737,2,1740,2,1743,2,1746,2,1748,2,1750,2,1752,2,1753,2,1755,2,1757,2,1758,2,1760,2,1762,2,1763,2,1765,2,1767,2,1768,2,1770,2,1772,2,1775,2,1778,2,1779,2,1781,2,1783,2,1786,2,1789,2,1790,2,1791,2,1793,2,1794,2,1795,2,1796,2,1798,2,1800,2,1802,2,1804,2,1806,2,1808,2,1809,2,1811,2,1814,2,1816,2,1819,2,1821,2,1824,2,1826,2,1829,2,1832,2,1834,2,1837,2,1840,2,1843,2,1846,2,1847,2,1850,2,1853,2,1855,2,1858,2,1861,2,1864,2,1867,2,1868,2,1869,2,1870,2,1871,2,1872,2,1873,2,1875,2,1878,2,1880,2,1883,2,1885,2,1888,2,1891,2,1894,2,1895,2,1896,2,1897,2,1898,3,1899,3,1900,3,1901,3,1903,3,1905,3,1907,3,1910,3,1911,3,1914,3,1916,3,1918,3,1919,3,1922,3,1925,3,1928,3,1929,3,1932,3,1935,3,1937,3,1939,3,1942,3,1944,3,1947,3,1949,3,1952,3,1955,3,1958,3,1961,3,1964,3,1967,3,1968,3,1971,3,1974,3,1976,3,1978,3,1981,3,1983,3,1984,3,1987,3,1989,3,1992,3,1994,3,1997,3,2000,3,2003,3,2004,3,2007,3,2010,3,2012,3,2015,3,2016,3,2018,3,2020,3,2022,3,2025,3,2028,3,2031,3,2032,3,2035,3,2038,3,2040,3,2042,3,2045,3,2048,3,2051,3,2053,3,2055,3,2057,3,2060,3,2062,3,2065,3,2066,3,2069,3,2070,3,2073,3,2076,3,2077,3,2080,3,2082,3,2084,3,2086,3,2089,3,2092,3,2093,3,2096,3,2097,3,2100,3,2103,3,2106,3,2109,3,2112,3,2115,3,2118,3,2121,3,2124,3,2127,3,2128,3,2131,3,2134,3,2137,3,2138,3,2140,3,2142,3,2144,3,2146,3,2148,3,2150,3,2151,3,2153,3,2155,3,2158,3,2161,3,2164,3,2165,3,2168,3,2171,3,2172,3,2175,3,2178,3,2179,3,2181,3,2184,3,2187,3,2189,3,2192,3,2194,3,2197,3,2199,3,2202,3,2203,3,2205,3,2208,3,2211,3,2213,3,2216,3,2219,3,2222,3,2225,3,2227,3,2230,3,2232,3,2235,3,2238,3,2240,3,2243,3,2245,3,2248,3,2251,3,2254,3,2255,3,2258,3,2261,3,2263,3,2265,3,2268,3,2270,3,2271,3,2274,3,2276,3,2279,3,2282,3,2285,3,2286,3,2289,3,2292,3,2294,3,2296,3,2299,3,2301,3,2302,3,2305,3,2307,3,2310,3,2312,3,2315,3,2317,3,2320,3,2322,3,2325,3,2328,3,2331,3,2334,3,2335,3,2338,3,2340,3,2343,3,2345,3,2347,3,2348,3,2349,3,2352,3,2355,3,2356,3,2358,3,2361,3,2364,3,2366,3,2369,3,2371,3,2374,3,2376,3,2379,3,2380,3,2382,3,2385,3,2388,3,2390,3,2393,3,2396,3,2399,3,2401,3,2404,3,2407,3,2409,3,2411,3,2414,3,2416,3,2419,3,2422,3,2424,4,2427,4,2430,4,2433,4,2434,4,2436,4,2438,4,2441,4,2444,4,2447,4,2448,4,2451,4,2453,4,2455,4,2457,4,2460,4,2462,4,2464,4,2467,4,2468,4,2470,4,2473,4,2475,4,2478,4,2480,4,2483,4,2484,4,2487,4,2489,4,2492,4,2494,4,2497,4,2500,4,2503,4,2504,4,2507,4,2509,4,2512,4,2514,4,2516,4,2518,4,2521,4,2524,4,2525,4,2527,4,2528,4,2531,4,2534,4,2537,4,2538,4,2539,4,2540,4,2543,4,2544,4,2545,4,2547,4,2548,4,2550,4,2552,4,2554,4,2555,4,2556,4,2557,4,2560,4,2562,4,2565,4,2566,4,2567,4,2568,4,2569,4,2570,4,2571,4,2572,4,2573,4,2574,4,2576,4,2577,4,2578,4,2580,4,2581,4,2584,4,2585,4,2586,4,2589,4,2590,4,2592,4,2593,4,2596,4,2599,4,2602,4,2605,4,2607,4,2610,4,2611,4,2612,4,2613,4,2616,4,2617,4,2618,4,2620,4,2622,4,2625,4,2626,4,2628,4,2631,4,2632,4,2634,4,2637,4,2640,4,2642,4,2645,4,2646,4,2648,4,2650,4,2653,4,2656,4,2658,4,2661,4,2664,4,2666,4,2668,4,2671,4,2673,4,2675,4,2678,4,2680,4,2683,4,2685,4,2688,4,2690,4,2693,4,2695,4,2697,4,2698,4,2699,4,2702,4,2705,4,2707,4,2710,4,2713,4,2715,4,2718,4,2721,4,2723,4,2725,4,2728,4,2730,4,2732,4,2735,4,2737,4,2740,4,2743,4,2746,4,2747,4,2750,4,2753,4,2756,4,2758,4,2761,4,2763,4,2766,4,2769,4,2771,4,2774,4,2777,4,2780,4,2783,4,2786,4,2788,4,2791,4,2794,4,2796,4,2798,4,2801,4,2803,4,2805,4,2808,4,2809,4,2811,4,2813,4,2816,4,2818,4,2821,4,2823,4,2826,4,2828,4,2830,4,2833,4,2835,4,2838,4,2841,4,2843,4,2845,4,2848,4,2850,4,2853,4,2854,4,2856,4,2859,4,2861,4,2864,4,2866,4,2869,4,2871,4,2874,4,2877,4,2880,4,2883,4,2884,4,2887,4,2889,4,2891,4,2892,4,2895,4,2898,4,2901,4,2904,4,2907,4,2909,4,2911,4,2912,5,2915,5,2917,5,2920,5,2922,5,2924,5,2926,5,2927,5,2930,5,2932,5,2935,5,2937,5,2940,5,2943,5,2946,5,2949,5,2952,5,2953,5,2955,5,2957,5,2960,5,2963,5,2965,5,2968,5,2970,5,2972,5,2975,5,2976,5,2978,5,2979,5,2980,5,2983,5,2986,5,2988,5,2990,5,2992,5,2994,5,2995,5,2998,5,3000,5,3003,5,3006,5,3009,5,3011,5,3014,5,3016,5,3019,5,3022,5,3025,5,3027,5,3029,5,3032,5,3034,5,3037,5,3039,5,3041,5,3044,5,3046,5,3048,5,3051,5,3052,5,3054,5,3056,5,3059,5,3061,5,3064,5,3066,5,3069,5,3071,5,3073,5,3076,5,3077,5,3079,5,3080,5,3081,5,3084,5,3085,5,3088,5,3091,5,3094,5,3096,5,3098,5,3100,5,3102,5,3105,5,3106,5,3109,5,3110,5,3113,5,3115,5,3118,5,3120,5,3123,5,3126,5,3129,5,3131,5,3134,5,3136,5,3139,5,3142,5,3144,5,3146,5,3148,5,3151,5,3153,5,3156,5,3159,5,3161,5,3164,5,3167,5,3168,5,3170,5,3172,5,3174,5,3175,5,3178,5,3181,5,3184,5,3186,5,3189,5,3192,5,3195,5,3197,5,3199,5,3201,5,3204,5,3205,5,3208,5,3211,5,3213,5,3215,5,3218,5,3221,5,3224,5,3226,5,3229,5,3232,5,3235,5,3238,5,3241,5,3243,5,3245,5,3247,5,3249,5,3252,5,3255,5,3257,5,3260,5,3262,5,3264,5,3266,5,3269,5,3271,5,3274,5,3277,5,3279,5,3282,5,3284,5,3287,5,3290,5,3292,5,3295,5,3298,5,3300,5,3302,5,3303,5,3306,5,3308,5,3311,5,3313,5,3316,5,3319,5,3321,5,3324,5,3327,5,3330,5,3333,5,3335,5,3338,5,3341,5,3343,5,3346,5,3349,5,3351,5,3354,5,3357,5,3360,5,3363,5,3365,5,3367,5,3369,5,3371,5,3373,5,3375,5,3378,5,3380,5,3383,5,3386,5,3389,5,3391,5,3394,5,3396,5,3398,5,3401,5,3404,5,3405,5,3408,5,3409,5,3412,5,3415,5,3417,5,3420,5,3422,5,3424,5,3427,5,3429,5,3431,5,3434,5,3436,5,3438,5,3440,6,3443,6,3445,6,3448,6,3450,6,3453,6,3454,6,3456,6,3459,6,3461,6,3464,6,3467,6,3469,6,3472,6,3474,6,3477,6,3479,6,3482,6,3484,6,3487,6,3490,6,3493,6,3496,6,3498,6,3501,6,3504,6,3506,6,3508,6,3511,6,3513,6,3515,6,3517,6,3520,6,3521,6,3523,6,3525,6,3527,6,3530,6,3532,6,3535,6,3536,6,3538,6,3541,6,3543,6,3545,6,3548,6,3551,6,3553,6,3555,6,3557,6,3559,6,3560,6,3562,6,3565,6,3567,6,3569,6,3571,6,3573,6,3576,6,3578,6,3581,6,3583,6,3586,6,3588,6,3591,6,3593,6,3595,6,3597,6,3599,6,3602,6,3604,6,3606,6,3609,6,3611,6,3613,6,3615,6,3618,6,3619,6,3621,6,3623,6,3625,6,3628,6,3630,6,3632,6,3636,6,3638,6,3641,6,3642,6,3644,6,3647,6,3649,6,3651,6,3654,6,3657,6,3659,6,3661,6,3663,6,3665,6,3666,6,3668,6,3671,6,3673,6,3675,6,3677,6,3679,6,3682,6,3684,6,3687,6,3689,6,3691,6,3694,6,3696,6,3698,6,3701,6,3703,6,3704,6,3707,6,3709,6,3712,6,3715,6,3718,6,3720,6,3723,6,3726,6,3728,6,3731,6,3734,6,3737,6,3739,6,3741,6,3744,6,3747,6,3750,6,3753,6,3756,6,3759,6,3762,6,3765,6,3768,6,3771,6,3774,6,3777,6,3780,6,3781,6,3783,6,3786,6,3789,6,3791,6,3793,6,3794,6,3797,6,3800,6,3801,6,3803,6,3806,6,3808,6,3811,6,3813,6,3814,6,3817,6,3819,6,3821,6,3823,6,3825,6,3826,6,3828,6,3829,6,3832,6,3834,6,3836,6,3838,6,3840,6,3843,6,3846,6,3849,6,3851,6,3854,6,3857,6,3859,6,3862,6,3864,6,3867,6,3870,6,3873,6,3876,6,3878,6,3881,6,3884,6,3886,6,3889,6,3891,6,3894,6,3897,6,3900,6,3903,6,3906,6,3909,6,3911,6,3913,6,3916,6,3919,6,3921,6,3924,6,3927,6,3930,6,3933,6,3935,6,3938,6,3940,6,3943,6,3945,6,3948,6,3951,6,3953,6,3955,6,3958,6,3960,6,3963,6,3966,6,3969,6,3971,7,3973,7,3976,7,3979,7,3982,7,3985,7,3987,7,3990,7,3993,7,3995,7,3997,7,4000,7,4002,7,4005,7,4007,7,4010,7,4013,7,4015,7,4017,7,4020,7,4023,7,4026,7,4028,7,4031,7,4034,7,4036,7,4039,7,4042,7,4044,7,4047,7,4049,7,4052,7,4055,7,4057,7,4060,7,4063,7,4066,7,4069,7,4071,7,4074,7,4077,7,4079,7,4081,7,4084,7,4086,7,4089,7,4091,7,4094,7,4097,7,4099,7,4102,7,4105,7,4107,7,4109,7,4112,7,4114,7,4116,7,4118,7,4121,7,4123,7,4126,7,4127,7,4130,7,4133,7,4136,7,4138,7,4141,7,4143,7,4146,7,4149,7,4151,7,4154,7,4157,7,4160,7,4163,7,4166,7,4169,7,4172,7,4175,7,4178,7,4181,7,4184,7,4186,7,4189,7,4191,7,4193,7,4195,7,4198,7,4201,7,4204,7,4206,7,4209,7,4212,7,4214,7,4217,7,4219,7,4222,7,4225,7,4227,7,4230,7,4232,7,4235,7,4238,7,4240,7,4243,7,4245,7,4248,7,4250,7,4253,7,4256,7,4258,7,4261,7,4263,7,4265,7,4268,7,4270,7,4272,7,4273,7,4276,7,4277,7,4278,7,4279,7,4281,7,4282,7,4285,7,4287,7,4290,7,4293,7,4295,7,4298,7,4301,7,4304,7,4307,7,4310,7,4311,7,4313,7,4316,7,4317,7,4320,7,4321,7,4322,7,4323,7,4324,7,4325,7,4328,7,4329,7,4331,7,4334,7,4337,7,4338,7,4340,7,4342,7,4344,7,4346,7,4348,7,4350,7,4352,7,4354,7,4356,7,4358,7,4360,7,4363,7,4366,7,4369,7,4372,7,4374,7,4375,7,4377,7,4378,7,4380,7,4382,7,4384,7,4385,7,4386,7,4387,7,4388,7,4389,7,4390,7,4391,7,4392,7,4393,7,4394,7,4395,7,4396,7,4397,7,4398,7,4399,7,4400,7,4401,7,4402,7,4403,7,4404,7,4405,7,4406,7,4407,7,4408,7,4409,7,4411,7,4413,7,4414,7,4416,7,4417,7,4419,7,4421,7,4423,7,4424,7,4425,7,4426,7,4427,7,4428,7,4429,7,4430,7,4431,7,4432,7,4433,7,4434,7,4435,7,4436,7,4437,7,4438,7,4439,8,4440,8,4441,8,4442,8,4443,8,4444,8,4445,8,4446,8,4447,8,4449,8,4451,8,4453,8,4455,8,4456,8,4458,8,4459,8,4461,8,4463,8,4465,8,4466,8,4467,8,4468,8,4469,8,4470,8,4471,8,4472,8,4473,8,4474,8,4475,8,4476,8,4477,8,4478,8,4479,8,4480,8,4481,8,4482,8,4483,8,4484,8,4485,8,4486,8,4487,8,4488,8,4489,8,4491,8,4492,8,4493,8,4495,8,4497,8,4498,8,4500,8,4501,8,4504,8,4506,8,4508,8,4510,8,4511,8,4512,8,4513,8,4514,8,4515,8,4516,8,4517,8,4518,8,4519,8,4520,8,4521,8,4522,8,4523,8,4524,8,4525,8,4526,8,4527,8,4528,8,4529,8,4530,8,4531,8,4532,8,4533,8,4534,8,4535,8,4536,8,4537,8,4538,8,4539,8,4540,8,4541,8,4542,8,4543,8,4544,8,4545,8,4546,8,4547,8,4548,8,4549,8,4550,8,4551,8,4552,8,4553,8,4554,8,4555,8,4556,8,4557,8,4558,8,4559,8,4561,8,4562,8,4565,8,4568,8,4569,8,4572,8,4575,8,4576,8,4578,8,4580,8,4583,8,4586,8,4588,8,4591,8,4594,8,4595,8,4597,8,4598,8,4599,8,4602,8,4603,8,4606,8,4608,8,4610,8,4612,8,4615,8,4618,8,4619,8,4622,8,4625,8,4626,8,4628,8,4631,8,4632,8,4634,8,4636,8,4639,8,4641,8,4642,8,4643,8,4645,8,4646,8,4647,8,4649,8,4650,8,4651,8,4652,8,4653,8,4654,8,4655,8,4656,8,4657,8,4658,8,4659,8,4660,8,4662,8,4665,8,4667,8,4670,8,4671,8,4672,8,4673,8,4674,8,4675,8,4676,8,4677,8,4679,8,4682,8,4684,8,4686,8,4689,8,4690,8,4692,8,4694,8,4696,8,4699,8,4702,8,4703,8,4705,8,4707,8,4710,8,4711,8,4714,8,4717,8,4718,8,4720,8,4722,8,4725,8,4726,8,4729,8,4730,8,4733,8,4734,8,4735,8,4736,8,4737,8,4738,8,4739,8,4741,8,4743,8,4745,8,4747,8,4748,8,4750,8,4752,8,4753,8,4755,8,4757,8,4759,8,4761,8,4763,8,4765,8,4767,8,4769,8,4770,8,4772,8,4773,9,4774,9,4776,9,4777,9,4778,9,4780,9,4781,9,4783,9,4785,9,4787,9,4788,9,4790,9,4792,9,4795,9,4796,9,4797,9,4798,9,4799,9,4801,9,4824,9,4826,9,4828,9,4830,9,4832,9,4834,9,4836,9,4838,9,4840,9,4842,9,4844,9,4846,9,4848,9,4849,9,4850,9,4851,9,4852,9,4853,9,4854,9,4855,9,4857,9,4858,9,4860,9,4862,9,4864,9,4865,9,4866,9,4868,9,4870,9,4872,9,4873,9,4874,9,4875,9,4876,9,4877,9,4879,9,4880,9,4882,9,4883,9,4886,9,4887,9,4888,9,4891,9,4892,9,4894,9,4897,9,4900,9,4901,9,4903,9,4904,9,4907,9,4908,9,4909,9,4912,9,4913,9,4915,9,4918,9,4921,9,4922,9,4923,9,4924,9,4926,9,4928,9,4930,9,4931,9,4932,9,4934,9,4936,9,4938,9,4939,9,4940,9,4941,9,4943,9,4944,9,4947,9,4948,9,4949,9,4950,9,4952,9,4953,9,4956,9,4958,9,4960,9,4961,9,4962,9,4963,9,4964,9,4966,9,4967,9,4968,9,4970,9,4971,9,4973,9,4975,9,4976,9,4979,9,4980,9,4981,9,4982,9,4983,9,4985,9,4986,9,4989,9,4990,9,4991,9,4994,9,4997,9,4999,9,5001,9,5003,9,5006,9,5009,9,5012,9,5014,9,5017,9,5020,9,5023,9,5025,9,5028,9,5031,9,5034,9,5036,9,5039,9,5042,9,5045,9,5048,9,5050,9,5052,9,5055,9,5056,9,5057,9,5059,9,5060,9,5061,9,5063,9,5065,9,5067,9,5069,9,5070,9,5073,9,5076,9,5079,9,5081,9,5083,9,5086,9,5087,9,5088,9,5090,9,5091,9,5092,9,5094,9,5096,9,5099,9,5101,9,5102,9,5105,9,5108,9,5111,9,5112,9,5115,9,5118,9,5121,9,5124,9,5127,9,5130,9,5133,9,5134,9,5137,9,5140,9,5143,9,5146,9,5149,9,5152,9,5155,9,5158,9,5161,9,5164,9,5166,9,5168,9,5171,9,5172,9,5173,9,5175,9,5176,9,5177,9,5179,9,5181,9,5183,9,5185,9,5186,9,5189,9,5192,9,5195,9,5198,9,5200,9,5202,9,5205,9,5206,9,5207,9,5209,9,5210,9,5211,10,5213,10,5215,10,5218,10,5220,10,5221,10,5224,10,5227,10,5230,10,5231,10,5234,10,5237,10,5240,10,5243,10,5246,10,5247,10,5249,10,5252,10,5253,10,5256,10,5257,10,5259,10,5261,10,5263,10,5266,10,5268,10,5271,10,5272,10,5275,10,5276,10,5278,10,5279,10,5280,10,5282,10,5284,10,5286,10,5287,10,5289,10,5291,10,5293,10,5294,10,5297,10,5298,10,5299,10,5301,10,5302,10,5303,10,5304,10,5306,10,5308,10,5310,10,5312,10,5314,10,5316,10,5319,10,5321,10,5323,10,5325,10,5327,10,5330,10,5332,10,5334,10,5335,10,5337,10,5339,10,5341,10,5342,10,5345,10,5346,10,5348,10,5349,10,5350,10,5353,10,5356,10,5358,10,5360,10,5361,10,5362,10,5363,10,5364,10,5366,10,5368,10,5370,10,5371,10,5372,10,5375,10,5377,10,5378,10,5381,10,5383,10,5384,10,5387,10,5390,10,5392,10,5394,10,5396,10,5397,10,5398,10,5399,10,5400,10,5401,10,5403,10,5405,10,5407,10,5408,10,5409,10,5410,10,5413,10,5415,10,5416,10,5419,10,5421,10,5422,10,5425,10,5428,10,5429,10,5430,10,5431,10,5432,10,5434,10,5436,10,5438,10,5441,10,5442,10,5443,10,5444,10,5445,10,5447,10,5448,10,5449,10,5451,10,5453,10,5455,10,5457,10,5459,10,5461,10,5463,10,5465,10,5467,10,5469,10,5471,10,5474,10,5477,10,5478,10,5479,10,5481,10,5482,10,5483,10,5486,10,5489,10,5490,10,5491,10,5492,10,5493,10,5495,10,5496,10,5497,10,5499,10,5502,10,5503,10,5505,10,5508,10,5510,10,5512,10,5515,10,5517,10,5519,10,5522,10,5524,10,5527,10,5529,10,5532,10,5534,10,5536,10,5537,10,5538,10,5540,10,5542,10,5545,10,5546,10,5548,10,5551,10,5553,10,5555,10,5558,10,5560,10,5563,10,5565,10,5567,10,5569,10,5571,10,5572,10,5574,10,5575,10,5576,10,5578,10,5580,10,5582,10,5584,10,5586,10,5588,10,5590,10,5591,10,5593,10,5594,10,5595,10,5597,10,5599,10,5601,10,5603,10,5605,10,5607,10,5609,10,5611,10,5613,10,5615,10,5617,10,5618,10,5620,10,5621,10,5622,11,5624,11,5626,11,5628,11,5630,11,5632,11,5634,11,5636,11,5637,11,5639,11,5640,11,5641,11,5643,11,5645,11,5647,11,5649,11,5651,11,5653,11,5655,11,5657,11,5659,11,5660,11,5662,11,5663,11,5664,11,5666,11,5668,11,5670,11,5672,11,5674,11,5676,11,5678,11,5679,11,5681,11,5682,11,5683,11,5685,11,5687,11,5689,11,5691,11,5693,11,5694,11,5697,11,5700,11,5703,11,5704,11,5707,11,5708,11,5709,11,5710,11,5711,11,5712,11,5714,11,5717,11,5720,11,5723,11,5725,11,5727,11,5729,11,5731,11,5733,11,5734,11,5735,11,5736,11,5737,11,5738,11,5740,11,5742,11,5744,11,5745,11,5746,11,5747,11,5749,11,5750,11,5751,11,5754,11,5755,11,5758,11,5760,11,5763,11,5764,11,5765,11,5766,11,5767,11,5768,11,5769,11,5771,11,5772,11,5773,11,5775,11,5776,11,5778,11,5780,11,5781,11,5783,11,5785,11,5787,11,5788,11,5789,11,5790,11,5791,11,5792,11,5794,11,5796,11,5798,11,5799,11,5800,11,5801,11,5803,11,5804,11,5805,11,5806,11,5807,11,5809,11,5810,11,5812,11,5814,11,5816,11,5817,11,5818,11,5819,11,5820,11,5821,11,5823,11,5825,11,5827,11,5828,11,5829,11,5830,11,5832,11,5833,11,5834,11,5837,11,5838,11,5841,11,5843,11,5846,11,5847,11,5848,11,5849,11,5850,11,5851,11,5854,11,5857,11,5858,11,5859,11,5860,11,5861,11,5863,11,5866,11,5869,11,5870,11,5871,11,5872,11,5873,11,5876,11,5877,11,5879,11,5880,11,5881,11,5882,11,5884,11,5886,11,5888,11,5889,11,5891,11,5893,11,5896,11,5897,11,5898,11,5900,11,5901,11,5902,11,5904,11,5906,11,5908,11,5911,11,5912,11,5913,11,5914,11,5915,11,5916,11,5919,11,5922,11,5925,11,5926,11,5927,11,5930,11,5933,11,5934,11,5935,11,5938,11,5939,11,5940,11,5943,11,5944,11,5947,11,5948,11,5951,11,5954,11,5956,11,5957,11,5958,11,5961,11,5964,11,5965,11,5968,11,5970,11,5972,11,5974,11,5976,11,5978,11,5981,11,5983,11,5985,11,5986,11,5989,11,5991,11,5994,11,5995,11,5997,12,6000,12,6003,12,6004,12,6006,12,6009,12,6010,12,6011,12,6013,12,6015,12,6017,12,6020,12,6022,12,6024,12,6026,12,6029,12,6032,12,6033,12,6034,12,6036,12,6038,12,6040,12,6043,12,6045,12,6048,12,6051,12,6052,12,6055,12,6057,12,6059,12,6062,12,6063,12,6065,12,6068,12,6069,12,6072,12,6075,12,6076,12,6079,12,6080,12,6083,12,6086,12,6089,12,6091,12,6093,12,6096,12,6097,12,6098,12,6101,12,6104,12,6105,12,6106,12,6109,12,6112,12,6113,12,6114,12,6117,12,6119,12,6121,12,6124,12,6125,12,6126,12,6129,12,6130,12,6133,12,6134,12,6137,12,6140,12,6142,12,6144,12,6147,12,6148,12,6149,12,6150,12,6151,12,6152,12,6155,12,6158,12,6159,12,6160,12,6163,12,6164,12,6165,12,6167,12,6169,12,6171,12,6174,12,6175,12,6176,12,6178,12,6180,12,6182,12,6185,12,6186,12,6189,12,6190,12,6193,12,6194,12,6196,12,6199,12,6202,12,6205,12,6207,12,6209,12,6212,12,6213,12,6214,12,6217,12,6218,12,6221,12,6224,12,6225,12,6226,12,6229,12,6230,12,6233,12,6236,12,6237,12,6240,12,6241,12,6244,12,6247,12,6250,12,6253,12,6255,12,6258,12,6261,12,6262,12,6265,12,6266,12,6267,12,6268,12,6270,12,6273,12,6276,12,6277,12,6279,12,6280,12,6283,12,6284,12,6285,12,6286,12,6289,12,6290,12,6292,12,6293,12,6296,12,6297,12,6298,12,6299,12,6302,12,6303,12,6304,12,6307,12,6309,12,6310,12,6311,12,6313,12,6314,12,6317,12,6318,12,6320,12,6322,12,6323,12,6325,12,6326,12,6329,12,6330,12,6332,12,6333,12,6336,12,6337,12,6340,12,6342,12,6345,12,6346,12,6348,12,6350,12,6351,12,6352,12,6353,12,6354,12,6355,12,6357,12,6360,12,6361,12,6362,12,6365,12,6368,12,6369,12,6372,12,6373,12,6374,12,6377,12,6380,12,6383,12,6386,12,6389,12,6392,12,6393,12,6394,12,6395,12,6396,12,6398,12,6401,12,6404,12,6405,12,6407,12,6408,12,6411,12,6412,12,6413,12,6414,12,6417,12,6419,12,6420,12,6421,12,6424,12,6425,12,6426,12,6427,13,6430,13,6431,13,6432,13,6435,13,6437,13,6438,13,6439,13,6441,13,6442,13,6445,13,6446,13,6448,13,6450,13,6451,13,6453,13,6454,13,6457,13,6458,13,6460,13,6463,13,6466,13,6467,13,6470,13,6473,13,6475,13,6476,13,6479,13,6480,13,6483,13,6485,13,6487,13,6488,13,6490,13,6492,13,6494,13,6496,13,6499,13,6501,13,6502,13,6503,13,6504,13,6505,13,6507,13,6510,13,6512,13,6514,13,6515,13,6517,13,6518,13,6519,13,6522,13,6524,13,6526,13,6528,13,6529,13,6531,13,6532,13,6534,13,6537,13,6539,13,6542,13,6543,13,6544,13,6546,13,6548,13,6550,13,6552,13,6555,13,6558,13,6559,13,6560,13,6562,13,6564,13,6566,13,6569,13,6571,13,6574,13,6577,13,6578,13,6581,13,6582,13,6584,13,6587,13,6588,13,6590,13,6593,13,6594,13,6597,13,6600,13,6601,13,6604,13,6605,13,6608,13,6611,13,6614,13,6616,13,6618,13,6621,13,6623,13,6625,13,6628,13,6629,13,6631,13,6634,13,6635,13,6636,13,6639,13,6642,13,6643,13,6644,13,6647,13,6650,13,6651,13,6652,13,6655,13,6657,13,6659,13,6662,13,6663,13,6664,13,6667,13,6668,13,6671,13,6672,13,6675,13,6678,13,6680,13,6682,13,6685,13,6687,13,6689,13,6692,13,6693,13,6695,13,6698,13,6699,13,6700,13,6701,13,6702,13,6703,13,6706,13,6709,13,6710,13,6711,13,6714,13,6715,13,6716,13,6718,13,6720,13,6722,13,6725,13,6726,13,6727,13,6729,13,6731,13,6733,13,6736,13,6737,13,6740,13,6741,13,6744,13,6745,13,6747,13,6750,13,6753,13,6756,13,6758,13,6760,13,6763,13,6765,13,6767,13,6770,13,6771,13,6773,13,6776,13,6777,13,6778,13,6781,13,6782,13,6785,13,6788,13,6789,13,6790,13,6793,13,6794,13,6797,13,6800,13,6801,13,6804,13,6805,13,6808,13,6811,13,6814,13,6817,13,6819,13,6822,13,6825,13,6826,13,6829,13,6830,13,6831,13,6832,13,6834,13,6837,13,6840,13,6841,13,6843,13,6844,13,6847,13,6848,13,6849,13,6850,13,6853,13,6854,13,6856,13,6857,13,6860,13,6861,13,6862,13,6863,14,6866,14,6867,14,6868,14,6871,14,6874,14,6875,14,6876,14,6878,14,6879,14,6882,14,6883,14,6885,14,6887,14,6888,14,6890,14,6891,14,6894,14,6895,14,6897,14,6898,14,6901,14,6902,14,6905,14,6907,14,6910,14,6911,14,6913,14,6915,14,6916,14,6917,14,6918,14,6919,14,6920,14,6922,14,6925,14,6926,14,6927,14,6930,14,6933,14,6934,14,6937,14,6938,14,6939,14,6942,14,6945,14,6948,14,6951,14,6954,14,6957,14,6958,14,6959,14,6960,14,6961,14,6963,14,6966,14,6969,14,6970,14,6972,14,6973,14,6976,14,6977,14,6978,14,6979,14,6982,14,6984,14,6985,14,6986,14,6989,14,6990,14,6991,14,6992,14,6995,14,6996,14,6997,14,7000,14,7003,14,7005,14,7006,14,7007,14,7009,14,7010,14,7013,14,7014,14,7016,14,7018,14,7019,14,7021,14,7022,14,7025,14,7026,14,7028,14,7031,14,7032,14,7033,14,7034,14,7035,14,7036,14,7039,14,7040,14,7043,14,7044,14,7047,14,7050,14,7052,14,7053,14,7055,14,7057,14,7059,14,7061,14,7063,14,7065,14,7067,14,7069,14,7071,14,7073,14,7074,14,7075,14,7077,14,7078,14,7079,14,7080,14,7081,14,7082,14,7083,14,7084,14,7085,14,7086,14,7087,14,7088,14,7089,14,7090,14,7091,14,7092,14,7093,14,7094,14,7095,14,7096,14,7097,14,7098,14,7099,14,7100,14,7101,14,7102,14,7103,14,7104,14,7105,14,7106,14,7107,14,7108,14,7109,14,7110,14,7111,14,7112,14,7113,14,7114,14,7115,14,7116,14,7117,14,7118,14,7119,14,7120,14,7121,14,7122,14,7123,14,7124,14,7125,14,7126,14,7127,14,7128,14,7129,14,7130,14,7131,14,7132,14,7133,14,7134,14,7135,14,7136,14,7139,14,7140,14,7143,14,7144,14,7147,14,7150,14,7152,14,7153,14,7155,14,7157,14,7159,14,7161,14,7163,14,7165,14,7167,14,7169,14,7171,14,7173,14,7174,14,7175,14,7177,14,7178,14,7179,14,7180,14,7181,14,7182,14,7183,14,7184,14,7185,14,7186,14,7187,14,7188,14,7189,14,7190,14,7191,14,7192,14,7193,14,7194,14,7195,14,7196,14,7197,14,7198,14,7199,15,7200,15,7201,15,7202,15,7203,15,7204,15,7205,15,7206,15,7207,15,7208,15,7209,15,7210,15,7211,15,7212,15,7213,15,7214,15,7215,15,7216,15,7217,15,7218,15,7219,15,7220,15,7221,15,7222,15,7223,15,7224,15,7225,15,7226,15,7227,15,7228,15,7229,15,7230,15,7233,15,7236,15,7239,15,7241,15,7244,15,7247,15,7250,15,7253,15,7256,15,7259,15,7262,15,7265,15,7268,15,7271,15,7272,15,7273,15,7274,15,7275,15,7277,15,7279,15,7281,15,7283,15,7285,15,7288,15,7289,15,7292,15,7294,15,7296,15,7298,15,7301,15,7303,15,7305,15,7308,15,7310,15,7312,15,7314,15,7317,15,7320,15,7322,15,7324,15,7327,15,7329,15,7331,15,7334,15,7337,15,7340,15,7342,15,7343,15,7344,15,7346,15,7347,15,7348,15,7349,15,7350,15,7351,15,7352,15,7353,15,7355,15,7358,15,7361,15,7363,15,7366,15,7369,15,7372,15,7374,15,7375,15,7376,15,7378,15,7379,15,7380,15,7381,15,7382,15,7383,15,7384,15,7385,15,7387,15,7390,15,7393,15,7394,15,7397,15,7398,15,7399,15,7401,15,7403,15,7405,15,7407,15,7410,15,7411,15,7413,15,7416,15,7419,15,7422,15,7425,15,7428,15,7429,15,7432,15,7433,15,7434,15,7435,15,7437,15,7439,15,7441,15,7443,15,7446,15,7447,15,7449,15,7452,15,7455,15,7458,15,7461,15,7464,15,7465,15,7468,15,7469,15,7470,15,7472,15,7474,15,7476,15,7478,15,7479,15,7481,15,7482,15,7484,15,7486,15,7488,15,7490,15,7491,15,7492,15,7494,15,7496,15,7497,15,7499,15,7501,15,7503,15,7505,15,7506,15,7508,15,7509,15,7511,15,7513,15,7515,15,7517,15,7518,15,7519,15,7521,15,7523,15,7524,15,7526,15,7529,15,7530,15,7531,15,7532,15,7534,15,7535,15,7536,15,7537,15,7538,15,7539,15,7540,15,7541,15,7543,15,7544,15,7545,15,7547,15,7548,15,7549,15,7551,15,7554,15,7555,15,7556,15,7557,15,7558,15,7559,15,7560,15,7561,15,7563,15,7566,15,7567,15,7568,15,7570,15,7571,15,7572,15,7573,15,7574,15,7575,15,7577,15,7580,15,7582,15,7584,16,7585,16,7587,16,7589,16,7590,16,7592,16,7593,16,7594,16,7596,16,7597,16,7598,16,7599,16,7601,16,7602,16,7603,16,7604,16,7606,16,7618,16,7621,16,7623,16,7625,16,7627,16,7629,16,7631,16,7633,16,7635,16,7637,16,7639,16,7640,16,7641,16,7643,16,7646,16,7648,16,7651,16,7652,16,7653,16,7656,16,7658,16,7660,16,7662,16,7664,16,7667,16,7668,16,7669,16,7671,16,7672,16,7674,16,7677,16,7678,16,7680,16,7682,16,7683,16,7685,16,7687,16,7688,16,7690,16,7691,16,7694,16,7695,16,7696,16,7697,16,7699,16,7700,16,7702,16,7704,16,7706,16,7709,16,7710,16,7711,16,7712,16,7713,16,7715,16,7717,16,7719,16,7720,16,7721,16,7722,16,7723,16,7725,16,7728,16,7731,16,7733,16,7735,16,7738,16,7741,16,7744,16,7747,16,7750,16,7753,16,7756,16,7759,16,7762,16,7764,16,7767,16,7770,16,7773,16,7776,16,7779,16,7782,16,7785,16,7788,16,7790,16,7792,16,7793,16,7796,16,7799,16,7802,16,7805,16,7806,16,7808,16,7809,16,7812,16,7815,16,7818,16,7821,16,7823,16,7826,16,7827,16,7829,16,7831,16,7834,16,7837,16,7838,16,7841,16,7843,16,7844,16,7845,16,7847,16,7848,16,7849,16,7850,16,7851,16,7852,16,7855,16,7858,16,7860,16,7863,16,7864,16,7865,16,7866,16,7868,16,7870,16,7872,16,7873,16,7874,16,7876,16,7878,16,7880,16,7881,16,7882,16,7884,16,7885,16,7888,16,7889,16,7890,16,7891,16,7893,16,7894,16,7897,16,7900,16,7903,16,7904,16,7905,16,7906,16,7907,16,7909,16,7911,16,7912,16,7915,16,7917,16,7918,16,7919,16,7921,16,7923,16,7925,16,7926,16,7927,16,7928,16,7930,16,7932,16,7934,16,7935,16,7936,16,7937,16,7939,16,7940,16,7942,16,7943,16,7944,16,7945,16,7946,16,7947,16,7950,16,7951,16,7952,16,7953,16,7954,16,7956,16,7959,16,7960,16,7961,16,7962,16,7964,16,7965,16,7966,16,7967,16,7968,16,7970,16,7971,16,7972,16,7973,16,7974,16,7976,16,7977,16,7978,16,7979,16,7981,16,7982,16,7983,16,7984,16,7985,17,7987,17,7988,17,7989,17,7990,17,7991,17,7992,17,7993,17,7994,17,7997,17,7998,17,7999,17,8002,17,8003,17,8006,17,8009,17,8010,17,8013,17,8014,17,8015,17,8016,17,8018,17,8019,17,8020,17,8022,17,8025,17,8028,17,8029,17,8030,17,8031,17,8032,17,8034,17,8037,17,8038,17,8040,17,8041,17,8044,17,8046,17,8048,17,8049,17,8050,17,8053,17,8054,17,8056,17,8059,17,8060,17,8062,17,8063,17,8064,17,8067,17,8068,17,8069,17,8072,17,8075,17,8077,17,8079,17,8080,17,8081,17,8084,17,8086,17,8088,17,8090,17,8092,17,8094,17,8097,17,8099,17,8100,17,8101,17,8102,17,8104,17,8105,17,8108,17,8110,17,8113,17,8114,17,8116,17,8118,17,8119,17,8120,17,8123,17,8124,17,8127,17,8128,17,8129,17,8130,17,8131,17,8132,17,8133,17,8134,17,8136,17,8137,17,8139,17,8140,17,8141,17,8143,17,8145,17,8146,17,8149,17,8152,17,8153,17,8155,17,8158,17,8159,17,8160,17,8161,17,8162,17,8163,17,8164,17,8165,17,8166,17,8167,17,8168,17,8171,17,8172,17,8173,17,8174,17,8177,17,8178,17,8179,17,8181,17,8182,17,8183,17,8186,17,8187,17,8188,17,8189,17,8192,17,8194,17,8197,17,8198,17,8199,17,8202,17,8203,17,8204,17,8205,17,8207,17,8209,17,8210,17,8211,17,8212,17,8213,17,8214,17,8215,17,8216,17,8219,17,8220,17,8221,17,8223,17,8224,17,8225,17,8227,17,8229,17,8231,17,8233,17,8235,17,8237,17,8238,17,8239,17,8241,17,8242,17,8243,17,8245,17,8246,17,8248,17,8250,17,8252,17,8253,17,8254,17,8256,17,8257,17,8258,17,8260,17,8261,17,8262,17,8263,17,8264,17,8266,17,8267,17,8268,17,8270,17,8271,17,8272,17,8274,17,8276,17,8277,17,8280,17,8283,17,8286,17,8287,17,8290,17,8292,17,8294,17,8296,17,8299,17,8301,17,8303,17,8304,17,8307,17,8310,17,8312,17,8315,17,8318,17,8320,17,8322,17,8324,17,8326,17,8328,17,8331,17,8334,17,8337,17,8340,17,8343,17,8345,17,8348,17,8351,17,8354,17,8356,17,8358,17,8361,17,8364,17,8367,18,8370,18,8373,18,8376,18,8378,18,8380,18,8383,18,8386,18,8389,18,8392,18,8394,18,8397,18,8400,18,8403,18,8406,18,8408,18,8411,18,8412,18,8415,18,8418,18,8421,18,8424,18,8427,18,8430,18,8433,18,8436,18,8439,18,8442,18,8445,18,8448,18,8451,18,8454,18,8457,18,8460,18,8462,18,8463,18,8464,18,8465,18,8467,18,8469,18,8472,18,8474,18,8477,18,8480,18,8483,18,8486,18,8489,18,8492,18,8495,18,8497,18,8500,18,8502,18,8505,18,8507,18,8510,18,8513,18,8516,18,8517,18,8518,18,8520,18,8521,18,8522,18,8525,18,8528,18,8530,18,8532,18,8534,18,8537,18,8540,18,8543,18,8546,18,8547,18,8549,18,8551,18,8553,18,8556,18,8559,18,8561,18,8563,18,8566,18,8569,18,8572,18,8575,18,8576,18,8578,18,8580,18,8582,18,8585,18,8588,18,8589,18,8592,18,8593,18,8596,18,8599,18,8602,18,8605,18,8608,18,8611,18,8614,18,8617,18,8620,18,8623,18,8625,18,8628,18,8631,18,8634,18,8637,18,8638,18,8640,18,8642,18,8644,18,8647,18,8650,18,8651,18,8654,18,8657,18,8660,18,8661,18,8664,18,8667,18,8670,18,8672,18,8675,18,8678,18,8681,18,8683,18,8684,18,8685,18,8687,18,8688,18,8689,18,8690,18,8691,18,8692,18,8695,18,8698,18,8700,18,8702,18,8703,18,8704,18,8705,18,8707,18,8709,18,8710,18,8711,18,8712,18,8713,18,8714,18,8716,18,8718,18,8719,18,8720,18,8721,18,8722,18,8724,18,8725,18,8727,18,8728,18,8729,18,8730,18,8731,18,8734,18,8737,18,8739,18,8742,18,8744,18,8747,18,8750,18,8751,18,8752,18,8753,18,8754,18,8757,18,8758,18,8759,18,8760,18,8763,18,8766,18,8769,18,8772,18,8773,18,8775,18,8777,18,8779,18,8780,18,8781,18,8782,18,8783,18,8785,18,8787,18,8790,18,8792,18,8794,18,8796,18,8798,18,8799,18,8800,18,8803,18,8805,18,8808,18,8810,18,8812,18,8814,18,8815,18,8817,18,8819,18,8822,18,8823,18,8826,18,8829,18,8831,18,8834,18,8837,18,8838,18,8841,18,8844,18,8847,18,8850,18,8851,18,8853,18,8856,19,8858,19,8861,19,8864,19,8867,19,8868,19,8869,19,8871,19,8872,19,8873,19,8876,19,8878,19,8881,19,8884,19,8886,19,8888,19,8890,19,8893,19,8896,19,8898,19,8900,19,8903,19,8905,19,8908,19,8911,19,8912,19,8914,19,8917,19,8920,19,8921,19,8922,19,8923,19,8924,19,8926,19,8927,19,8929,19,8932,19,8935,19,8937,19,8939,19,8940,19,8943,19,8946,19,8948,19,8950,19,8952,19,8955,19,8956,19,8958,19,8961,19,8963,19,8966,19,8969,19,8971,19,8974,19,8976,19,8979,19,8982,19,8983,19,8984,19,8987,19,8988,19,8990,19,8992,19,8993,19,8995,19,8996,19,8997,19,9000,19,9002,19,9004,19,9006,19,9008,19,9009,19,9011,19,9012,19,9013,19,9014,19,9015,19,9016,19,9019,19,9020,19,9023,19,9026,19,9029,19,9032,19,9035,19,9036,19,9039,19,9042,19,9045,19,9047,19,9050,19,9052,19,9055,19,9058,19,9060,19,9062,19,9064,19,9066,19,9068,19,9070,19,9072,19,9075,19,9077,19,9080,19,9081,19,9084,19,9087,19,9089,19,9091,19,9093,19,9096,19,9098,19,9101,19,9103,19,9105,19,9108,19,9110,19,9113,19,9115,19,9118,19,9120,19,9123,19,9125,19,9128,19,9131,19,9134,19,9137,19,9140,19,9143,19,9146,19,9149,19,9152,19,9155,19,9158,19,9160,19,9162,19,9165,19,9166,19,9168,19,9171,19,9173,19,9175,19,9178,19,9180,19,9182,19,9185,19,9186,19,9188,19,9189,19,9192,19,9195,19,9197,19,9200,19,9203,19,9205,19,9207,19,9209,19,9211,19,9213,19,9216,19,9218,19,9220,19,9222,19,9224,19,9226,19,9229,19,9232,19,9234,19,9237,19,9238,19,9239,19,9242,19,9244,19,9246,19,9248,19,9250,19,9252,19,9254,19,9255,19,9257,19,9260,19,9263,19,9266,19,9267,19,9270,19,9272,19,9274,19,9276,19,9278,19,9280,19,9282,19,9284,19,9286,19,9288,19,9291,19,9293,19,9295,19,9297,19,9299,19,9302,19,9304,19,9307,19,9308,19,9311,19,9314,19,9317,19,9319,19,9322,19,9324,19,9327,19,9329,19,9332,19,9334,19,9336,19,9338,19,9341,19,9343,19,9344,19,9347,20,9350,20,9352,20,9355,20,9357,20,9360,20,9363,20,9365,20,9368,20,9370,20,9372,20,9374,20,9376,20,9378,20,9381,20,9383,20,9384,20,9387,20,9390,20,9392,20,9395,20,9397,20,9400,20,9403,20,9404,20,9407,20,9409,20,9412,20,9414,20,9417,20,9419,20,9422,20,9423,20,9426,20,9428,20,9431,20,9433,20,9436,20,9439,20,9441,20,9443,20,9445,20,9448,20,9449,20,9452,20,9454,20,9455,20,9456,20,9458,20,9460,20,9462,20,9465,20,9467,20,9469,20,9471,20,9473,20,9474,20,9477,20,9478,20,9481,20,9484,20,9486,20,9489,20,9492,20,9494,20,9497,20,9499,20,9500,20,9501,20,9503,20,9505,20,9506,20,9509,20,9512,20,9514,20,9517,20,9519,20,9522,20,9525,20,9527,20,9529,20,9532,20,9534,20,9536,20,9538,20,9540,20,9542,20,9544,20,9546,20,9548,20,9550,20,9552,20,9554,20,9555,20,9556,20,9558,20,9560,20,9562,20,9564,20,9566,20,9569,20,9571,20,9574,20,9576,20,9579,20,9582,20,9584,20,9587,20,9589,20,9591,20,9593,20,9595,20,9597,20,9599,20,9600,20,9603,20,9606,20,9608,20,9609,20,9611,20,9613,20,9615,20,9618,20,9620,20,9622,20,9625,20,9628,20,9630,20,9633,20,9636,20,9639,20,9641,20,9643,20,9646,20,9647,20,9650,20,9651,20,9654,20,9656,20,9659,20,9661,20,9664,20,9666,20,9668,20,9671,20,9673,20,9675,20,9678,20,9681,20,9683,20,9686,20,9688,20,9691,20,9693,20,9696,20,9698,20,9700,20,9702,20,9705,20,9708,20,9710,20,9713,20,9715,20,9717,20,9719,20,9722,20,9724,20,9726,20,9728,20,9731,20,9734,20,9736,20,9739,20,9741,20,9743,20,9745,20,9748,20,9751,20,9754,20,9756,20,9758,20,9761,20,9764,20,9767,20,9769,20,9771,20,9773,20,9776,20,9778,20,9780,20,9783,20,9785,20,9788,20,9790,20,9793,20,9795,20,9797,20,9799,20,9802,20,9805,20,9807,20,9809,20,9812,20,9815,20,9818,20,9820,20,9822,20,9824,20,9827,20,9829,20,9831,20,9834,20,9836,20,9839,20,9841,20,9844,20,9847,20,9850,20,9852,20,9855,20,9858,21,9860,21,9861,21,9864,21,9867,21,9868,21,9870,21,9873,21,9875,21,9878,21,9880,21,9883,21,9886,21,9888,21,9890,21,9891,21,9893,21,9895,21,9897,21,9900,21,9903,21,9905,21,9908,21,9910,21,9913,21,9915,21,9917,21,9919,21,9922,21,9924,21,9926,21,9928,21,9931,21,9934,21,9935,21,9937,21,9939,21,9942,21,9945,21,9947,21,9950,21,9952,21,9954,21,9956,21,9958,21,9961,21,9963,21,9965,21,9967,21,9970,21,9972,21,9974,21,9976,21,9979,21,9981,21,9984,21,9986,21,9989,21,9990,21,9992,21,9995,21,9997,21,10000,21,10001,21,10003,21,10006,21,10008,21,10009,21,10012,21,10013,21,10014,21,10017,21,10019,21,10021,21,10023,21,10026,21,10027,21,10030,21,10032,21,10035,21,10038,21,10039,21,10042,21,10044,21,10045,21,10047,21,10048,21,10050,21,10051,21,10053,21,10054,21,10056,21,10057,21,10060,21,10062,21,10063,21,10065,21,10066,21,10068,21,10069,21,10072,21,10074,21,10076,21,10079,21,10081,21,10082,21,10084,21,10085,21,10087,21,10088,21,10091,21,10093,21,10095,21,10098,21,10100,21,10103,21,10106,21,10108,21,10111,21,10113,21,10116,21,10118,21,10121,21,10123,21,10126,21,10127,21,10130,21,10132,21,10134,21,10137,21,10139,21,10142,21,10144,21,10147,21,10149,21,10152,21,10155,21,10157,21,10160,21,10162,21,10165,21,10167,21,10170,21,10172,21,10174,21,10177,21,10180,21,10182,21,10185,21,10187,21,10189,21,10191,21,10194,21,10196,21,10198,21,10201,21,10204,21,10206,21,10209,21,10211,21,10213,21,10215,21,10218,21,10220,21,10223,21,10224,21,10227,21,10229,21,10231,21,10234,21,10235,21,10237,21,10240,21,10241,21,10244,21,10245,21,10248,21,10249,21,10252,21,10253,21,10256,21,10259,21,10260,21,10263,21,10266,21,10269,21,10270,21,10273,21,10276,21,10277,21,10280,21,10282,21,10284,21,10286,21,10287,21,10289,21,10291,21,10293,21,10294,21,10296,21,10298,21,10300,21,10302,21,10305,21,10307,21,10309,21,10311,21,10314,21,10316,21,10318,21,10320,21,10322,21,10324,21,10326,21,10327,21,10329,21,10331,21,10333,21,10334,21,10336,21,10338,22,10340,22,10342,22,10345,22,10347,22,10349,22,10351,22,10354,22,10356,22,10358,22,10360,22,10362,22,10364,22,10367,22,10369,22,10371,22,10374,22,10376,22,10378,22,10380,22,10382,22,10384,22,10386,22,10389,22,10392,22,10395,22,10397,22,10400,22,10403,22,10404,22,10407,22,10410,22,10413,22,10415,22,10418,22,10419,22,10421,22,10422,22,10425,22,10426,22,10429,22,10430,22,10431,22,10434,22,10435,22,10437,22,10439,22,10441,22,10443,22,10446,22,10448,22,10450,22,10452,22,10454,22,10456,22,10458,22,10460,22,10461,22,10464,22,10465,22,10467,22,10470,22,10472,22,10474,22,10477,22,10478,22,10480,22,10482,22,10485,22,10488,22,10490,22,10493,22,10495,22,10498,22,10500,22,10503,22,10505,22,10507,22,10509,22,10512,22,10514,22,10515,22,10517,22,10520,22,10522,22,10525,22,10527,22,10530,22,10532,22,10535,22,10537,22,10540,22,10542,22,10544,22,10546,22,10549,22,10551,22,10554,22,10556,22,10559,22,10562,22,10563,22,10565,22,10568,22,10571,22,10573,22,10575,22,10577,22,10579,22,10581,22,10583,22,10586,22,10588,22,10589,22,10591,22,10593,22,10596,22,10598,22,10600,22,10602,22,10604,22,10607,22,10610,22,10612,22,10615,22,10617,22,10619,22,10621,22,10624,22,10626,22,10629,22,10631,22,10634,22,10637,22,10638,22,10640,22,10643,22,10645,22,10648,22,10649,22,10651,22,10654,22,10656,22,10659,22,10661,22,10663,22,10666,22,10668,22,10671,22,10674,22,10676,22,10677,22,10679,22,10680,22,10683,22,10685,22,10687,22,10690,22,10692,22,10694,22,10696,22,10699,22,10701,22,10704,22,10706,22,10709,22,10712,22,10715,22,10716,22,10717,22,10718,22,10719,22,10720,22,10721,22,10724,22,10726,22,10729,22,10732,22,10734,22,10737,22,10739,22,10742,22,10744,22,10747,22,10750,22,10752,22,10754,22,10757,22,10759,22,10761,22,10764,22,10765,22,10768,22,10770,22,10773,22,10776,22,10779,22,10781,22,10784,22,10786,22,10788,22,10790,22,10793,22,10796,22,10798,22,10799,22,10802,22,10804,22,10806,22,10808,22,10811,22,10813,22,10816,22,10818,22,10820,22,10821,22,10824,22,10826,22,10829,22,10831,22,10833,23,10836,23,10838,23,10841,23,10844,23,10847,23,10848,23,10850,23,10852,23,10855,23,10856,23,10858,23,10861,23,10863,23,10865,23,10868,23,10870,23,10872,23,10875,23,10877,23,10879,23,10881,23,10883,23,10886,23,10888,23,10890,23,10892,23,10894,23,10895,23,10897,23,10900,23,10902,23,10904,23,10907,23,10909,23,10910,23,10913,23,10915,23,10918,23,10920,23,10923,23,10924,23,10926,23,10929,23,10931,23,10933,23,10936,23,10938,23,10940,23,10943,23,10945,23,10947,23,10949,23,10951,23,10954,23,10956,23,10958,23,10960,23,10962,23,10963,23,10965,23,10968,23,10970,23,10972,23,10975,23,10977,23,10980,23,10982,23,10984,23,10987,23,10989,23,10991,23,10993,23,10994,23,10997,23,10999,23,11002,23,11004,23,11007,23,11010,23,11011,23,11013,23,11015,23,11018,23,11019,23,11021,23,11024,23,11026,23,11029,23,11031,23,11034,23,11036,23,11039,23,11041,23,11044,23,11046,23,11049,23,11051,23,11054,23,11056,23,11059,23,11060,23,11062,23,11065,23,11067,23,11070,23,11072,23,11075,23,11077,23,11080,23,11082,23,11084,23,11086,23,11089,23,11091,23,11094,23,11096,23,11099,23,11102,23,11104,23,11107,23,11109,23,11111,23,11113,23,11116,23,11117,23,11120,23,11121,23,11124,23,11127,23,11128,23,11130,23,11132,23,11134,23,11136,23,11138,23,11140,23,11142,23,11144,23,11147,23,11149,23,11151,23,11153,23,11154,23,11156,23,11158,23,11160,23,11162,23,11164,23,11166,23,11168,23,11170,23,11173,23,11175,23,11178,23,11179,23,11180,23,11183,23,11186,23,11188,23,11190,23,11193,23,11196,23,11197,23,11200,23,11202,23,11204,23,11205,23,11208,23,11210,23,11213,23,11215,23,11217,23,11219,23,11220,23,11223,23,11225,23,11228,23,11230,23,11232,23,11235,23,11238,23,11239,23,11240,23,11243,23,11245,23,11247,23,11250,23,11252,23,11255,23,11257,23,11259,23,11262,23,11263,23,11265,23,11267,23,11268,23,11271,23,11274,23,11277,23,11278,23,11281,23,11283,23,11285,23,11288,23,11289,23,11290,23,11292,23,11294,23,11296,23,11298,23,11300,23,11302,23,11305,23,11306,23,11308,23,11310,23,11312,23,11315,23,11318,23,11320,24,11322,24,11325,24,11328,24,11329,24,11331,24,11332,24,11334,24,11335,24,11337,24,11338,24,11339,24,11342,24,11345,24,11346,24,11349,24,11352,24,11353,24,11355,24,11357,24,11360,24,11361,24,11363,24,11364,24,11365,24,11367,24,11369,24,11371,24,11373,24,11375,24,11377,24,11379,24,11381,24,11383,24,11385,24,11388,24,11390,24,11392,24,11395,24,11397,24,11400,24,11403,24,11405,24,11407,24,11410,24,11413,24,11416,24,11419,24,11420,24,11423,24,11426,24,11427,24,11428,24,11430,24,11431,24,11434,24,11436,24,11437,24,11440,24,11443,24,11445,24,11446,24,11449,24,11450,24,11452,24,11455,24,11457,24,11460,24,11461,24,11463,24,11466,24,11467,24,11470,24,11471,24,11472,24,11474,24,11475,24,11476,24,11478,24,11480,24,11482,24,11484,24,11485,24,11486,24,11489,24,11492,24,11495,24,11497,24,11498,24,11501,24,11504,24,11506,24,11509,24,11511,24,11513,24,11516,24,11519,24,11522,24,11524,24,11525,24,11528,24,11529,24,11531,24,11534,24,11536,24,11538,24,11540,24,11542,24,11545,24,11548,24,11551,24,11553,24,11555,24,11556,24,11559,24,11561,24,11562,24,11565,24,11566,24,11568,24,11571,24,11573,24,11576,24,11577,24,11579,24,11582,24,11583,24,11586,24,11587,24,11588,24,11590,24,11591,24,11592,24,11594,24,11596,24,11597,24,11598,24,11601,24,11604,24,11606,24,11607,24,11610,24,11611,24,11612,24,11615,24,11616,24,11618,24,11621,24,11623,24,11626,24,11627,24,11629,24,11632,24,11633,24,11636,24,11637,24,11638,24,11640,24,11641,24,11642,24,11644,24,11646,24,11648,24,11650,24,11651,24,11654,24,11657,24,11659,24,11661,24,11664,24,11667,24,11669,24,11670,24,11673,24,11674,24,11677,24,11678,24,11681,24,11683,24,11686,24,11687,24,11690,24,11692,24,11694,24,11697,24,11698,24,11700,24,11703,24,11706,24,11709,24,11711,24,11713,24,11714,24,11716,24,11718,24,11721,24,11722,24,11724,24,11727,24,11729,24,11731,24,11734,24,11736,24,11738,24,11740,24,11741,24,11744,24,11747,24,11750,24,11752,24,11754,24,11755,24,11757,24,11759,24,11760,24,11763,24,11764,24,11766,24,11769,24,11771,24,11774,25,11777,25,11779,25,11780,25,11783,25,11784,25,11786,25,11789,25,11792,25,11794,25,11797,25,11800,25,11802,25,11803,25,11806,25,11809,25,11811,25,11812,25,11815,25,11816,25,11818,25,11821,25,11824,25,11826,25,11829,25,11832,25,11834,25,11835,25,11838,25,11841,25,11842,25,11844,25,11845,25,11848,25,11851,25,11852,25,11854,25,11855,25,11858,25,11861,25,11862,25,11864,25,11866,25,11868,25,11869,25,11870,25,11873,25,11874,25,11877,25,11878,25,11879,25,11881,25,11883,25,11885,25,11886,25,11889,25,11890,25,11892,25,11894,25,11895,25,11896,25,11898,25,11899,25,11900,25,11901,25,11902,25,11905,25,11906,25,11908,25,11909,25,11910,25,11912,25,11914,25,11916,25,11917,25,11920,25,11921,25,11923,25,11925,25,11926,25,11927,25,11929,25,11930,25,11931,25,11932,25,11933,25,11936,25,11937,25,11938,25,11939,25,11940,25,11941,25,11942,25,11943,25,11944,25,11947,25,11948,25,11951,25,11954,25,11955,25,11956,25,11959,25,11961,25,11962,25,11963,25,11964,25,11965,25,11966,25,11967,25,11970,25,11973,25,11976,25,11977,25,11978,25,11979,25,11980,25,11981,25,11982,25,11984,25,11985,25,11986,25,11988,25,11991,25,11992,25,11994,25,11995,25,11996,25,11997,25,11999,25,12000,25,12002,25,12003,25,12004,25,12006,25,12008,25,12010,25,12011,25,12012,25,12013,25,12014,25,12016,25,12019,25,12020,25,12021,25,12022,25,12023,25,12026,25,12029,25,12032,25,12033,25,12034,25,12035,25,12036,25,12037,25,12038,25,12040,25,12041,25,12042,25,12044,25,12045,25,12046,25,12047,25,12048,25,12049,25,12050,25,12053,25,12056,25,12059,25,12060,25,12061,25,12062,25,12063,25,12064,25,12066,25,12067,25,12068,25,12070,25,12071,25,12074,25,12077,25,12078,25,12079,25,12080,25,12083,25,12086,25,12089,25,12092,25,12095,25,12098,25,12100,25,12102,25,12104,25,12105,25,12108,25,12111,25,12112,25,12113,25,12114,25,12115,25,12118,25,12119,25,12122,25,12125,25,12128,25,12130,25,12132,25,12134,25,12135,25,12138,25,12141,25,12142,25,12143,25,12144,25,12145,25,12148,25,12149,25,12152,25,12155,25,12158,25,12161,25,12163,26,12165,26,12167,26,12170,26,12172,26,12173,26,12175,26,12177,26,12179,26,12182,26,12184,26,12185,26,12188,26,12190,26,12192,26,12194,26,12197,26,12199,26,12200,26,12202,26,12204,26,12206,26,12209,26,12211,26,12212,26,12213,26,12216,26,12217,26,12220,26,12222,26,12225,26,12226,26,12227,26,12230,26,12232,26,12234,26,12235,26,12237,26,12238,26,12239,26,12240,26,12242,26,12244,26,12246,26,12248,26,12251,26,12253,26,12254,26,12257,26,12260,26,12263,26,12266,26,12269,26,12272,26,12274,26,12276,26,12279,26,12281,26,12283,26,12285,26,12288,26,12290,26,12293,26,12296,26,12298,26,12300,26,12303,26,12304,26,12307,26,12310,26,12312,26,12315,26,12316,26,12319,26,12322,26,12325,26,12327,26,12329,26,12331,26,12334,26,12337,26,12340,26,12342,26,12344,26,12347,26,12350,26,12353,26,12356,26,12358,26,12361,26,12363,26,12366,26,12367,26,12369,26,12371,26,12374,26,12376,26,12378,26,12380,26,12382,26,12383,26,12385,26,12388,26,12391,26,12394,26,12397,26,12400,26,12401,26,12402,26,12403,26,12405,26,12406,26,12407,26,12410,26,12412,26,12414,26,12416,26,12418,26,12419,26,12420,26,12421,26,12423,26,12424,26,12426,26,12427,26,12428,26,12430,26,12431,26,12432,26,12433,26,12435,26,12436,26,12438,26,12439,26,12442,26,12443,26,12444,26,12445,26,12447,26,12448,26,12449,26,12451,26,12452,26,12453,26,12455,26,12456,26,12458,26,12459,26,12460,26,12461,26,12462,26,12463,26,12465,26,12466,26,12468,26,12469,26,12471,26,12474,26,12476,26,12479,26,12482,26,12485,26,12487,26,12489,26,12491,26,12494,26,12497,26,12498,26,12501,26,12504,26,12505,26,12508,26,12511,26,12513,26,12516,26,12519,26,12521,26,12524,26,12525,26,12527,26,12530,26,12533,26,12536,26,12537,26,12538,26,12540,26,12542,26,12544,26,12545,26,12547,26,12549,26,12551,26,12552,26,12554,26,12556,26,12559,26,12560,26,12561,26,12562,26,12563,26,12564,26,12565,26,12566,26,12568,26,12570,26,12572,26,12574,26,12576,26,12578,26,12579,26,12580,26,12582,26,12585,26,12588,26,12590,26,12591,26,12593,26,12594,26,12595,26,12597,26,12599,27,12601,27,12603,27,12605,27,12607,27,12609,27,12610,27,12611,27,12612,27,12614,27,12615,27,12617,27,12619,27,12620,27,12621,27,12624,27,12625,27,12626,27,12629,27,12632,27,12633,27,12635,27,12636,27,12639,27,12640,27,12641,27,12644,27,12647,27,12648,27,12651,27,12652,27,12654,27,12656,27,12659,27,12661,27,12663,27,12666,27,12667,27,12668,27,12669,27,12672,27,12673,27,12674,27,12675,27,12676,27,12679,27,12680,27,12681,27,12684,27,12685,27,12687,27,12689,27,12690,27,12692,27,12694,27,12695,27,12696,27,12697,27,12698,27,12700,27,12701,27,12702,27,12704,27,12705,27,12708,27,12710,27,12712,27,12715,27,12716,27,12717,27,12718,27,12719,27,12720,27,12721,27,12722,27,12725,27,12727,27,12729,27,12730,27,12733,27,12734,27,12737,27,12738,27,12740,27,12742,27,12744,27,12747,27,12749,27,12752,27,12754,27,12757,27,12758,27,12759,27,12761,27,12762,27,12763,27,12765,27,12767,27,12770,27,12772,27,12774,27,12776,27,12778,27,12780,27,12781,27,12782,27,12784,27,12785,27,12786,27,12787,27,12789,27,12790,27,12792,27,12795,27,12797,27,12799,27,12801,27,12803,27,12805,27,12806,27,12807,27,12808,27,12809,27,12810,27,12811,27,12812,27,12813,27,12816,27,12819,27,12821,27,12823,27,12825,27,12828,27,12831,27,12833,27,12835,27,12838,27,12840,27,12842,27,12844,27,12847,27,12849,27,12852,27,12855,27,12856,27,12859,27,12861,27,12864,27,12865,27,12867,27,12868,27,12870,27,12872,27,12873,27,12874,27,12875,27,12876,27,12878,27,12879,27,12881,27,12882,27,12884,27,12885,27,12886,27,12887,27,12888,27,12889,27,12890,27,12891,27,12893,27,12894,27,12896,27,12897,27,12898,27,12899,27,12900,27,12901,27,12903,27,12904,27,12905,27,12906,27,12908,27,12909,27,12911,27,12912,27,12913,27,12914,27,12915,27,12916,27,12917,27,12918,27,12920,27,12921,27,12923,27,12924,27,12925,27,12926,27,12927,27,12928,27,12929,27,12930,27,12932,27,12933,27,12935,27,12936,27,12937,27,12938,27,12939,27,12940,27,12941,27,12942,27,12944,27,12945,27,12947,27,12948,27,12949,27,12950,27,12951,27,12952,27,12953,27,12954,28,12956,28,12957,28,12958,28,12959,28,12960,28,12963,28,12965,28,12968,28,12969,28,12971,28,12972,28,12974,28,12976,28,12977,28,12978,28,12979,28,12980,28,12982,28,12983,28,12985,28,12986,28,12988,28,12989,28,12990,28,12991,28,12992,28,12993,28,12994,28,12995,28,12997,28,12998,28,13000,28,13001,28,13002,28,13003,28,13004,28,13005,28,13007,28,13008,28,13009,28,13010,28,13012,28,13013,28,13015,28,13016,28,13017,28,13018,28,13019,28,13020,28,13021,28,13022,28,13024,28,13025,28,13027,28,13028,28,13029,28,13030,28,13031,28,13032,28,13033,28,13034,28,13036,28,13037,28,13039,28,13040,28,13041,28,13042,28,13043,28,13044,28,13045,28,13046,28,13048,28,13049,28,13051,28,13052,28,13053,28,13054,28,13055,28,13056,28,13057,28,13058,28,13060,28,13061,28,13062,28,13063,28,13064,28,13067,28,13069,28,13072,28,13073,28,13076,28,13078,28,13080,28,13081,28,13083,28,13086,28,13087,28,13088,28,13090,28,13092,28,13094,28,13096,28,13099,28,13100,28,13103,28,13106,28,13109,28,13111,28,13113,28,13115,28,13117,28,13119,28,13120,28,13122,28,13124,28,13125,28,13128,28,13129,28,13132,28,13133,28,13135,28,13137,28,13139,28,13142,28,13144,28,13147,28,13150,28,13151,28,13152,28,13154,28,13156,28,13157,28,13160,28,13163,28,13165,28,13167,28,13169,28,13171,28,13174,28,13175,28,13177,28,13180,28,13182,28,13184,28,13186,28,13189,28,13192,28,13195,28,13196,28,13197,28,13198,28,13201,28,13204,28,13207,28,13208,28,13209,28,13210,28,13213,28,13216,28,13217,28,13220,28,13222,28,13225,28,13228,28,13229,28,13232,28,13233,28,13234,28,13237,28,13238,28,13240,28,13243,28,13244,28,13247,28,13248,28,13251,28,13252,28,13255,28,13258,28,13259,28,13260,28,13261,28,13262,28,13265,28,13267,28,13268,28,13269,28,13272,28,13273,28,13275,28,13277,28,13278,28,13281,28,13282,28,13284,28,13287,28,13290,28,13292,28,13293,28,13296,28,13298,28,13300,28,13303,28,13304,28,13305,28,13308,28,13311,28,13312,28,13313,28,13316,28,13318,28,13319,28,13322,28,13323,28,13324,28,13325,28,13328,28,13330,28,13331,28,13332,29,13333,29,13336,29,13339,29,13340,29,13341,29,13344,29,13346,29,13347,29,13350,29,13353,29,13354,29,13355,29,13358,29,13360,29,13362,29,13363,29,13366,29,13369,29,13370,29,13371,29,13374,29,13376,29,13378,29,13379,29,13382,29,13385,29,13386,29,13387,29,13390,29,13392,29,13393,29,13396,29,13397,29,13398,29,13399,29,13402,29,13404,29,13405,29,13406,29,13407,29,13410,29,13413,29,13414,29,13415,29,13418,29,13420,29,13422,29,13423,29,13426,29,13429,29,13430,29,13431,29,13434,29,13436,29,13438,29,13440,29,13442,29,13444,29,13445,29,13448,29,13451,29,13452,29,13453,29,13456,29,13458,29,13459,29,13462,29,13465,29,13466,29,13467,29,13470,29,13472,29,13475,29,13477,29,13480,29,13482,29,13485,29,13486,29,13489,29,13490,29,13491,29,13494,29,13496,29,13497,29,13498,29,13499,29,13502,29,13503,29,13504,29,13506,29,13507,29,13508,29,13509,29,13511,29,13513,29,13516,29,13518,29,13520,29,13522,29,13524,29,13525,29,13526,29,13527,29,13529,29,13532,29,13535,29,13538,29,13541,29,13544,29,13547,29,13548,29,13551,29,13552,29,13554,29,13555,29,13557,29,13559,29,13561,29,13562,29,13565,29,13568,29,13571,29,13574,29,13575,29,13576,29,13577,29,13579,29,13582,29,13583,29,13585,29,13587,29,13590,29,13592,29,13594,29,13596,29,13597,29,13599,29,13601,29,13603,29,13604,29,13605,29,13608,29,13611,29,13614,29,13617,29,13618,29,13619,29,13620,29,13622,29,13623,29,13625,29,13627,29,13629,29,13632,29,13635,29,13638,29,13641,29,13642,29,13644,29,13647,29,13650,29,13653,29,13656,29,13659,29,13660,29,13663,29,13665,29,13667,29,13670,29,13671,29,13673,29,13675,29,13676,29,13678,29,13679,29,13680,29,13683,29,13686,29,13689,29,13692,29,13693,29,13694,29,13695,29,13697,29,13698,29,13700,29,13702,29,13704,29,13707,29,13710,29,13713,29,13716,29,13717,29,13719,29,13721,29,13724,29,13725,29,13728,29,13729,29,13732,29,13734,29,13736,29,13738,29,13741,29,13744,29,13747,29,13750,29,13753,29,13756,29,13759,29,13762,29,13765,29,13768,29,13769,29,13771,29,13773,29,13776,29,13777,29,13778,29,13781,30,13784,30,13785,30,13786,30,13789,30,13792,30,13795,30,13798,30,13801,30,13804,30,13806,30,13809,30,13810,30,13813,30,13814,30,13816,30,13819,30,13821,30,13824,30,13827,30,13830,30,13832,30,13834,30,13837,30,13840,30,13843,30,13846,30,13849,30,13851,30,13853,30,13855,30,13858,30,13860,30,13862,30,13863,30,13865,30,13868,30,13869,30,13871,30,13874,30,13876,30,13879,30,13880,30,13882,30,13885,30,13886,30,13887,30,13889,30,13890,30,13893,30,13894,30,13897,30,13898,30,13899,30,13900,30,13902,30,13905,30,13908,30,13911,30,13914,30,13917,30,13920,30,13922,30,13925,30,13926,30,13928,30,13931,30,13933,30,13936,30,13939,30,13942,30,13945,30,13948,30,13951,30,13953,30,13956,30,13959,30,13962,30,13963,30,13964,30,13965,30,13968,30,13969,30,13970,30,13972,30,13974,30,13976,30,13979,30,14031,30,14034,30,14035,30,14036,30,14039,30,14042,30,14045,30,14048,30,14049,30,14050,30,14052,30,14053,30,14055,30,14057,30,14059,30,14061,30,14064,30,14065,30,14067,30,14069,30,14072,30,14074,30,14076,30,14079,30,14080,30,14082,30,14083,30,14084,30,14086,30,14087,30,14090,30,14092,30,14094,30,14095,30,14097,30,14100,30,14102,30,14105,30,14107,30,14109,30,14112,30,14114,30,14116,30,14119,30,14122,30,14123,30,14124,30,14127,30,14128,30,14129,30,14132,30,14135,30,14136,30,14137,30,14138,30,14139,30,14141,30,14143,30,14145,30,14146,30,14147,30,14148,30,14150,30,14152,30,14154,30,14157,30,14158,30,14161,30,14162,30,14165,30,14168,30,14171,30,14174,30,14177,30,14180,30,14182,30,14184,30,14187,30,14189,30,14191,30,14194,30,14196,30,14198,30,14201,30,14204,30,14205,30,14206,30,14209,30,14210,30,14211,30,14214,30,14216,30,14219,30,14220,30,14221,30,14224,30,14226,30,14227,30,14228,30,14231,30,14234,30,14235,30,14236,30,14239,30,14241,30,14244,30,14245,30,14246,30,14249,30,14250,30,14251,30,14254,30,14255,30,14256,30,14258,30,14260,30,14263,30,14264,30,14267,30,14270,30,14271,30,14272,30,14273,30,14276,30,14277,30,14278,30,14281,30,14282,30,14283,30,14284,30,14286,30,14288,30,14291,31,14292,31,14294,31,14296,31,14298,31,14301,31,14304,31,14305,31,14307,31,14310,31,14313,31,14314,31,14315,31,14316,31,14318,31,14319,31,14322,31,14325,31,14326,31,14327,31,14328,31,14329,31,14332,31,14335,31,14338,31,14341,31,14342,31,14344,31,14346,31,14348,31,14351,31,14354,31,14355,31,14356,31,14359,31,14360,31,14361,31,14362,31,14365,31,14367,31,14368,31,14370,31,14372,31,14374,31,14376,31,14378,31,14380,31,14382,31,14385,31,14386,31,14387,31,14390,31,14391,31,14394,31,14395,31,14398,31,14399,31,14402,31,14403,31,14406,31,14407,31,14409,31,14412,31,14415,31,14416,31,14419,31,14421,31,14422,31,14424,31,14425,31,14428,31,14429,31,14432,31,14433,31,14436,31,14437,31,14438,31,14439,31,14442,31,14445,31,14448,31,14449,31,14450,31,14451,31,14452,31,14453,31,14455,31,14456,31,14457,31,14459,31,14460,31,14462,31,14464,31,14467,31,14468,31,14470,31,14472,31,14473,31,14474,31,14476,31,14477,31,14478,31,14479,31,14481,31,14483,31,14484,31,14485,31,14487,31,14488,31,14489,31,14490,31,14493,31,14496,31,14499,31,14500,31,14501,31,14502,31,14503,31,14504,31,14506,31,14507,31,14509,31,14510,31,14512,31,14513,31,14515,31,14516,31,14517,31,14519,31,14521,31,14523,31,14525,31,14526,31,14528,31,14531,31,14534,31,14535,31,14537,31,14539,31,14541,31,14543,31,14545,31,14547,31,14549,31,14551,31,14553,31,14555,31,14558,31,14561,31,14563,31,14564,31,14566,31,14569,31,14572,31,14573,31,14576,31,14578,31,14580,31,14583,31,14585,31,14588,31,14589,31,14592,31,14595,31,14596,31,14598,31,14601,31,14603,31,14605,31,14606,31,14607,31,14609,31,14610,31,14611,31,14612,31,14613,31,14615,31,14618,31,14620,31,14622,31,14623,31,14624,31,14626,31,14627,31,14628,31,14629,31,14630,31,14631,31,14633,31,14635,31,14638,31,14640,31,14642,31,14645,31,14646,31,14649,31,14650,31,14651,31,14652,31,14653,31,14656,31,14657,31,14658,31,14659,31,14660,31,14661,31,14662,31,14663,31,14666,31,14668,31,14669,31,14671,31,14673,31,14675,31,14677,31,14678,31,14681,31,14682,31,14684,31,14687,31,14689,32,14691,32,14693,32,14695,32,14696,32,14698,32,14700,32,14702,32,14703,32,14706,32,14707,32,14709,32,14712,32,14715,32,14716,32,14717,32,14719,32,14722,32,14725,32,14727,32,14728,32,14729,32,14732,32,14733,32,14735,32,14737,32,14739,32,14741,32,14743,32,14744,32,14745,32,14746,32,14747,32,14748,32,14749,32,14750,32,14752,32,14753,32,14754,32,14755,32,14756,32,14757,32,14758,32,14759,32,14760,32,14762,32,14765,32,14766,32,14768,32,14771,32,14772,32,14774,32,14776,32,14778,32,14780,32,14781,32,14782,32,14784,32,14785,32,14787,32,14790,32,14791,32,14792,32,14793,32,14794,32,14795,32,14796,32,14797,32,14798,32,14800,32,14801,32,14804,32,14807,32,14810,32,14813,32,14814,32,14817,32,14818,32,14821,32,14822,32,14825,32,14826,32,14827,32,14828,32,14829,32,14830,32,14833,32,14834,32,14835,32,14836,32,14837,32,14838,32,14840,32,14842,32,14844,32,14845,32,14846,32,14848,32,14851,32,14853,32,14854,32,14855,32,14856,32,14857,32,14858,32,14859,32,14860,32,14861,32,14863,32,14864,32,14866,32,14869,32,14872,32,14873,32,14874,32,14875,32,14878,32,14879,32,14881,32,14884,32,14887,32,14888,32,14889,32,14890,32,14893,32,14894,32,14897,32,14899,32,14900,32,14901,32,14904,32,14905,32,14906,32,14907,32,14910,32,14912,32,14915,32,14917,32,14918,32,14921,32,14923,32,14926,32,14927,32,14930,32,14931,32,14933,32,14936,32,14937,32,14938,32,14940,32,14943,32,14944,32,14946,32,14949,32,14951,32,14952,32,14953,32,14954,32,14957,32,14958,32,14961,32,14962,32,14965,32,14966,32,14967,32,14970,32,14971,32,14992,32,14993,32,14994,32,14995,32,14998,32,14999,32,15001,32,15004,32,15005,32,15008,32,15009,32,15012,32,15013,32,15014,32,15017,32,15018,32,15019,32,15021,32,15023,32,15025,32,15028,32,15031,32,15033,32,15036,32,15038,32,15041,32,15043,32,15046,32,15047,32,15050,32,15051,32,15054,32,15055,32,15057,32,15060,32,15061,32,15064,32,15065,32,15066,32,15067,32,15068,32,15069,32,15071,32,15074,32,15075,32,15076,32,15078,32,15080,32,15083,32,15086,32,15088,32,15090,32,15092,32,15095,33,15098,33,15100,33,15102,33,15104,33,15107,33,15110,33,15111,33,15112,33,15113,33,15114,33,15116,33,15119,33,15120,33,15123,33,15125,33,15127,33,15130,33,15131,33,15132,33,15133,33,15134,33,15135,33,15136,33,15139,33,15140,33,15142,33,15145,33,15148,33,15149,33,15150,33,15151,33,15154,33,15157,33,15158,33,24995,34,24996,34,24997,34,25000,34,25001,34,25003,34,25006,34,25008,34,25009,34,25010,34,25012,34,25013,34,25014,34,25015,34,25016,34,25017,34,25018,34,25019,34,25021,34,25022,34,25023,34,25026,34,25027,34,25028,34,25029,34,25030,34,25031,34,25032,34,25033,34,25034,34,25035,34,25037,34,25039,34,25042,34,25043,34,25044,34,25045,34,25048,34,25050,34,25051,34,25052,34,25053,34,25054,34,25055,34,25056,34,25057,34,25058,34,25060,34,25061,34,25062,34,25063,34,25064,34,25065,34,25066,34,25067,34,25068,34,25070,34,25073,34,25075,34,25078,34,25079,34,25080,34,25083,34,25084,34,25087,34,25088,34,25091,34,25093,34,25095,34,25098,34,25099,34,25102,34,25103,34,25104,34,25105,34,25106,34,25107,34,25110,34,25111,34,25112,34,25114,34,25116,34,25117,34,25118,34,25119,34,25121,34,25122,34,25123,34,25125,34,25128,34,25130,34,25132,34,25134,34,25136,34,25137,34,25139,34,25142,34,25143,34,25145,34,25147,34,25149,34,25151,34,25152,34,25153,34,25155,34,25157,34,25159,34,25161,34,25163,34,25165,34,25167,34,25168,34,25171,34,25173,34,25174,34,25177,34,25178,34,25181,34,25184,34,25185,34,25186,34,25189,34,25191,34,25194,34,25195,34,25197,34,25200,34,25202,34,25205,34,25207,34,25209,34,25212,34,25213,34,25216,34,25217,34,25218,34,25219,34,25220,34,25221,34,25224,34,25225,34,25226,34,25228,34,25230,34,25231,34,25232,34,25233,34,25235,34,25236,34,25237,34,25239,34,25242,34,25244,34,25246,34,25248,34,25250,34,25251,34,25253,34,25256,34,25257,34,25259,34,25261,34,25263,34,25265,34,25266,34,25267,34,25269,34,25271,34,25273,34,25275,34,25277,34,25279,34,25281,34,25282,34,25285,34,25287,34,25288,34,25291,34,25292,34,25295,34,25298,34,25299,34,25300,34,25303,34,25304,34,25306,34,25309,34,25311,34,25314,34,25316,34,25318,34,25321,34,25322,34,25325,34,25326,34,25327,34,25328,34,25329,34,25330,34,25333,34,25334,34,25335,34,25337,34,25339,34,25340,34,25341,34,25342,34,25344,34,25345,34,25346,34,25348,34,25351,34,25353,34,25355,34,25357,34,25359,34,25360,34,25362,34,25364,34,25367,34,25368,35,25370,35,25373,35,25374,35,25376,35,25377,35,25380,35,25381,35,25384,35,25385,35,25388,35,25391,35,25392,35,25393,35,25396,35,25398,35,25401,35,25402,35,25404,35,25407,35,25409,35,25412,35,25414,35,25416,35,25419,35,25420,35,25423,35,25424,35,25425,35,25426,35,25427,35,25428,35,25431,35,25432,35,25433,35,25435,35,25437,35,25438,35,25439,35,25440,35,25442,35,25443,35,25444,35,25446,35,25449,35,25451,35,25453,35,25456,35,25458,35,25461,35,25462,35,25463,35,25464,35,25467,35,25468,35,25471,35,25473,35,25476,35,25477,35,25480,35,25481,35,25484,35,25486,35,25489,35,25491,35,25493,35,25496,35];for(let i=0;i<t.length;i+=2)PCT[t[i]]=t[i+1];}

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
  /* ---- 저장·복원: 화면과 화면 사이(frame()이 끝난 뒤)의 상태를 바이트 묶음 하나로 내고, 그대로 되돌린다.
     담는 것: 기억 장치 C000–FFFF, 화면 기억 장치, 색표, 레지스터와 화면 시간. 자료(rom)와 옮긴 프로그램은 담지 않는다 ---- */
  const SHEAD = 12, SNUM = 35, SLEN = SHEAD + 0x4000 + 0x4000 + 64 + 64 + 10 + SNUM * 8;
  function ssum(b) { let h = 0x811C9DC5; for (let i = SHEAD; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); } return h >>> 0; }
  function save() {
    const b = new Uint8Array(SLEN), dv = new DataView(b.buffer); let o = SHEAD;
    b[0] = 0x44; b[1] = 0x48; b[2] = 0x50; b[3] = 0x45; b[4] = 1;            // 'DHPE', 묶음 판 1
    b.set(m.subarray(0xC000), o); o += 0x4000; b.set(vram, o); o += 0x4000; b.set(bgpal, o); o += 64; b.set(objpal, o); o += 64; b.set(lineObjX, o); o += 10;
    for (const v of [A, B, C, D, E, H, L, SP, fz, fn, fh, fc, pc, cyc, ime, halted, eiPend, bank, bankOff, vbk, lcdOn, ly, lineStart, evt, frames, winLine, offUntil, stat, joySel, ph, firstLine, m3len, bcps, ocps, nLineObj]) { dv.setFloat64(o, v, true); o += 8; }
    dv.setUint32(8, ssum(b), true);
    return b;
  }
  /* 묶음이 맞지 않으면(길이·표식·검사합) 아무것도 바꾸지 않고 false */
  function load(b) {
    if (!b || b.length !== SLEN || b[0] !== 0x44 || b[1] !== 0x48 || b[2] !== 0x50 || b[3] !== 0x45 || b[4] !== 1) return false;
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); if (dv.getUint32(8, true) !== ssum(b)) return false;
    let o = SHEAD;
    m.set(b.subarray(o, o + 0x4000), 0xC000); o += 0x4000; vram.set(b.subarray(o, o + 0x4000)); o += 0x4000; bgpal.set(b.subarray(o, o + 64)); o += 64; objpal.set(b.subarray(o, o + 64)); o += 64; lineObjX.set(b.subarray(o, o + 10)); o += 10;
    const n = () => { const v = dv.getFloat64(o, true); o += 8; return v; };
    A = n(); B = n(); C = n(); D = n(); E = n(); H = n(); L = n(); SP = n(); fz = n(); fn = n(); fh = n(); fc = n(); pc = n(); cyc = n(); ime = n(); halted = n(); eiPend = n(); bank = n(); bankOff = n(); vbk = n();
    lcdOn = n(); ly = n(); lineStart = n(); evt = n(); frames = n(); winLine = n(); offUntil = n(); stat = n(); joySel = n(); ph = n(); firstLine = n(); m3len = n(); bcps = n(); ocps = n(); nLineObj = n();
    keys = 0; frameDone = 0;
    for (let i = 0; i < 64; i += 2) { setBg(i); setObj(i); }
    setRecolor(recolor);
    return true;
  }
  const KEYBIT = { right: 1, left: 2, up: 4, down: 8, A: 16, B: 32, select: 64, start: 128 };
  return {
    m, vram, fb, base, over, heroPx, actPx, fgm, heroIx, actIx, bgi, brk() { frameDone = 1; }, frame, runTo, step, hook, flowHook, rd, wr,
    key(name, down) { const b = KEYBIT[name]; if (down) keys |= b; else keys &= ~b; },
    setKeys(v) { keys = v; }, setRecolor, save, load,
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
