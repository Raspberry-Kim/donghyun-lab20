/* 동현페 — 게임 층.
 * 엔진 핵심부(core.js) 위에서 ① 원작의 로고·제목·도입·메뉴 방·암호 화면을 건너뛰고 자체 흐름(시작·이어하기·층 넘김·끝)을 끼우며
 * ② 화면마다 주인공 그림을 아몰랑으로 바꿔 2배(320×288)로 그린다. 브라우저와 node(자동 확인) 양쪽에서 쓴다. */
(function (root) {
  'use strict';
  const SW = 160, SH = 144, OW = 320, OH = 288;
  /* 자료 안의 주인공 그림 표(princed.org 형식 문서와 같은 배치) */
  const T = { map_c: 0x28168, til_c: 0x28438, bank_c: 0x28654 };
  const NGROUP = 108;
  /* 배우 상태(RAM): 주인공 / 둘째 배우 */
  const HERO = { x: 0xC120, y: 0xC121, flip: 0xC122, xo: 0xC126, yo: 0xC127, group: 0xC132, ptr: 0xC139 };
  const V = { level: 0xC149, room: 0xC14C, hpMax: 0xC15E, hp: 0xC15D, min: 0xC163, sec: 0xC164, group: 0xC132, tick: 0xC10B };

  function u16(rom, o) { return rom[o] | (rom[o + 1] << 8); }
  function decTiles(rom, o) {
    const marker = rom[o], n = rom[o + 1]; let p = o + 2;
    p += (n + 1) >> 1;
    const tiles = [];
    for (let i = 0; i < n; i++) {
      const out = [];
      while (out.length < 16) {
        const b = rom[p++];
        if (b === marker && out.length >= 2) { const l = out.length; out.push(out[l - 2], out[l - 1]); }
        else { out.push(b); out.push(rom[p++]); }
      }
      tiles.push(out);
    }
    return tiles;
  }
  /* 주인공 묶음 108개의 원래 모양(색 번호 0–3): 어느 장이 화면에 나왔는지 맞춰 보고, 가려진 곳을 가리는 데 쓴다 */
  function decodeGroups(rom) {
    const G = [];
    for (let g = 0; g < NGROUP; g++) {
      const mo = u16(rom, T.map_c + 2 * g), to = u16(rom, T.til_c + 2 * g), bk = rom[T.bank_c + g];
      if (mo === 0 && to === 0) { G.push(null); continue; }
      const lin = (off) => bk * 0x4000 + (off - 0x4000);
      let m = lin(mo); const n = rom[m], w = rom[m + 1], h = rom[m + 2]; m += 3;
      let tiles;
      try { tiles = decTiles(rom, lin(to)); } catch (e) { G.push(null); continue; }
      const W = w * 8, H = h * 8, frames = [];
      for (let k = 0; k < n; k++) {
        const px = new Uint8Array(W * H); let cnt = 0;
        for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
          const t = rom[m + r * w + c];
          if (!t || !tiles[t - 1]) continue;
          const tl = tiles[t - 1];
          for (let y = 0; y < 8; y++) {
            const a = tl[2 * y], b = tl[2 * y + 1];
            for (let x = 0; x < 8; x++) {
              const v = ((a >> (7 - x)) & 1) | (((b >> (7 - x)) & 1) << 1);
              if (v) { px[(r * 8 + y) * W + c * 8 + x] = v; cnt++; }
            }
          }
        }
        m += w * h;
        frames.push({ px, cnt });
      }
      G.push({ n, w, h, W, H, base: mo + 3, cell: w * h, frames });
    }
    return G;
  }

  /* ---- 색상(넷 가운데 하나; 3 연필은 아래 '연필'에 따로 적었다) ----
     0 그레이스케일: 흰 바탕 흑백 모니터에 CGA 네 색 화면을 띄웠을 때처럼 검정·어두운 회색·밝은 회색·흰색 네 단계로만 그린다.
     1 컬러: 파스텔. 층마다 다른 주제색(벽돌)은 버터빛 노랑으로 모으고, 나머지 색은 색상을 지킨 채 채도를 낮추고 밝기를 올린다.
     2 본래 색: 원작 색표 그대로(색 바꾸기를 거치지 않는다).
     색은 0xAABBGGRR. 색표(팔레트) 단위로 바꾸므로 한 화면에 드는 품은 본래 색과 같다 */
  const GOLD = 0xFF00A8C0, BRICK_WIN = 24;
  const abgr = (r, g, b) => (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
  const lumOf = (v) => (0.299 * (v & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * ((v >> 16) & 255)) / 255;
  /* 색상(도). 채도가 낮으면 -1 */
  function hueOf(v) {
    const r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 24) return -1;
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return h * 60;
  }
  function hsv(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))); };
    return abgr(f(5), f(3), f(1));
  }
  /* 그레이스케일 네 단계: 흰 형광체는 살짝 푸른 흰색이다. 단계 경계는 밝기(0–1) */
  const GRAY = [abgr(10, 11, 13), abgr(92, 97, 104), abgr(168, 174, 181), abgr(240, 243, 246)], GRAY_T = [0.08, 0.21, 0.52];
  const grayLevel = (v) => { const l = lumOf(v); return l < GRAY_T[0] ? 0 : l < GRAY_T[1] ? 1 : l < GRAY_T[2] ? 2 : 3; };
  /* 파스텔: 검정은 짙은 남보라, 회색은 옅은 보랏빛 회색, 벽돌은 버터빛 노랑(색상 46°), 나머지는 채도 절반·밝기 올림 */
  const INK = abgr(16, 14, 24), BRICK_HUE = 46, STONE_HUE = 32;
  function pastelOf(v, brick) {
    const r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, val = mx / 255;
    if (mx < 20) return INK;
    const h = hueOf(v);
    if (h < 0) return hsv(STONE_HUE, 0.16 - 0.11 * val, 0.38 + 0.60 * val);
    if (brick) return hsv(BRICK_HUE, 0.46 - 0.22 * val, 0.56 + 0.42 * Math.pow(val, 0.6));
    return hsv(h, Math.min(0.5, 0.52 * d / mx), 0.40 + 0.58 * val);
  }
  function makeTone() {
    let T = [], sig = '', mode = 0;
    const isBrick = (v) => {
      if (v === GOLD) return false;
      const h = hueOf(v); if (h < 0) return false;
      for (let i = 0; i < T.length; i++) { const d = Math.abs(h - T[i]); if (Math.min(d, 360 - d) <= BRICK_WIN) return true; }
      return false;
    };
    const f = {
      /* 팔레트 하나(k0부터 네 색)의 보이는 색. 벽돌 판정은 배경 팔레트(4번 = 횃불·체력·글자는 빼고)와 스프라이트 팔레트 6(궁전 층의 바닥 조각)에만 한다 */
      pal(raw, out, k0, obj) {
        const pi = k0 >> 2, br = obj ? pi === 6 : pi !== 4;
        for (let k = k0; k < k0 + 4; k++) out[k] = mode === 0 ? GRAY[grayLevel(raw[k])] : pastelOf(raw[k], br && isBrick(raw[k]));
      },
      /* 주제색(배경 팔레트 0의 0·2번 색과 팔레트 1의 네 색)의 색상을 읽는다. 바뀌었으면 true */
      theme(raw) {
        const t = []; for (const i of [0, 2, 4, 5, 6, 7]) { const h = hueOf(raw[i]); if (h >= 0 && raw[i] !== GOLD) t.push(Math.round(h)); }
        const s2 = t.join(','); if (s2 === sig) return false; sig = s2; T = t; return true;
      },
      setMode(m) { mode = m; },
      isBrick,
    };
    return f;
  }
  /* 아몰랑 그림(스무 색)의 그레이스케일 판: 색마다 단계를 정한다. 치마는 어두운 회색, 살은 밝은 회색, 윗옷은 흰색 */
  const HERO_GRAY = { 0x7b8ac6: 1, 0x5967a3: 0 };
  function grayAtlas(A32) {
    const o = new Uint32Array(A32.length), memo = new Map();
    for (let i = 0; i < A32.length; i++) {
      const v = A32[i]; if (!(v >>> 24)) continue;
      let g = memo.get(v);
      if (g === undefined) { const key = ((v & 255) << 16) | (v & 0xFF00) | ((v >> 16) & 255); g = GRAY[key in HERO_GRAY ? HERO_GRAY[key] : grayLevel(v)]; memo.set(v, g); }
      o[i] = g;
    }
    return o;
  }


  /* ---- 연필(색상 3) ----
     그레이스케일 화면(320×288, 네 단계)을 세 배(960×864)의 종이 위 연필 그림으로 옮긴다. 원작 타일을 새로 그리는 것이 아니라 화면을 거른다.
     · 단계가 바뀌는 자리마다 윤곽선을 긋는다.
     · 흰색은 종이, 밝은 회색은 성긴 빗금, 어두운 회색은 엇갈린 빗금, 검정은 짙은 빗금이다.
     · 배경의 넓은 검정(원래 칸으로 125픽셀 이상 이어진 빈 곳)은 칠하지 않고 종이로 남긴다. 그 위의 스프라이트(주인공·경비병 등)의 검정은 짙게 칠한다.
     · 아래 띠(체력·시간·층 글자, y ≥ 124)는 뒤집어 그린다: 바탕은 종이, 글자는 짙게.
     빗금·얼룩·종이결은 씨앗을 정한 난수로 한 번 만들어 화면에 고정하므로 움직여도 무늬가 떨지 않는다.
     화면은 16×16(세 배로 48×48) 조각으로 나누어 바뀐 조각만 다시 그린다 */
  const PK = 3, PW = OW * PK, PH = OH * PK, HUD_Y = 124, VOID_MIN = 125, PT = 16, PTW = OW / PT, PTH = OH / PT;
  const PAPER = [246, 241, 228], LEAD = [62, 62, 70];
  function makePencil() {
    const n = PW * PH;
    let seed = 0x2F6E2B1;
    const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const tmp = new Float32Array(n);
    /* 상자 흐림(반지름 r)을 가로·세로로. 세 번 거듭하면 가우스 흐림에 가깝다 */
    function box(a, r) {
      const w = 2 * r + 1;
      for (let y = 0; y < PH; y++) {
        const o = y * PW; let sum = 0;
        for (let x = -r; x <= r; x++) sum += a[o + (x < 0 ? 0 : x >= PW ? PW - 1 : x)];
        for (let x = 0; x < PW; x++) { tmp[o + x] = sum / w; const i0 = x - r, i1 = x + r + 1; sum += a[o + (i1 >= PW ? PW - 1 : i1)] - a[o + (i0 < 0 ? 0 : i0)]; }
      }
      for (let x = 0; x < PW; x++) {
        let sum = 0;
        for (let y = -r; y <= r; y++) sum += tmp[(y < 0 ? 0 : y >= PH ? PH - 1 : y) * PW + x];
        for (let y = 0; y < PH; y++) { a[y * PW + x] = sum / w; const i0 = y - r, i1 = y + r + 1; sum += tmp[(i1 >= PH ? PH - 1 : i1) * PW + x] - tmp[(i0 < 0 ? 0 : i0) * PW + x]; }
      }
    }
    /* 부드러운 잡음: 크기(sigma)와 세기(amp, 가장 큰 값) */
    function smooth(sigma, amp) {
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++) a[i] = rnd() + rnd() + rnd() - 1.5;
      const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
      box(a, r); box(a, r); box(a, r);
      let mx = 1e-9; for (let i = 0; i < n; i++) { const v = a[i] < 0 ? -a[i] : a[i]; if (v > mx) mx = v; }
      const k = amp / mx; for (let i = 0; i < n; i++) a[i] *= k;
      return a;
    }
    const wob = smooth(14, 3.0), mot = smooth(1.2, 0.22);
    for (let i = 0; i < n; i++) mot[i] += 0.82;
    /* 빗금: 비스듬한 줄 번호 d를 간격 p로 나눈 나머지가 굵기 t보다 작으면 줄이다 */
    const hatch = (d, p, t) => (d - Math.floor(d / p) * p < t ? 1 : 0);
    const TONE_F = [
      (d1, d2) => Math.max(Math.max(hatch(d1, 4, 1.8), hatch(d2, 4, 1.8)) * 0.85, 0.45),
      (d1, d2) => Math.max(hatch(d1, 6, 1.6), hatch(d2, 9, 1.4)) * 0.7,
      (d1) => hatch(d1, 9, 1.4) * 0.55,
      null,
      (d1) => hatch(d1, 26, 1.2) * 0.35,
    ];
    const T = TONE_F.map((f) => {
      if (!f) return null;
      const a = new Float32Array(n), o = new Uint8Array(n);
      for (let y = 0, i = 0; y < PH; y++) for (let x = 0; x < PW; x++, i++) { const w = wob[i], v = f(x + y + w, x - y + 1.3 * w) * mot[i]; a[i] = v > 1 ? 1 : v; }
      /* 줄 가장자리를 무르게(3칸 흐림) */
      const e = 0.138, c = 1 - 2 * e;
      for (let y = 0, i = 0; y < PH; y++) for (let x = 0; x < PW; x++, i++) tmp[i] = c * a[i] + e * (a[x ? i - 1 : i] + a[x < PW - 1 ? i + 1 : i]);
      for (let y = 0, i = 0; y < PH; y++) for (let x = 0; x < PW; x++, i++) o[i] = Math.round(255 * (c * tmp[i] + e * (tmp[y ? i - PW : i] + tmp[y < PH - 1 ? i + PW : i])));
      return o;
    });
    /* 윤곽선의 짙기(얼룩을 곱한 값)와 종이 */
    const MQ = new Uint8Array(n), paper = new Uint32Array(n);
    { const f = smooth(2.5, 5), g = smooth(40, 4);
      for (let i = 0; i < n; i++) {
        MQ[i] = Math.round(255 * Math.min(1, 0.8 * mot[i]));
        const d = f[i] + g[i], c8 = (v) => { v = Math.round(v + d); return v < 0 ? 0 : v > 255 ? 255 : v; };
        paper[i] = abgr(c8(PAPER[0]), c8(PAPER[1]), c8(PAPER[2]));
      } }
    const out = new Uint8ClampedArray(n * 4), o32 = new Uint32Array(out.buffer);
    const LEV = new Uint8Array(256); for (let i = 0; i < 256; i++) LEV[i] = i < 50 ? 0 : i < 130 ? 1 : i < 204 ? 2 : 3;
    const LB = new Uint8Array(SW * SH).fill(255), voidN = new Uint8Array(SW * SH), seen = new Uint8Array(SW * SH), stack = new Int32Array(SW * SH);
    const C = new Uint8Array(OW * OH), P = new Uint8Array(OW * OH).fill(255), dirty = new Uint8Array(PTW * PTH), tiles = new Uint16Array(PTW * PTH);
    const EW = PT * PK + 6, E = new Uint8Array(EW * EW), E2 = new Uint16Array(EW * EW);
    const pen = { out, w: PW, h: PH, tile: PT * PK, cols: PTW, tiles, n: 0, cls: C, voidN, T, MQ, paper };
    /* 배경에서 넓게 이어진 검정을 찾는다(네 방향으로 이어진 것끼리 한 덩이) */
    function findVoid() {
      seen.fill(0); voidN.fill(0);
      for (let s0 = 0; s0 < SW * SH; s0++) {
        if (seen[s0] || LB[s0]) continue;
        let top = 0, cnt = 0; stack[top++] = s0; seen[s0] = 1;
        while (cnt < top) {
          const i = stack[cnt++], x = i % SW;
          if (x > 0 && !seen[i - 1] && !LB[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
          if (x < SW - 1 && !seen[i + 1] && !LB[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
          if (i >= SW && !seen[i - SW] && !LB[i - SW]) { seen[i - SW] = 1; stack[top++] = i - SW; }
          if (i < SW * (SH - 1) && !seen[i + SW] && !LB[i + SW]) { seen[i + SW] = 1; stack[top++] = i + SW; }
        }
        if (cnt >= VOID_MIN) for (let k = 0; k < cnt; k++) voidN[stack[k]] = 1;
      }
    }
    const rowOn = new Uint8Array(EW);
    function tileDraw(tx, ty) {
      const x0 = tx * PT, y0 = ty * PT;
      /* 윤곽선: 표시된 칸(세 배로 3×3)을 칠하고 5칸 흐림([1 4 6 4 1]/16)을 가로·세로로. 표시가 없는 줄은 건너뛴다 */
      let any = 0;
      for (let hy = y0 - 1; hy <= y0 + PT; hy++) {
        if (hy < 0 || hy >= OH) continue;
        for (let hx = x0 - 1; hx <= x0 + PT; hx++) {
          if (hx < 0 || hx >= OW || !(P[hy * OW + hx] & 8)) continue;
          if (!any) { any = 1; E.fill(0); E2.fill(0); rowOn.fill(0); }
          const ex = (hx - x0 + 1) * PK, ey = (hy - y0 + 1) * PK;
          for (let q = 0; q < PK; q++) { const b = (ey + q) * EW + ex; E[b] = E[b + 1] = E[b + 2] = 255; rowOn[ey + q] = 1; }
        }
      }
      if (any) {
        for (let y = 0; y < EW; y++) { if (!rowOn[y]) continue; const b = y * EW; for (let x = 2; x < EW - 2; x++) E2[b + x] = E[b + x - 2] + 4 * E[b + x - 1] + 6 * E[b + x] + 4 * E[b + x + 1] + E[b + x + 2]; }
        for (let y = PK; y < EW - PK; y++) {
          const b = y * EW;
          if (!(rowOn[y - 2] | rowOn[y - 1] | rowOn[y] | rowOn[y + 1] | rowOn[y + 2])) { E.fill(0, b, b + EW); continue; }
          /* 흐린 값(0–255)에 1.5를 곱해 255에서 자른다 */
          for (let x = PK; x < EW - PK; x++) { const v = ((E2[b + x - 2 * EW] + 4 * E2[b + x - EW] + 6 * E2[b + x] + 4 * E2[b + x + EW] + E2[b + x + 2 * EW]) * 3) >> 9; E[b + x] = v > 255 ? 255 : v; }
        }
      }
      const lr = LEAD[0], lg = LEAD[1], lb = LEAD[2];
      for (let ry = 0; ry < PT; ry++) {
        const cb = (y0 + ry) * OW + x0;
        for (let q = 0; q < PK; q++) {
          const sy = ry * PK + q, eb = (sy + PK) * EW + PK; let o = (y0 * PK + sy) * PW + x0 * PK, sx = 0;
          for (let rx = 0; rx < PT; rx++) {
            const t = T[C[cb + rx]];
            for (let k = 0; k < PK; k++, o++, sx++) {
              let a = t ? t[o] : 0;
              if (any) { const e = (E[eb + sx] * MQ[o]) >> 8; if (e > a) a = e; }
              const p = paper[o];
              if (!a) { o32[o] = p; continue; }
              a += a >> 7;
              const r = p & 255, g = (p >> 8) & 255, b = (p >> 16) & 255;
              o32[o] = (0xFF000000 | ((b + (((lb - b) * a) >> 8)) << 16) | ((g + (((lg - g) * a) >> 8)) << 8) | (r + (((lr - r) * a) >> 8))) >>> 0;
            }
          }
        }
      }
    }
    /* g32: 그레이스케일 화면(320×288), spr: 주인공을 그린 자리(없으면 null), bgp: 스프라이트를 빼고 본 배경(160×144), spm: 스프라이트 자리.
       all이 참이면 모두 다시 그린다. 다시 그린 조각의 번호를 tiles[0..n)에 적는다 */
    pen.draw = (g32, spr, bgp, spm, all) => {
      let ch = 0;
      for (let i = 0; i < SW * SH; i++) { const l = LEV[bgp[i] & 255]; if (l !== LB[i]) { LB[i] = l; ch = 1; } }
      if (ch) findVoid();
      for (let y = 0, i = 0; y < OH; y++) {
        const ny = y >> 1, hud = ny >= HUD_Y, nb = ny * SW;
        for (let x = 0; x < OW; x++, i++) {
          const lev = LEV[g32[i] & 255], ni = nb + (x >> 1);
          C[i] = hud ? 3 - lev : (lev === 0 && voidN[ni] && !spm[ni] && !(spr && spr[i])) ? 4 : lev;
        }
      }
      if (all) P.fill(255);
      dirty.fill(0);
      for (let y = 0, i = 0; y < OH; y++) for (let x = 0; x < OW; x++, i++) {
        const c = C[i], v = c | ((x < OW - 1 && C[i + 1] !== c) || (y < OH - 1 && C[i + OW] !== c) ? 8 : 0);
        if (v === P[i]) continue;
        P[i] = v;
        const a = (x ? x - 1 : 0) >> 4, b = (x < OW - 1 ? x + 1 : x) >> 4, r0 = ((y ? y - 1 : 0) >> 4) * PTW, r1 = ((y < OH - 1 ? y + 1 : y) >> 4) * PTW;
        dirty[r0 + a] = dirty[r0 + b] = dirty[r1 + a] = dirty[r1 + b] = 1;
      }
      let k = 0;
      for (let t = 0; t < PTW * PTH; t++) if (dirty[t]) { tileDraw(t % PTW, (t / PTW) | 0); tiles[k++] = t; }
      pen.n = k;
      return pen;
    };
    return pen;
  }

  /* data: 자료 바이트 배열(롬과 같은 주소 배치), atlas: {rgba, w, h, frames:{'g_k':[x,y,w,h,ox,oy,rest]}}, makeCore: 핵심부 */
  function makeGame(makeCore, data, atlas, opts) {
    opts = opts || {};
    const G = decodeGroups(data);
    const A32C = new Uint32Array(atlas.rgba.buffer, atlas.rgba.byteOffset, atlas.rgba.byteLength >> 2), A32G = grayAtlas(A32C), AW = atlas.w;
    let A32 = A32G;
    const out = new Uint8ClampedArray(OW * OH * 4), out32 = new Uint32Array(out.buffer);
    const stat = { frames: 0, hero: 0, ok: 0, miss: 0, hidden: 0, wrong: 0 };
    const S = { mode: 'boot', swap: true, color: 0, front: true, info: null, stat, out, onEvent: opts.onEvent || null, onIo: opts.onIo || null };
    const tone = makeTone();
    const c = makeCore(data, { recolor: tone, onIo: (a, v, t) => { if (S.onIo) S.onIo(a, v, t); } });
    const m = c.m;
    /* 방 칸 종류(0–31)마다의 표시: 0x80·0x40이 '주인공 앞에 놓이는 칸'(왼쪽 반·오른쪽 반). 방 지도는 한 줄 11칸 */
    const FRONT = new Uint8Array(32), ROWOFF = [0, 0, 0], ROOMMAP = 0xC0AC;
    for (let i = 0; i < 32; i++) FRONT[i] = c.rd(0x15 + i);
    for (let i = 0; i < 3; i++) ROWOFF[i] = c.rd(7 + i);
    let atInit = false, pending = null;
    const emit = (type, info) => { if (S.onEvent) S.onEvent(type, info || {}); };
    const snapshot = () => ({ level: m[V.level], room: m[V.room], min: m[V.min], sec: m[V.sec], hp: m[V.hp], hpMax: m[V.hpMax] });

    /* ---- 흐름 ---- */
    /* 초기화가 끝난 자리(기억 장치 비우기·소리 장치·타일 조립표까지; 원작은 이다음에 로고를 띄운다): 멈추고 시작 카드를 기다린다 */
    c.flowHook(0x01D1, () => { atInit = true; if (S.mode !== 'title') { S.mode = 'title'; emit('title'); } c.brk(); return true; });
    /* 메뉴 방으로 가는 길은 모두 시작 카드로 돌린다 */
    c.flowHook(0x05B9, () => { S.mode = 'title'; atInit = false; emit('title'); c.brk(); return true; });
    /* 층을 마쳤다(원작은 여기서 암호 화면으로 간다): 다음 층으로 바로 넘기고, 이어하기 자료를 알린다 */
    c.flowHook(0x2306, () => {
      const lv = m[V.level]; if (lv >= 0x10) return false;
      emit('level', { cleared: lv, save: { level: lv + 1, min: m[V.min], sec: m[V.sec], hp: Math.max(1, m[V.hpMax]) } });
      c.pc = 0x0815; return true;
    });
    /* 음악(곡 번호 A를 받아 트는 자리): 끄면 0번(멈춤)으로 바꿔 넘긴다. 효과음은 다른 길(3AD9)이라 그대로 난다 */
    S.music = opts.music !== false;
    c.flowHook(0x3A91, () => { if (!S.music) c.setReg({ A: 0 }); return false; });
    /* 시간이 다 됐다 */
    c.flowHook(0x0885, () => { S.mode = 'over'; atInit = false; emit('timeover', snapshot()); c.brk(); return true; });
    /* 마지막 방에 들어섰다(원작의 끝 장면 자리) */
    c.flowHook(0x08B1, () => { S.mode = 'end'; atInit = false; emit('ending', snapshot()); c.brk(); return true; });

    function boot() {
      S.mode = 'boot'; atInit = false; c.setKeys(0);
      for (let i = 0; i < 400 && !atInit; i++) c.frame();
      if (!atInit) throw new Error('초기화가 끝나지 않았다');
    }
    /* save가 있으면 그 층의 처음부터(남은 시간·체력 칸 수 유지), 없으면 1층부터 */
    function start(save) {
      if (!atInit) { c.setReg({ ime: 0 }); c.pc = 0x0150; boot(); }
      c.wr(0xFF40, 0x81); c.wr(0xFF45, 0x67); c.wr(0xFF41, 0x40); m[0xFF0F] = 0; m[0xFFFF] = 2; m[V.tick] = 5; c.setReg({ ime: 1 });
      if (save && save.level >= 1 && save.level <= 15) { m[V.level] = save.level - 1; m[V.min] = Math.max(1, Math.min(60, save.min | 0)); m[V.sec] = Math.max(0, Math.min(59, save.sec | 0)); m[V.hpMax] = Math.max(1, Math.min(9, save.hp | 0)); c.pc = 0x0815; }
      else c.pc = 0x080C;
      atInit = false; S.mode = 'play'; hist.length = 0; last = null; S.info = null;
    }

    /* ---- 화면 합성 ---- */
    const hist = []; let last = null;
    const heroList = new Int32Array(SW * SH);
    /* 연필(색상 3)에서 쓰는 '주인공을 그린 자리'(320×288) */
    const sprHi = new Uint8Array(OW * OH); let pen = null, penAll = true;
    function ram() {
      const g = m[HERO.group], ptr = m[HERO.ptr] | (m[HERO.ptr + 1] << 8);
      let x = m[HERO.x], y = m[HERO.y]; if (x >= 200) x -= 256; if (y >= 200) y -= 256;
      const gr = G[g]; let k = -1;
      /* ptr는 다음에 그릴 장을 가리킨다: 지금 보이는 것은 그 앞 장 */
      if (gr) { const d = ptr - gr.base; if (d >= gr.cell && d % gr.cell === 0 && d / gr.cell <= gr.n) k = d / gr.cell - 1; }
      const fl = m[HERO.flip] ? 1 : 0; let xo = m[HERO.xo], yo = m[HERO.yo]; if (xo >= 128) xo -= 256; if (yo >= 128) yo -= 256;
      /* 묶음마다 x·y 밀림이 있고, 뒤집힌 그림은 16픽셀 칸의 오른쪽 끝에 맞춘다 */
      if (gr) { x = fl ? x + 16 - gr.W + xo : x - xo; y -= yo; }
      return { g, k, fl, x, y };
    }
    /* 후보 장이 화면에 실제로 보이는 주인공 픽셀을 모두 설명하는가 → 가려진 픽셀 수(−1이면 아님) */
    function test(cd, n) {
      const gr = G[cd.g]; if (!gr || cd.k < 0) return -1;
      const f = gr.frames[cd.k], W = gr.W, H = gr.H, ix = c.heroIx;
      for (let i = 0; i < n; i++) {
        const p = heroList[i], sx = p % SW, sy = (p / SW) | 0;
        let fx = sx - cd.x; const fy = sy - cd.y;
        if (fx < 0 || fy < 0 || fx >= W || fy >= H) return -1;
        if (cd.fl) fx = W - 1 - fx;
        if (f.px[fy * W + fx] !== ix[p]) return -1;
      }
      return f.cnt - n;
    }
    function blit(src) { for (let y = 0, i = 0; y < SH; y++) { let d = 2 * y * OW; for (let x = 0; x < SW; x++, i++, d += 2) { const v = src[i]; out32[d] = out32[d + 1] = out32[d + OW] = out32[d + OW + 1] = v; } } }
    function compose() {
      stat.frames++;
      const ix = c.heroIx; let n = 0;
      for (let i = 0; i < SW * SH; i++) if (ix[i]) heroList[n++] = i;
      const cur = ram(); let pick = null, best = 1e9;
      if (n && S.swap) {
        const cands = [cur].concat(hist); if (last) cands.push(last);
        for (const cd of cands) { const e = test(cd, n); if (e >= 0 && e < best) { best = e; pick = cd; } }
      }
      hist.unshift(cur); if (hist.length > 3) hist.pop();
      if (n) { stat.hero++; if (pick) stat.ok++; else if (S.swap) stat.miss++; }
      if (pick) last = pick;
      S.info = pick ? { g: pick.g, k: pick.k, fl: pick.fl, x: pick.x, y: pick.y, hidden: best } : null;
      const fr = pick && atlas.frames[pick.g + '_' + pick.k];
      const spr = S.color === 3 ? sprHi : null; if (spr) spr.fill(0);
      if (!fr) {
        blit(c.fb);
        if (spr) for (let k = 0; k < n; k++) { const p = heroList[k], d = 2 * ((p / SW) | 0) * OW + 2 * (p % SW); spr[d] = spr[d + 1] = spr[d + OW] = spr[d + OW + 1] = 1; }
        return out;
      }
      /* 바탕(주인공을 뺀 화면) → 아몰랑 → 맨 위 그림 */
      blit(c.base);
      const gr = G[pick.g], f = gr.frames[pick.k], W = gr.W, H = gr.H;
      const ax = fr[0], ay = fr[1], aw = fr[2], ah = fr[3], ox = fr[4], oy = fr[5], rest = fr[6];
      /* 주인공 스프라이트 칸마다의 '배경 뒤' 표시 */
      let anyPri = 0; const boxes = [];
      for (let i = 2; i < 17; i++) { const a = 0xFE00 + i * 4, y = m[a] - 16, x = m[a + 1] - 8; if (y <= -16 || y >= SH || x <= -8 || x >= SW) continue; const p = m[a + 3] >> 7; anyPri |= p; boxes.push(x, y, p); }
      const bgi = c.bgi; let hid = 0;
      /* 앞 칸(기둥·벽 앞면) 가림: 원작은 스프라이트 8픽셀 칸의 왼쪽 위 점이 놓인 방 칸(가로 16·세로 40픽셀)의 종류를 보고
         왼쪽 반(표시 0x80)·오른쪽 반(0x40)이 앞 칸이면 그 스프라이트 칸을 통째로 그리지 않는다(30F5). 아몰랑 그림은 더 크므로
         같은 판정을 원작 칸 격자에 맞춰 모든 픽셀에 적용한다. 아래 넷째 줄(화면 y ≥ 124)은 원작도 늘 감춘다 */
      let gx = pick.x & 7, gy = pick.y & 7;
      if (boxes.length) { gx = boxes[0] & 7; gy = boxes[1] & 7; }
      const frontAt = (qx, qy) => {
        const cx = qx - ((qx - gx) & 7), cy = qy - ((qy - gy) & 7);
        if (cx < 0 || cx >= SW) return 0;
        const row = cy < 4 ? 0 : ((cy - 4) / 40) | 0; if (row >= 3) return 1;
        return FRONT[m[ROOMMAP + ROWOFF[row] + (cx >> 4)] & 31] & ((cx & 8) ? 0x40 : 0x80);
      };
      const priAt = (qx, qy) => { let bd = 1e9, bv = 0; for (let j = 0; j < boxes.length; j += 3) { const dx = Math.max(boxes[j] - qx, 0, qx - boxes[j] - 7), dy = Math.max(boxes[j + 1] - qy, 0, qy - boxes[j + 1] - 15), d = dx + dy; if (d < bd) { bd = d; bv = boxes[j + 2]; } } return bv; };
      /* 문으로 들어가는 장면 등(rest): 원래 그림에서 3픽셀 넘게 떨어진 곳은 배경이 있으면 그리지 않는다 */
      let near = null;
      if (rest) {
        const L = [];
        for (let fy = 0; fy < H; fy++) for (let fx = 0; fx < W; fx++) if (f.px[fy * W + fx]) L.push(pick.x + (pick.fl ? W - 1 - fx : fx), pick.y + fy);
        near = (qx, qy) => { for (let j = 0; j < L.length; j += 2) { const dx = L[j] - qx, dy = L[j + 1] - qy; if (dx * dx + dy * dy <= 9) return true; } return false; };
      }
      for (let iy = 0; iy < ah; iy++) {
        const Y = 2 * pick.y + (iy - oy); if (Y < 0 || Y >= OH) continue;
        const qy = Y >> 1;
        for (let jx = 0; jx < aw; jx++) {
          const v = A32[(ay + iy) * AW + ax + jx]; if (!(v >>> 24)) continue;
          const fx2 = jx - ox, X = 2 * pick.x + (pick.fl ? 2 * W - 1 - fx2 : fx2); if (X < 0 || X >= OW) continue;
          const qx = X >> 1, b = bgi[qy * SW + qx];
          if (S.front && frontAt(qx, qy)) { hid++; if (ix[qy * SW + qx]) stat.wrong++; continue; }
          if (b & 3) {
            if ((b & 4) || (anyPri && priAt(qx, qy))) { hid++; continue; }
            if (near && !near(qx, qy)) { hid++; continue; }
          }
          out32[Y * OW + X] = v; if (spr) spr[Y * OW + X] = 1;
        }
      }
      if (hid) stat.hidden++;
      /* 맨 위 그림(원작이 주인공 앞에 그리는 것) */
      const ov = c.over;
      for (let y = 0, i = 0; y < SH; y++) { let d = 2 * y * OW; for (let x = 0; x < SW; x++, i++, d += 2) { const v = ov[i]; if (v) out32[d] = out32[d + 1] = out32[d + OW] = out32[d + OW + 1] = v; } }
      return out;
    }

    /* 한 화면 진행. 게임 중이 아니면 아무것도 하지 않는다 */
    function frame() {
      if (S.mode !== 'play') return false;
      c.frame();
      if (S.mode === 'play' || S.mode === 'over' || S.mode === 'end') compose();
      return true;
    }
    S.core = c; S.frame = frame; S.start = start; S.boot = boot; S.snapshot = snapshot;
    S.key = (name, down) => c.key(name, down); S.setKeys = (v) => c.setKeys(v);
    /* 색상: 0 그레이스케일 · 1 컬러(파스텔) · 2 본래 색 · 3 연필. 아몰랑 그림은 그레이스케일과 연필에서 네 단계 판을 쓴다.
       연필은 그레이스케일로 그린 화면을 S.pencil()이 세 배의 연필 그림으로 옮긴다(S.out은 그레이스케일 그대로) */
    S.setColor = (v) => {
      v = v === 1 || v === 2 || v === 3 ? v : 0; S.color = v; const gray = v === 0 || v === 3;
      A32 = gray ? A32G : A32C; tone.setMode(gray ? 0 : v); c.setRecolor(v === 2 ? null : tone);
      if (v === 3) { if (!pen) pen = makePencil(); penAll = true; sprHi.fill(0); }
    };
    /* 연필 화면: 지금의 S.out을 옮겨 { out, w, h, tile, cols, tiles, n }을 낸다. 바뀐 조각만 다시 그리고 그 번호를 tiles[0..n)에 적는다. 연필이 아니면 null */
    S.pencil = (all) => { if (S.color !== 3) return null; const p = pen.draw(out32, sprHi, c.bgp, c.spm, all || penAll); penAll = false; return p; };
    S.setMusic = (v) => { S.music = !!v; };
    S.dead = () => m[V.group] === 0x69;
    /* 저장·복원: 게임 중일 때만 낸다. 되돌린 뒤에는 그림 맞추기 기억을 비운다(다음 화면부터 다시 맞춘다) */
    S.saveState = () => (S.mode === 'play' ? c.save() : null);
    S.loadState = (b) => { if (!c.load(b)) return false; atInit = false; S.mode = 'play'; hist.length = 0; last = null; S.info = null; return true; };
    S.G = G;
    boot();
    return S;
  }
  /* 저장 묶음을 글자로: 같은 값이 이어지는 곳을 줄이고(PackBits) base64로 적는다 */
  function pack(b) {
    const o = []; let i = 0; const n = b.length;
    while (i < n) {
      let r = 1; while (i + r < n && r < 128 && b[i + r] === b[i]) r++;
      if (r >= 3) { o.push(257 - r, b[i]); i += r; continue; }
      const s = i; i += r;
      while (i < n && i - s < 128) { if (i + 2 < n && b[i] === b[i + 1] && b[i] === b[i + 2]) break; i++; }
      o.push(i - s - 1); for (let k = s; k < i; k++) o.push(b[k]);
    }
    let t = ''; for (let k = 0; k < o.length; k += 0x8000) t += String.fromCharCode.apply(null, o.slice(k, k + 0x8000));
    return btoa(t);
  }
  function unpack(text) {
    let t; try { t = atob(String(text)); } catch (e) { return null; }
    const o = []; let i = 0; const n = t.length;
    while (i < n) {
      const c = t.charCodeAt(i++);
      if (c < 128) { if (i + c + 1 > n) return null; for (let k = 0; k <= c; k++) o.push(t.charCodeAt(i++)); }
      else if (c > 128) { if (i >= n) return null; const v = t.charCodeAt(i++); for (let k = 257 - c; k > 0; k--) o.push(v); }
      else return null;
      if (o.length > 0x40000) return null;
    }
    return Uint8Array.from(o);
  }
  const api = { SW, SH, OW, OH, PW, PH, makeGame, makePencil, decodeGroups, makeTone, GRAY, INK, GOLD, PAPER, LEAD, pastelOf, grayLevel, pack, unpack };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DonghyunPe = api;
})(typeof self !== 'undefined' ? self : this);
