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
     0 그레이스케일: 흰 바탕 흑백 모니터에 CGA 네 색 화면을 띄웠을 때처럼 검정·어두운 회색·밝은 회색·흰색 네 단계로 그리고,
       주인공이 좌우로 가다 부딪히는 벽 옆면에만 다섯째 색인 깊은 회색을 쓴다.
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
  /* 벽 옆면의 깊은 회색: 검정과 어두운 회색 사이. 그레이스케일(색상 0)에서만 쓴다 */
  const DEEP = abgr(46, 49, 54);
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
        for (let k = k0; k < k0 + 4; k++) out[k] = mode === 1 ? pastelOf(raw[k], br && isBrick(raw[k])) : GRAY[grayLevel(raw[k])];
        /* 그레이스케일(0): 벽 옆면을 깊은 회색으로 칠한다. 연필(3)은 네 단계 그대로 둔다.
           지하 층(배경 팔레트 0의 첫 색이 회색이고 팔레트 2가 팔레트 1의 돌빛을 나눠 쓴다)의 벽 옆면은 팔레트 2의 둘째 색(팔레트 7의 첫 색도 같은 값)이다.
           궁전 층(팔레트 2가 팔레트 0의 주제색을 나눠 쓴다)의 벽 옆면은 팔레트 2의 첫 색이고, 바닥 무늬와 기둥의 어두운 쪽도 이 색이다 */
        if (mode === 0 && !obj) {
          if (hueOf(raw[0]) < 0) { if (raw[8] === raw[5] && raw[10] === raw[6] && hueOf(raw[9]) >= 0) { if (pi === 2) out[9] = DEEP; else if (pi === 7 && raw[28] === raw[9]) out[28] = DEEP; } }
          else if (pi === 2 && raw[8] === raw[0] && raw[10] === raw[2]) out[8] = DEEP;
        }
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
  /* 아몰랑 그림(스무 색)의 그레이스케일 판: 색마다 단계를 정한다.
     그레이스케일(색상 0): 머리(1d1b26)와 바지(7b8ac6)는 밝은 회색, 머리의 윤기(47435a)는 흰색, 바지 주름(5967a3)과 윤곽선은 어두운 회색, 살과 윗옷은 흰색.
     연필(색상 3)이 받아 쓰는 판(HERO_PEN)은 v0.60 그대로다: 바지는 어두운 회색, 바지 주름은 검정, 머리는 밝기대로 */
  const HERO_GRAY = { 0x7b8ac6: 2, 0x5967a3: 1, 0x1d1b26: 2, 0x47435a: 3 }, HERO_PEN = { 0x7b8ac6: 1, 0x5967a3: 0 };
  function grayAtlas(A32, HG) {
    const o = new Uint32Array(A32.length), memo = new Map();
    for (let i = 0; i < A32.length; i++) {
      const v = A32[i]; if (!(v >>> 24)) continue;
      let g = memo.get(v);
      if (g === undefined) { const key = ((v & 255) << 16) | (v & 0xFF00) | ((v >> 16) & 255); g = GRAY[key in HG ? HG[key] : grayLevel(v)]; memo.set(v, g); }
      o[i] = g;
    }
    return o;
  }


  /* ---- 연필(색상 3) ----
     그레이스케일 화면(320×288, 네 단계)을 세 배(960×864)의 종이 위 연필 그림으로 옮긴다. 원작 타일을 새로 그리는 것이 아니라 화면을 거른다.
     · 배경은 '종이 바다'처럼 다룬다. 면은 종이로 남기고 벽·기둥·바닥의 윤곽을 손으로 그은 선(조금씩 어긋나게 두 번)으로 긋는다.
       밝은 면은 아래·오른쪽 그늘에만 빗금을 넣고, 어두운 면일수록 빗금이 촘촘하다. 줄눈처럼 가는 줄은 선 하나로 줄인다.
     · 배경의 넓은 검정(원래 칸으로 125픽셀 이상 이어진 빈 곳)은 칠하지 않고 종이로 남기고 짧은 선만 드문드문 긋는다.
     · 스프라이트(주인공·경비병 등)는 둘레의 배경을 종이로 오려 낸 뒤 가는 획 셋을 겹쳐 윤곽을 긋는다. 획마다 자리와 누르는 힘이 달라
       선이 겹치고 벌어지고 끊긴다. 안쪽은 흰색을 종이로 두고 어두울수록 빗금을 촘촘히 넣는다.
     · 아래 띠(체력·시간·층 글자, y ≥ 124)는 뒤집어 그린다: 바탕은 종이, 글자는 짙게.
     손떨림·누르는 힘·종이결·빗금은 씨앗을 정한 난수로 한 번 만들어 화면에 고정하므로 가만히 있는 것은 떨지 않는다(움직이는 것의 윤곽은 자리마다 달리 그어진다).
     화면은 16×16(세 배로 48×48) 조각으로 나누어 바뀐 조각만 다시 그린다. 방이 바뀌면 스프라이트 둘레와 아래 띠를 먼저 그리고 나머지 배경은 몇 화면에 나누어 그린다 */
  const PK = 3, PW = OW * PK, PH = OH * PK, HUD_Y = 124, VOID_MIN = 125, MASS_MIN = 70, PT = 16, PTW = OW / PT, PTH = OH / PT;
  const PAPER = [238, 230, 209], FILL = [248, 243, 229], LEAD = [30, 30, 36];
  function makePencil() {
    const n = PW * PH;
    let seed = 0x2F6E2B1;
    const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const hsh = (a) => { a = Math.imul(a ^ (a >>> 15), 0x2C1B3C6D); a = Math.imul(a ^ (a >>> 12), 0x297A2D39); return ((a ^ (a >>> 15)) >>> 0) / 4294967296; };
    const c01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

    /* ---- 한 번 만들어 화면에 고정하는 것: 손떨림·누르는 힘·종이결·빈 곳의 짧은 선·종이 ---- */
    /* 부드러운 잡음(크기 sigma, 가장 큰 값 amp)을 dst에 더한다. 큰 잡음은 줄인 크기로 만들어 늘린다 */
    function addNoise(dst, sigma, amp) {
      const q = sigma >= 20 ? 8 : sigma >= 10 ? 4 : sigma >= 4 ? 2 : 1, w = Math.ceil(PW / q) + 2, h = Math.ceil(PH / q) + 2;
      const a = new Float32Array(w * h), t = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) a[i] = rnd() + rnd() + rnd() - 1.5;
      const s = sigma / q, r = Math.max(1, Math.round((Math.sqrt(4 * s * s + 1) - 1) / 2)), bw = 2 * r + 1;
      for (let pass = 0; pass < 3; pass++) {
        for (let y = 0; y < h; y++) {
          const o = y * w; let sum = 0;
          for (let x = -r; x <= r; x++) sum += a[o + (x < 0 ? 0 : x >= w ? w - 1 : x)];
          for (let x = 0; x < w; x++) { t[o + x] = sum / bw; const i0 = x - r, i1 = x + r + 1; sum += a[o + (i1 >= w ? w - 1 : i1)] - a[o + (i0 < 0 ? 0 : i0)]; }
        }
        for (let x = 0; x < w; x++) {
          let sum = 0;
          for (let y = -r; y <= r; y++) sum += t[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + x];
          for (let y = 0; y < h; y++) { a[y * w + x] = sum / bw; const i0 = y - r, i1 = y + r + 1; sum += t[(i1 >= h ? h - 1 : i1) * w + x] - t[(i0 < 0 ? 0 : i0) * w + x]; }
        }
      }
      let mx = 1e-9; for (let i = 0; i < w * h; i++) { const v = a[i] < 0 ? -a[i] : a[i]; if (v > mx) mx = v; }
      const k = amp / mx;
      if (q === 1) { for (let y = 0, i = 0; y < PH; y++) for (let x = 0; x < PW; x++, i++) dst[i] += k * a[y * w + x]; return; }
      for (let y = 0, i = 0; y < PH; y++) {
        const fy = y / q, j = fy | 0, v = fy - j, o0 = j * w, o1 = o0 + w;
        for (let x = 0; x < PW; x++, i++) { const fx = x / q, c = fx | 0, u = fx - c; dst[i] += k * ((a[o0 + c] * (1 - u) + a[o0 + c + 1] * u) * (1 - v) + (a[o1 + c] * (1 - u) + a[o1 + c + 1] * u) * v); }
      }
    }
    const f1 = new Float32Array(n), f2 = new Float32Array(n);
    /* 흔들림은 1/16픽셀 단위로 적는다(±7.5픽셀 안) */
    const toW = (f) => { const o = new Int8Array(n); for (let i = 0; i < n; i++) { const v = Math.round(f[i] * 16); o[i] = v < -120 ? -120 : v > 120 ? 120 : v; } return o; };
    const wob = (parts, base) => { if (base) f1.set(base); else f1.fill(0); for (let i = 0; i < parts.length; i += 2) addNoise(f1, parts[i], parts[i + 1]); return toW(f1); };
    /* 첫 획, 둘째 획(첫 획에서 조금 벗어난다), 빗금 자리 */
    const WX1 = wob([20, 3.1, 5, 1.5]); f2.set(f1); const WX2 = wob([12, 4.0, 4, 1.1], f2);
    const WY1 = wob([20, 3.1, 5, 1.5]); f2.set(f1); const WY2 = wob([12, 4.0, 4, 1.1], f2);
    const WX3 = wob([30, 3.4]), WY3 = wob([30, 3.4]);
    /* 빗금 자리로 흔들어 읽는 배경 칸(160×144)의 번호 */
    const CI3 = new Uint16Array(n);
    for (let y = 0, i = 0; y < PH; y++) for (let x = 0; x < PW; x++, i++) { let cx = Math.floor((x + WX3[i] / 16) / 6), cy = Math.floor((y + WY3[i] / 16) / 6); cx = cx < 0 ? 0 : cx >= SW ? SW - 1 : cx; cy = cy < 0 ? 0 : cy >= SH ? SH - 1 : cy; CI3[i] = cy * SW + cx; }
    const q8 = (v) => { v = Math.round(255 * v); return v < 0 ? 0 : v > 255 ? 255 : v; };
    const LQ1 = new Uint8Array(n), LQ2 = new Uint8Array(n), LQ3 = new Uint8Array(n), TQ = new Uint8Array(n), TQS = new Uint8Array(n), HB = new Uint8Array(n), VM = new Uint8Array(n), paper = new Uint32Array(n);
    {
      /* 종이결(tooth): 흑연이 묻는 자리와 비는 자리 */
      const tooth = new Float32Array(n), t = new Float32Array(n);
      for (let i = 0; i < n; i++) t[i] = (rnd() + rnd() + rnd() - 1.5) * 2;
      for (let y = 0, i = 0; y < PH; y++) for (let x = 0; x < PW; x++, i++) f1[i] = 0.5 * t[i] + 0.25 * (t[x ? i - 1 : i] + t[x < PW - 1 ? i + 1 : i]);
      for (let y = 0, i = 0; y < PH; y++) for (let x = 0; x < PW; x++, i++) tooth[i] = c01(0.5 + 1.6 * (0.5 * f1[i] + 0.25 * (f1[y ? i - PW : i] + f1[y < PH - 1 ? i + PW : i])));
      /* 누르는 힘(획마다 다르게)과 선이 끊기는 자리 */
      const p1 = new Float32Array(n), p2 = new Float32Array(n), p3 = new Float32Array(n), br = new Float32Array(n);
      addNoise(p1, 26, 0.2); addNoise(p1, 9, 0.16); addNoise(p2, 20, 0.2); addNoise(p2, 8, 0.2); addNoise(p3, 15, 0.5); addNoise(br, 5, 1);
      for (let i = 0; i < n; i++) {
        const gr = 1 - 0.646 * (1 - tooth[i]), grL = 1 - 0.92 * (1 - tooth[i]), b = br[i];
        const seg = Math.min(1, Math.max(0.5, 0.84 + 0.55 * b));
        LQ1[i] = q8(Math.min(1, Math.max(0.55, 0.92 + 1.3 * p1[i])) * seg * (0.24 + 0.76 * grL));
        LQ2[i] = q8(Math.min(1, Math.max(0.35, 0.8 + 1.3 * p2[i])) * Math.min(1, Math.max(0.35, 0.8 - 0.7 * b)) * (0.24 + 0.76 * grL));
        LQ3[i] = q8(Math.min(1, Math.max(0, 0.45 + 2.4 * p3[i])) * (0.24 + 0.76 * grL));
        const pt = Math.min(1, Math.max(0.5, 0.83 + p1[i]));
        TQ[i] = q8(pt * gr); TQS[i] = q8(pt * (0.55 + 0.45 * gr));
        HB[i] = q8(Math.min(1, Math.max(0.15, 0.75 + 0.9 * b)));
      }
      /* 빈 곳에 드문드문 긋는 짧은 선 */
      t.fill(0);
      for (let k = 0, cnt = Math.round(n / 11000); k < cnt; k++) {
        const x = rnd() * PW, y = rnd() * PH, L = 7 + rnd() * 13, an = -0.75 + (rnd() + rnd() + rnd() - 1.5) * 0.44, al = 0.35 + 0.4 * rnd(), wide = rnd() < 0.4, ca = Math.cos(an), sa = Math.sin(an);
        for (let s = -1; s <= 1; s += 0.4 / L) {
          const px = x + ca * L * s + Math.sin(s * 3.1) * 1.2, py = y + sa * L * s, ix = Math.floor(px), iy = Math.floor(py), u = px - ix, v = py - iy, e = al * (1 - s * s * 0.5);
          for (let d = 0; d < (wide ? 2 : 1); d++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
            const X = ix + i, Y = iy + j + d; if (X < 0 || Y < 0 || X >= PW || Y >= PH) continue;
            const w = e * (i ? u : 1 - u) * (j ? v : 1 - v) * 1.6, o = Y * PW + X; if (w > t[o]) t[o] = w;
          }
        }
      }
      for (let y = 0, i = 0; y < PH; y++) for (let x = 0; x < PW; x++, i++) VM[i] = q8(TQ[i] / 255 * 0.45 * Math.min(1, 0.6 * t[i] + 0.1 * (t[x ? i - 1 : i] + t[x < PW - 1 ? i + 1 : i] + t[y ? i - PW : i] + t[y < PH - 1 ? i + PW : i])));
      /* 종이 */
      f1.fill(0); addNoise(f1, 1.2, 4); addNoise(f1, 40, 4);
      const c8 = (v) => { v = Math.round(v); return v < 0 ? 0 : v > 255 ? 255 : v; };
      for (let i = 0; i < n; i++) { const d = f1[i]; paper[i] = abgr(c8(PAPER[0] + d), c8(PAPER[1] + 0.98 * d), c8(PAPER[2] + 0.9 * d)); }
    }

    /* ---- 화면에서 읽는 것 ---- */
    const NB = SW * SH, NC = OW * OH;
    const LEV = new Uint8Array(256); for (let i = 0; i < 256; i++) LEV[i] = i < 50 ? 0 : i < 130 ? 1 : i < 204 ? 2 : 3;
    /* 배경(160×144): 단계 LB, 빈 곳 voidN, 갈래 KB(0–3 단계 | 4 빈 곳 | 8 덩어리 | 16 가는 줄 | 32 아래 띠), 면 번호 comp */
    const LB = new Uint8Array(NB).fill(255), voidN = new Uint8Array(NB), KB = new Uint8Array(NB), comp = new Uint16Array(NB), SIG = new Uint32Array(NB);
    const seen = new Uint8Array(NB), stack = new Int32Array(NB), dil = new Uint8Array(NB);
    const cKey = new Int32Array(NB + 1), cBox = new Uint8Array(4 * (NB + 1)), cFlag = new Uint8Array(NB + 1);
    /* 화면(320×288): 갈래 C(16 아래 띠 | 8 스프라이트 | 단계) */
    const C = new Uint8Array(NC), P = new Uint8Array(NC).fill(255);
    const NT = PTW * PTH, pend = new Uint8Array(NT), tiles = new Uint16Array(NT);
    /* 조각마다 다시 셈할 네모(화면 칸; x0, x1, y0, y1이고 x0 ≥ x1이면 없다).
       fB: 배경의 흐린 표시, oB: 배경의 짙기, fS: 스프라이트·아래 띠의 흐린 표시, oF: 화면 */
    const rects = () => { const R = new Int16Array(4 * NT); noneR(R); return R; };
    const noneR = (R) => { for (let b = 0; b < 4 * NT; b += 4) { R[b] = R[b + 2] = 32767; R[b + 1] = R[b + 3] = -1; } };
    const fullT = (R, t) => { const tx = t % PTW, ty = (t / PTW) | 0, b = 4 * t; R[b] = tx * PT; R[b + 1] = (tx + 1) * PT; R[b + 2] = ty * PT; R[b + 3] = (ty + 1) * PT; };
    const fullR = (R) => { for (let t = 0; t < NT; t++) fullT(R, t); };
    const fB = rects(), oB = rects(), fS = rects(), oF = rects();
    /* 화면 칸 [x0, x1)×[y0, y1)에 걸친 조각마다 그 네모를 넓힌다 */
    function markR(R, x0, y0, x1, y1) {
      if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 > OW) x1 = OW; if (y1 > OH) y1 = OH;
      const ta = x0 >> 4, tb = (x1 - 1) >> 4, te = (y1 - 1) >> 4;
      for (let ty = y0 >> 4; ty <= te; ty++) {
        const ya = ty * PT > y0 ? ty * PT : y0, yb = (ty + 1) * PT < y1 ? (ty + 1) * PT : y1;
        for (let tx = ta, b = 4 * (ty * PTW + ta); tx <= tb; tx++, b += 4) {
          const xa = tx * PT > x0 ? tx * PT : x0, xb = (tx + 1) * PT < x1 ? (tx + 1) * PT : x1;
          if (xa < R[b]) R[b] = xa; if (xb > R[b + 1]) R[b + 1] = xb; if (ya < R[b + 2]) R[b + 2] = ya; if (yb > R[b + 3]) R[b + 3] = yb;
        }
      }
    }
    const out = new Uint8ClampedArray(n * 4), o32 = new Uint32Array(out.buffer), bgA = new Uint8Array(n);
    const pen = { out, w: PW, h: PH, tile: PT * PK, cols: PTW, tiles, n: 0, left: 0, cls: C, voidN, kb: KB, paper };
    const HR = HUD_Y;

    /* 이어진 덩이를 찾는다: fc[i]가 255가 아니고 값이 같은 이웃끼리 한 덩이다(eight이면 대각선도 이웃). 덩이마다 done(칸 수)를 부르고, 그 칸들은 stack[0..칸 수)에 있다 */
    const fc = new Uint8Array(NB);
    function flood(eight, done) {
      seen.fill(0);
      for (let s0 = 0; s0 < HR * SW; s0++) {
        if (seen[s0] || fc[s0] === 255) continue;
        const v = fc[s0]; let top = 0, cnt = 0; stack[top++] = s0; seen[s0] = 1;
        while (cnt < top) {
          const i = stack[cnt++], x = i % SW, up = i >= SW, dn = i < (HR - 1) * SW; let j;
          if (x > 0) {
            j = i - 1; if (!seen[j] && fc[j] === v) { seen[j] = 1; stack[top++] = j; }
            if (eight) { if (up) { j = i - SW - 1; if (!seen[j] && fc[j] === v) { seen[j] = 1; stack[top++] = j; } } if (dn) { j = i + SW - 1; if (!seen[j] && fc[j] === v) { seen[j] = 1; stack[top++] = j; } } }
          }
          if (x < SW - 1) {
            j = i + 1; if (!seen[j] && fc[j] === v) { seen[j] = 1; stack[top++] = j; }
            if (eight) { if (up) { j = i - SW + 1; if (!seen[j] && fc[j] === v) { seen[j] = 1; stack[top++] = j; } } if (dn) { j = i + SW + 1; if (!seen[j] && fc[j] === v) { seen[j] = 1; stack[top++] = j; } } }
          }
          if (up) { j = i - SW; if (!seen[j] && fc[j] === v) { seen[j] = 1; stack[top++] = j; } }
          if (dn) { j = i + SW; if (!seen[j] && fc[j] === v) { seen[j] = 1; stack[top++] = j; } }
        }
        done(cnt);
      }
    }
    function analyze() {
      /* 빈 곳: 넓게 이어진 검정(네 방향) */
      voidN.fill(0);
      for (let i = 0; i < HR * SW; i++) fc[i] = LB[i] ? 255 : 0;
      flood(false, (cnt) => { if (cnt >= VOID_MIN) for (let k = 0; k < cnt; k++) voidN[stack[k]] = 1; });
      for (let i = 0; i < NB; i++) KB[i] = i >= HR * SW ? 32 : voidN[i] ? 4 : LB[i];
      /* 덩어리: 빈 곳이 아닌 칸이 여덟 방향으로 70칸 넘게 이어진 것(벽·바닥). 그보다 작은 것은 벽의 금·횃불 같은 작은 것이다 */
      for (let i = 0; i < HR * SW; i++) fc[i] = voidN[i] ? 255 : 0;
      flood(true, (cnt) => { if (cnt >= MASS_MIN) for (let k = 0; k < cnt; k++) KB[stack[k]] |= 8; });
      /* 가는 줄(줄눈·점): 둘레 3×3에서 가장 밝은 값을 구하고, 다시 3×3에서 가장 어두운 값을 구했을 때보다 어두운 칸 */
      for (let y = 0, i = 0; y < HR; y++) for (let x = 0; x < SW; x++, i++) {
        let mx = 0;
        for (let j = y ? -1 : 0; j <= (y < HR - 1 ? 1 : 0); j++) for (let k = x ? -1 : 0; k <= (x < SW - 1 ? 1 : 0); k++) { const v = LB[i + j * SW + k]; if (v > mx) mx = v; }
        dil[i] = mx;
      }
      for (let y = 0, i = 0; y < HR; y++) for (let x = 0; x < SW; x++, i++) {
        if (!(KB[i] & 8)) continue;
        let mn = 3;
        for (let j = y ? -1 : 0; j <= (y < HR - 1 ? 1 : 0); j++) for (let k = x ? -1 : 0; k <= (x < SW - 1 ? 1 : 0); k++) { const v = dil[i + j * SW + k]; if (v < mn) mn = v; }
        if (LB[i] < mn) KB[i] |= 16;
      }
      /* 면: 같은 단계로 이어진 덩이(네 방향). 번호마다 첫 칸·둘레 상자·넓이 표시(1 넓다 · 2 꽤 넓다)를 적는다 */
      comp.fill(0); let id = 0;
      for (let i = 0; i < HR * SW; i++) fc[i] = voidN[i] ? 255 : LB[i];
      flood(false, (cnt) => {
        id++; let x0 = SW, x1 = 0, y0 = SH, y1 = 0;
        for (let k = 0; k < cnt; k++) { const i = stack[k], x = i % SW, y = (i / SW) | 0; comp[i] = id; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        cKey[id] = stack[0]; cBox[4 * id] = x0; cBox[4 * id + 1] = y0; cBox[4 * id + 2] = x1 - x0 + 1; cBox[4 * id + 3] = y1 - y0 + 1; cFlag[id] = (cnt > 260 ? 1 : 0) | (cnt > 40 ? 2 : 0);
      });
      /* 칸마다의 지문: 갈래와, 그 칸의 그림을 정하는 면의 값. 지문이 바뀐 칸 둘레의 조각을 다시 그린다 */
      for (let i = 0; i < NB; i++) {
        const k = KB[i], id2 = comp[i], lv = k & 3; let s = k;
        if (id2 && lv < 3) {
          let h = Math.imul(cKey[id2] + 1, 0x9E3779B1);
          if (lv === 2) h ^= Math.imul((cBox[4 * id2] | (cBox[4 * id2 + 1] << 8) | (cBox[4 * id2 + 2] << 16) | (cBox[4 * id2 + 3] << 24)) + (cFlag[id2] & 1), 0x85EBCA6B);
          else if (lv === 1) h ^= cFlag[id2] & 2 ? 0x51ED270B : 0;
          s |= (h ^ (h >>> 13)) << 8;
        }
        s >>>= 0;
        if (s !== SIG[i]) { SIG[i] = s; const x = 2 * (i % SW), y = 2 * ((i / SW) | 0); markR(fB, x - RB, y - RB, x + 2 + RB, y + 2 + RB); markR(oB, x - RP, y - RP, x + 2 + RP, y + 2 + RP); }
      }
    }
    /* ---- 흐린 표시 ----
       갈래마다 '그 갈래인가'(0/1)를 흐려서 화면 전체(둘레로 EG칸 더)에 둔다. 점마다 흔들린 자리에서 그 값을 읽으면,
       값이 0.5를 지나는 자리가 선이다: 표시를 흐리면 계단이 무뎌지고, 읽는 자리를 흔들면 선이 삐뚤어진다.
       갈래가 바뀐 칸의 둘레만 다시 셈한다: 흐린 표시는 흐림이 닿는 거리(배경 RB칸, 스프라이트·아래 띠 RG칸)까지,
       그림은 거기에 흔들림(2.5칸)과 읽는 칸(1칸)을 더한 거리(배경 RP칸, 스프라이트·아래 띠 RO칸)까지 */
    const EG = 4, RG = 5, RO = 9, RB = 4, RP = 8, WR = RG + 2, IW = PT + EG + 2 * WR, OFF = EG * 48 - 24;
    const GW = OW + 2 * EG, GH = OH + 2 * EG, gfl = () => new Float32Array(GW * GH);
    const cw = new Uint8Array(IW * IW), ind = new Float32Array(IW * IW), tmp = new Float32Array(IW * IW);
    const gk = (s, rm) => { const r = Math.min(rm || RG, Math.ceil(3 * s)), w = new Float32Array(2 * r + 1); let sum = 0; for (let i = -r; i <= r; i++) sum += w[i + r] = Math.exp(-i * i / (2 * s * s)); for (let i = 0; i < w.length; i++) w[i] /= sum; return w; };
    const tbl = (f) => { const t = new Uint8Array(64); for (let i = 0; i < 64; i++) t[i] = f(i) ? 1 : 0; return t; };
    /* 배경: 덩어리 Fm, 단계 G1–G3(빈 곳·아래 띠는 뺀다), 가는 줄 TH. AB는 선이 지나는 칸의 표시 */
    const Fm = gfl(), G1 = gfl(), G2 = gfl(), G3 = gfl(), TH = gfl(), AB = new Uint8Array(GW * GH);
    const BF = [[Fm, gk(1.25), tbl((k) => k & 8)], [G1, gk(1.15), tbl((k) => !(k & 36) && (k & 3) >= 1)], [G2, gk(1.15), tbl((k) => !(k & 36) && (k & 3) >= 2)], [G3, gk(1.15), tbl((k) => !(k & 36) && (k & 3) >= 3)], [TH, gk(1.6, RB), tbl((k) => k & 16)]];
    /* 스프라이트: 오려 내는 자리 CUT(두 칸 넓힌 것), 윤곽 SIL·SILB, 안쪽 단계 I1–I3. 아래 띠: 단계 H1–H3(띠 밖은 1) */
    const CUT = gfl(), SIL = gfl(), SILB = gfl(), I1 = gfl(), I2 = gfl(), I3 = gfl(), H1 = gfl().fill(1), H2 = gfl().fill(1), H3 = gfl().fill(1);
    const TS = tbl((c) => c & 8), K100 = gk(1.0), K080 = gk(0.8), K062 = gk(0.62), K130 = gk(1.3);
    const SF = [[SIL, K080, TS], [SILB, K130, TS], [I1, K062, tbl((c) => (c & 8) && (c & 3) >= 1)], [I2, K062, tbl((c) => (c & 8) && (c & 3) >= 2)], [I3, K062, tbl((c) => (c & 8) && (c & 3) >= 3)]];
    const HF = [[H1, K062, tbl((c) => !(c & 16) || (c & 3) >= 1)], [H2, K062, tbl((c) => !(c & 16) || (c & 3) >= 2)], [H3, K062, tbl((c) => !(c & 16) || (c & 3) >= 3)]];
    const fillR = (dst, v, gx0, gy0, rw, rh) => { for (let j = 0; j < rh; j++) { const o = (gy0 + EG + j) * GW + gx0 + EG; dst.fill(v, o, o + rw); } };
    /* 창 cw(네모 둘레로 WR칸 더 본 갈래)에서 표 tb로 고른 표시를 흐려 dst의 네모에 적는다. wide이면 표시를 두 칸 넓힌 뒤에 흐린다 */
    function blurR(dst, kn, tb, gx0, gy0, rw, rh, wide) {
      const ww = rw + 2 * WR, wh = rh + 2 * WR, d = (kn.length - 1) >> 1; let any = 0, all = 1;
      for (let j = 0; j < wh; j++) for (let i = 0, o = j * IW; i < ww; i++, o++) { const v = tb[cw[o]]; ind[o] = v; if (v) any = 1; else all = 0; }
      if (!any || all) { fillR(dst, any, gx0, gy0, rw, rh); return; }
      if (wide) {
        tmp.set(ind);
        for (let j = 2; j < wh - 2; j++) for (let i = 2, o = j * IW + 2; i < ww - 2; i++, o++) {
          ind[o] = tmp[o] || tmp[o - 1] || tmp[o + 1] || tmp[o - IW] || tmp[o + IW] || tmp[o - 2] || tmp[o + 2] || tmp[o - 2 * IW] || tmp[o + 2 * IW] || tmp[o - IW - 1] || tmp[o - IW + 1] || tmp[o + IW - 1] || tmp[o + IW + 1] ? 1 : 0;
        }
      }
      for (let j = WR - d; j < wh - WR + d; j++) for (let i = 0, o = j * IW + WR, b = j * IW + WR - d; i < rw; i++, o++, b++) { let sum = 0; for (let q = 0; q < kn.length; q++) sum += kn[q] * ind[b + q]; tmp[o] = sum; }
      for (let j = 0; j < rh; j++) for (let i = 0, o = (gy0 + EG + j) * GW + gx0 + EG, b = (j + WR - d) * IW + WR; i < rw; i++, o++, b++) { let sum = 0; for (let q = 0; q < kn.length; q++) sum += kn[q] * tmp[b + q * IW]; dst[o] = sum; }
    }
    /* 배경의 흐린 표시를 네모만큼 다시 셈한다(화면 가장자리에 닿은 네모는 둘레 EG칸까지) */
    function fieldsB(x0, x1, y0, y1) {
      if (x0 === 0) x0 = -EG; if (x1 === OW) x1 = OW + EG; if (y0 === 0) y0 = -EG; if (y1 === OH) y1 = OH + EG;
      const rw = x1 - x0, rh = y1 - y0;
      for (let j = 0; j < rh + 2 * WR; j++) { let y = (y0 - WR + j) >> 1; y = y < 0 ? 0 : y >= SH ? SH - 1 : y; for (let i = 0, o = j * IW; i < rw + 2 * WR; i++, o++) { let x = (x0 - WR + i) >> 1; x = x < 0 ? 0 : x >= SW ? SW - 1 : x; cw[o] = KB[y * SW + x]; } }
      for (let f = 0; f < 5; f++) blurR(BF[f][0], BF[f][1], BF[f][2], x0, y0, rw, rh, 0);
    }
    /* 스프라이트·아래 띠의 흐린 표시를 네모만큼 다시 셈한다 */
    function fieldsS(x0, x1, y0, y1) {
      if (x0 === 0) x0 = -EG; if (x1 === OW) x1 = OW + EG; if (y0 === 0) y0 = -EG; if (y1 === OH) y1 = OH + EG;
      const rw = x1 - x0, rh = y1 - y0; let v = 0;
      for (let j = 0; j < rh + 2 * WR; j++) { let y = y0 - WR + j; y = y < 0 ? 0 : y >= OH ? OH - 1 : y; for (let i = 0, o = j * IW; i < rw + 2 * WR; i++, o++) { let x = x0 - WR + i; x = x < 0 ? 0 : x >= OW ? OW - 1 : x; v |= cw[o] = C[y * OW + x]; } }
      if (v & 8) { blurR(CUT, K100, TS, x0, y0, rw, rh, 1); for (let f = 0; f < 5; f++) blurR(SF[f][0], SF[f][1], SF[f][2], x0, y0, rw, rh, 0); }
      else { fillR(CUT, 0, x0, y0, rw, rh); for (let f = 0; f < 5; f++) fillR(SF[f][0], 0, x0, y0, rw, rh); }
      if (v & 16) for (let f = 0; f < 3; f++) blurR(HF[f][0], HF[f][1], HF[f][2], x0, y0, rw, rh, 0);
      else for (let f = 0; f < 3; f++) fillR(HF[f][0], 1, x0, y0, rw, rh);
    }
    /* 선: 흐린 값 v가 0.5를 지나는 자리 둘레의 띠. k는 흐림 크기에 맞춘 값(값의 차이 → 픽셀 거리), half는 선의 반 굵기 */
    const SOFT = 1.0;
    const band = (v, k, half) => { const d = (half - (v < 0.5 ? 0.5 - v : v - 0.5) * k) / SOFT + 0.5; return d <= 0 ? 0 : d > 1 ? 1 : d; };
    const KS = (s) => s * 2.5066 * PK;
    const S125 = KS(1.25), S115 = KS(1.15), S080 = KS(0.8), S062 = KS(0.62), S130 = KS(1.3);
    const acc = (a, b) => a + b - a * b;
    /* 빗금: 비스듬한 자리 t를 간격 gap으로 나눈 줄마다 굵기 width의 획. 획마다 짙기와 자리가 조금씩 다르다 */
    const hat = (t, gap, width, key) => {
      const u = t / gap, nn = Math.floor(u), hh = hsh(nn * 977 + key); let fr = (u - nn - 0.5 + (((hh * 64) % 1) - 0.5) * 0.46) * gap; if (fr < 0) fr = -fr;
      const c = width * 0.5 + 0.5 - fr; return c <= 0 ? 0 : (c > 1 ? 1 : c) * (0.3 + 0.7 * hh);
    };
    const CA = Math.cos(-0.9), SA = Math.sin(-0.9), CB = Math.cos(0.55), SB = Math.sin(0.55), CC = Math.cos(-0.5), SC = Math.sin(-0.5);

    /* 값이 0.5±d 사이를 지나는 칸(네 귀퉁이의 가장 작은 값과 큰 값이 그 사이를 걸치는 칸)에 표시한다. 나머지 칸에는 선이 없다 */
    const D125 = (0.85 + 0.5 * SOFT) / S125, D115 = (0.8 + 0.5 * SOFT) / S115;
    function flagsB(x0, x1, y0, y1) {
      if (x0 === 0) x0 = -EG; if (x1 === OW) x1 = OW + EG; if (y0 === 0) y0 = -EG; if (y1 === OH) y1 = OH + EG;
      /* 칸의 표시는 오른쪽·아래 이웃의 값도 보므로 왼쪽·위로 한 칸 더 셈한다 */
      let gx0 = x0 + EG - 1, gx1 = x1 + EG, gy0 = y0 + EG - 1, gy1 = y1 + EG; if (gx0 < 0) gx0 = 0; if (gy0 < 0) gy0 = 0; if (gx1 > GW - 1) gx1 = GW - 1; if (gy1 > GH - 1) gy1 = GH - 1;
      for (let j = gy0; j < gy1; j++) for (let i = gx0, a = j * GW + gx0; i < gx1; i++, a++) {
        let v = 0;
        for (let f = 0; f < 4; f++) { const F = BF[f][0], p = F[a], q = F[a + 1], r = F[a + GW], t = F[a + GW + 1], mn = Math.min(p, q, r, t), mx = Math.max(p, q, r, t), d = f ? D115 : D125; if (mn < 0.5 + d && mx > 0.5 - d) v |= 1 << f; }
        AB[a] = v;
      }
    }

    /* 배경의 짙기(선과 면)를 네모(화면 칸)만큼 bgA에 적는다 */
    function drawB(x0, x1, y0, y1) {
      for (let Y = y0 * PK; Y < y1 * PK; Y++) {
        let o = Y * PW + x0 * PK;
        for (let X = x0 * PK; X < x1 * PK; X++, o++) {
          let ln = 0, tn = 0;
          const hudS = Y + WY1[o] / 16 >= HUD_Y * 6;
          if (!hudS) {
            /* 선: 값이 0.5 둘레를 지나는 칸(AB에 표시)에서만 셈한다 */
            let U = X * 16 + WX1[o] + OFF, V = Y * 16 + WY1[o] + OFF, i0 = (U / 48) | 0, j0 = (V / 48) | 0;
            const a = j0 * GW + i0, fa = AB[a], ux = (U - i0 * 48) / 48, uy = (V - j0 * 48) / 48;
            U = X * 16 + WX2[o] + OFF; V = Y * 16 + WY2[o] + OFF; i0 = (U / 48) | 0; j0 = (V / 48) | 0;
            const b = j0 * GW + i0, fb = AB[b];
            if (fa | fb) {
              const fx = (U - i0 * 48) / 48, fy = (V - j0 * 48) / 48, q1 = LQ1[o] / 255, q2 = LQ2[o] / 255;
              const w00 = (1 - ux) * (1 - uy), w10 = ux * (1 - uy), w01 = (1 - ux) * uy, w11 = ux * uy, v00 = (1 - fx) * (1 - fy), v10 = fx * (1 - fy), v01 = (1 - fx) * fy, v11 = fx * fy;
              let md1 = 0, md2 = 0, t;
              if (fa & 1) ln = 0.84 * band(Fm[a] * w00 + Fm[a + 1] * w10 + Fm[a + GW] * w01 + Fm[a + GW + 1] * w11, S125, 0.85) * q1;
              if (fb & 1) ln = acc(ln, 0.72 * band(Fm[b] * v00 + Fm[b + 1] * v10 + Fm[b + GW] * v01 + Fm[b + GW + 1] * v11, S125, 0.7) * q2);
              if (fa & 2) md1 = band(G1[a] * w00 + G1[a + 1] * w10 + G1[a + GW] * w01 + G1[a + GW + 1] * w11, S115, 0.8);
              if (fa & 4) { t = band(G2[a] * w00 + G2[a + 1] * w10 + G2[a + GW] * w01 + G2[a + GW + 1] * w11, S115, 0.8); if (t > md1) md1 = t; }
              if (fa & 8) { t = band(G3[a] * w00 + G3[a + 1] * w10 + G3[a + GW] * w01 + G3[a + GW + 1] * w11, S115, 0.8); if (t > md1) md1 = t; }
              if (fb & 2) md2 = band(G1[b] * v00 + G1[b + 1] * v10 + G1[b + GW] * v01 + G1[b + GW + 1] * v11, S115, 0.64);
              if (fb & 4) { t = band(G2[b] * v00 + G2[b + 1] * v10 + G2[b + GW] * v01 + G2[b + GW + 1] * v11, S115, 0.64); if (t > md2) md2 = t; }
              if (fb & 8) { t = band(G3[b] * v00 + G3[b + 1] * v10 + G3[b + GW] * v01 + G3[b + GW + 1] * v11, S115, 0.64); if (t > md2) md2 = t; }
              if (md1 > 0 || md2 > 0) {
                /* 덩어리 안의 선은 조금 옅게, 줄눈 둘레는 더 옅게, 작은 것은 가장 옅게 */
                const m1 = Fm[a] * w00 + Fm[a + 1] * w10 + Fm[a + GW] * w01 + Fm[a + GW + 1] * w11, th = c01(2.2 * (TH[a] * w00 + TH[a + 1] * w10 + TH[a + GW] * w01 + TH[a + GW + 1] * w11));
                const md = acc(md1 * q1, 0.6 * md2 * q2) * (0.55 + c01(2 * m1) * (0.25 - 0.38 * th));
                if (md > ln) ln = md;
              }
            }
            /* 면: 빗금 자리(W3)로 흔들어 읽은 칸의 갈래와 면 번호 */
            const ci = CI3[o], k = KB[ci];
            if (k & 4) tn = VM[o] / 255;
            else if (!(k & 32) && (k & 3) < 3) {
              const id = comp[ci], key = cKey[id] * 31, lv = k & 3, hx = X + WX3[o] / 16, hy = Y + WY3[o] / 16, tA = hx * CA + hy * SA; let h;
              if (lv === 2) {
                /* 종이 바다처럼: 면은 종이로 두고 아래·오른쪽 그늘에만 빗금. 넓은 면은 온통 옅게 */
                let sh = 0.5;
                if (!(cFlag[id] & 1)) { const gy = (hy / 6 - cBox[4 * id + 1]) / cBox[4 * id + 3], gx = (hx / 6 - cBox[4 * id]) / cBox[4 * id + 2]; sh = c01((Math.max(gy, gx * 0.9) - 0.56) / 0.12); }
                h = sh > 0 ? hat(tA, 5.2, 1.15, key) * 0.46 * sh : 0;
              } else if (lv === 1) {
                h = hat(tA, 4.0, 1.15, key) * 0.54;
                if (cFlag[id] & 2) { const h2 = hat(hx * CB + hy * SB, 4.8, 1.1, key + 7) * 0.21; if (h2 > h) h = h2; }
              } else {
                h = hat(tA, 3.3, 1.15, key) * 0.75; const h2 = hat(hx * CB + hy * SB, 3.96, 1.1, key + 7) * 0.6; if (h2 > h) h = h2;
              }
              h = h * HB[o] / 255; if (lv === 0 && h < 0.22) h = 0.22;
              if (k & 16) h *= 0.15;
              tn = h * TQ[o] / 255;
            }
          }
          const a8 = 255 * (ln > tn ? ln : tn);
          bgA[o] = a8 > 255 ? 255 : a8 + 0.5;
        }
      }
    }

    /* 네모와 그 둘레 RO칸 안에 스프라이트가 있는가 */
    function near(x0, x1, y0, y1) {
      x0 -= RO; if (x0 < 0) x0 = 0; x1 += RO; if (x1 > OW) x1 = OW; y0 -= RO; if (y0 < 0) y0 = 0; y1 += RO; if (y1 > OH) y1 = OH;
      for (let y = y0; y < y1; y++) for (let x = x0, i = y * OW + x0; x < x1; x++, i++) if (C[i] & 8) return 1;
      return 0;
    }
    function blank(tx, ty) { for (let py = 0; py < 48; py++) { const o = (ty * 48 + py) * PW + tx * 48; o32.set(paper.subarray(o, o + 48), o); } }
    /* 네모(화면 칸)를 화면에 올린다: 배경 짙기(bgA) 위에 스프라이트(종이로 오려 내고 윤곽·빗금)와 아래 띠를 얹는다 */
    const lr = LEAD[0], lg = LEAD[1], lb = LEAD[2], dR = FILL[0] - PAPER[0], dG = FILL[1] - PAPER[1], dB = FILL[2] - PAPER[2];
    function drawF(x0, x1, y0, y1) {
      const hud = y1 + 3 > HUD_Y * 2, anyS = near(x0, x1, y0, y1);
      if (!anyS && !hud) {
        for (let Y = y0 * PK; Y < y1 * PK; Y++) { let o = Y * PW + x0 * PK; for (let X = x0 * PK; X < x1 * PK; X++, o++) { let a = bgA[o]; const p = paper[o]; if (!a) { o32[o] = p; continue; } a += a >> 7; const r = p & 255, g = (p >> 8) & 255, b = (p >> 16) & 255; o32[o] = (0xFF000000 | ((b + (((lb - b) * a) >> 8)) << 16) | ((g + (((lg - g) * a) >> 8)) << 8) | (r + (((lr - r) * a) >> 8))) >>> 0; } }
        return;
      }
      for (let Y = y0 * PK; Y < y1 * PK; Y++) {
        let o = Y * PW + x0 * PK;
        for (let X = x0 * PK; X < x1 * PK; X++, o++) {
          let U = X * 16 + WX1[o] + OFF, V = Y * 16 + WY1[o] + OFF, i0 = (U / 48) | 0, j0 = (V / 48) | 0, fx = (U - i0 * 48) / 48, fy = (V - j0 * 48) / 48;
          const a = j0 * GW + i0, w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
          let cut = 0, al = bgA[o] / 255;
          const hudS = Y + WY1[o] / 16 >= HUD_Y * 6;
          if (hudS || (anyS && (cut = CUT[a] * w00 + CUT[a + 1] * w10 + CUT[a + GW] * w01 + CUT[a + GW + 1] * w11) > 0.004)) {
            const U2 = X * 16 + WX2[o] + OFF, V2 = Y * 16 + WY2[o] + OFF; i0 = (U2 / 48) | 0; j0 = (V2 / 48) | 0; fx = (U2 - i0 * 48) / 48; fy = (V2 - j0 * 48) / 48;
            const b = j0 * GW + i0, v00 = (1 - fx) * (1 - fy), v10 = fx * (1 - fy), v01 = (1 - fx) * fy, v11 = fx * fy;
            const q1 = LQ1[o] / 255, q2 = LQ2[o] / 255, hb = HB[o] / 255, hx = X + WX3[o] / 16, hy = Y + WY3[o] / 16, tA = hx * CA + hy * SA;
            let ln = 0, tn = 0;
            if (hudS) {
              /* 아래 띠: 뒤집어서 바탕은 종이, 글자는 짙게 */
              const h1 = H1[a] * w00 + H1[a + 1] * w10 + H1[a + GW] * w01 + H1[a + GW + 1] * w11, h2 = H2[a] * w00 + H2[a + 1] * w10 + H2[a + GW] * w01 + H2[a + GW + 1] * w11, h3 = H3[a] * w00 + H3[a + 1] * w10 + H3[a + GW] * w01 + H3[a + GW + 1] * w11;
              let e1 = band(h1, S062, 0.7), e2 = band(H1[b] * v00 + H1[b + 1] * v10 + H1[b + GW] * v01 + H1[b + GW + 1] * v11, S062, 0.55), t;
              t = band(h2, S062, 0.7); if (t > e1) e1 = t; t = band(H2[b] * v00 + H2[b + 1] * v10 + H2[b + GW] * v01 + H2[b + GW + 1] * v11, S062, 0.55); if (t > e2) e2 = t;
              t = band(h3, S062, 0.7); if (t > e1) e1 = t; t = band(H3[b] * v00 + H3[b + 1] * v10 + H3[b + GW] * v01 + H3[b + GW + 1] * v11, S062, 0.55); if (t > e2) e2 = t;
              ln = acc(0.9 * e1 * q1, 0.6 * e2 * q2);
              if (h1 < 0.5) { tn = Math.max(hat(tA, 2.6, 1.5, 5), hat(hx * CB + hy * SB, 2.9, 1.4, 6)) * 0.9 * hb; if (tn < 0.5) tn = 0.5; }
              else if (h2 < 0.5) { tn = hat(tA, 3.6, 1.2, 4) * 0.6 * hb; if (tn < 0.1) tn = 0.1; }
              else if (h3 < 0.5) tn = hat(tA, 5.0, 1.1, 3) * 0.36 * hb;
              tn *= TQ[o] / 255; al = 0; cut = 0;
            } else {
              /* 윤곽: 가는 획 셋을 조금씩 어긋나게 겹쳐 긋는다. 셋째 획은 모서리를 더 둥글게 돈다 */
              const U3 = 2 * U - U2, V3 = 2 * V - V2; i0 = (U3 / 48) | 0; j0 = (V3 / 48) | 0; fx = (U3 - i0 * 48) / 48; fy = (V3 - j0 * 48) / 48;
              const d = j0 * GW + i0;
              const s1 = SIL[a] * w00 + SIL[a + 1] * w10 + SIL[a + GW] * w01 + SIL[a + GW + 1] * w11, s2 = SIL[b] * v00 + SIL[b + 1] * v10 + SIL[b + GW] * v01 + SIL[b + GW + 1] * v11;
              const s3 = SILB[d] * (1 - fx) * (1 - fy) + SILB[d + 1] * fx * (1 - fy) + SILB[d + GW] * (1 - fx) * fy + SILB[d + GW + 1] * fx * fy;
              ln = acc(acc(0.95 * band(s1, S080, 0.78) * q1, 0.85 * band(s2, S080, 0.5) * q2), 0.8 * band(s3, S130, 0.5) * LQ3[o] / 255);
              if (s1 > 0.5) {
                const g1 = I1[a] * w00 + I1[a + 1] * w10 + I1[a + GW] * w01 + I1[a + GW + 1] * w11, g2 = I2[a] * w00 + I2[a + 1] * w10 + I2[a + GW] * w01 + I2[a + GW + 1] * w11, g3 = I3[a] * w00 + I3[a + 1] * w10 + I3[a + GW] * w01 + I3[a + GW + 1] * w11;
                let e1 = band(g1, S062, 0.6), e2 = band(I1[b] * v00 + I1[b + 1] * v10 + I1[b + GW] * v01 + I1[b + GW + 1] * v11, S062, 0.5), t;
                t = band(g2, S062, 0.6); if (t > e1) e1 = t; t = band(I2[b] * v00 + I2[b + 1] * v10 + I2[b + GW] * v01 + I2[b + GW + 1] * v11, S062, 0.5); if (t > e2) e2 = t;
                t = band(g3, S062, 0.6); if (t > e1) e1 = t; t = band(I3[b] * v00 + I3[b + 1] * v10 + I3[b + GW] * v01 + I3[b + GW + 1] * v11, S062, 0.5); if (t > e2) e2 = t;
                const inn = acc(0.7 * e1 * q1, 0.45 * e2 * q2); if (inn > ln) ln = inn;
                /* 안쪽: 흰색은 종이, 밝은 회색은 옅은 빗금, 어두운 회색은 짙은 빗금, 검정은 가장 짙게 */
                if (g1 < 0.5) { tn = acc(hat(tA, 2.4, 1.6, 5), 0.8 * hat(hx * CB + hy * SB, 2.7, 1.4, 6)) * hb; if (tn < 0.5) tn = 0.5; }
                else if (g2 < 0.5) { tn = acc(hat(tA, 2.9, 1.5, 4) * 0.8, hat(hx * CC + hy * SC, 6.5, 1.3, 8) * 0.5) * hb; if (tn < 0.16) tn = 0.16; }
                else if (g3 < 0.5) tn = hat(tA, 5.0, 1.1, 3) * 0.36 * hb;
                tn *= TQS[o] / 255;
              }
              cut = c01(cut * 1.6 - 0.25);
              al *= 1 - 0.9 * cut;
            }
            if (ln > al) al = ln; if (tn > al) al = tn;
          }
          al *= 255;
          let A = al > 255 ? 255 : al | 0; const p = paper[o];
          let r = p & 255, g = (p >> 8) & 255, bl = (p >> 16) & 255;
          if (cut > 0) { const c9 = cut * 0.9; r += dR * c9; g += dG * c9; bl += dB * c9; r = r > 255 ? 255 : r | 0; g = g > 255 ? 255 : g | 0; bl = bl > 255 ? 255 : bl | 0; }
          if (!A) { o32[o] = (0xFF000000 | (bl << 16) | (g << 8) | r) >>> 0; continue; }
          A += A >> 7;
          o32[o] = (0xFF000000 | ((bl + (((lb - bl) * A) >> 8)) << 16) | ((g + (((lg - g) * A) >> 8)) << 8) | (r + (((lr - r) * A) >> 8))) >>> 0;
        }
      }
    }

    /* g32: 그레이스케일 화면(320×288), spr: 주인공을 그린 자리(없으면 null), bgp: 스프라이트를 빼고 본 배경(160×144), spm: 스프라이트 자리.
       all이 참이면 모두 다시 그린다. 다시 그린 조각의 번호를 tiles[0..n)에 적는다.
       max를 주면 스프라이트·아래 띠에서 먼 배경은 한 번에 조각 max개 넓이까지만 그리고, 미룬 조각(left개)은 빈 종이로 두었다가 다음에 그린다 */
    pen.draw = (g32, spr, bgp, spm, all, max) => {
      if (all) { fullR(fB); fullR(oB); fullR(fS); fullR(oF); }
      let ch = 0;
      for (let i = 0; i < NB; i++) { const l = LEV[bgp[i] & 255]; if (l !== LB[i]) { LB[i] = l; ch = 1; } }
      if (ch) analyze();
      for (let y = 0, i = 0; y < OH; y++) {
        const ny = y >> 1, hud = ny >= HUD_Y, nb = ny * SW;
        for (let x = 0; x < OW; x++, i++) {
          const lev = LEV[g32[i] & 255], c = hud ? 16 | (3 - lev) : (spm[nb + (x >> 1)] || (spr && spr[i])) ? 8 | lev : 0;
          C[i] = c;
          if (c !== P[i]) { P[i] = c; markR(fS, x - RG, y - RG, x + 1 + RG, y + 1 + RG); markR(oF, x - RO, y - RO, x + 1 + RO, y + 1 + RO); }
        }
      }
      /* 흐린 표시를 먼저 모두 고치고(이웃 조각의 값도 읽으므로), 그다음에 그린다 */
      for (let b = 0; b < 4 * NT; b += 4) if (fB[b] < fB[b + 1]) fieldsB(fB[b], fB[b + 1], fB[b + 2], fB[b + 3]);
      for (let b = 0; b < 4 * NT; b += 4) if (fB[b] < fB[b + 1]) flagsB(fB[b], fB[b + 1], fB[b + 2], fB[b + 3]);
      for (let b = 0; b < 4 * NT; b += 4) if (fS[b] < fS[b + 1]) fieldsS(fS[b], fS[b + 1], fS[b + 2], fS[b + 3]);
      noneR(fB); noneR(fS);
      let k = 0, quota = max > 0 ? max * PT * PT : 1e9, left = 0;
      for (let t = 0, b = 0; t < NT; t++, b += 4) {
        const hasB = oB[b] < oB[b + 1], hasF = oF[b] < oF[b + 1];
        if (!hasB && !hasF) continue;
        const tx = t % PTW, ty = (t / PTW) | 0;
        let x0 = oF[b], x1 = oF[b + 1], y0 = oF[b + 2], y1 = oF[b + 3];
        if (hasB) {
          const bx0 = oB[b], bx1 = oB[b + 1], by0 = oB[b + 2], by1 = oB[b + 3];
          /* 스프라이트·아래 띠가 걸친 조각과 그 둘레는 곧바로 그린다 */
          if (!hasF && (ty + 1) * PT + 3 <= HUD_Y * 2 && !near(tx * PT, (tx + 1) * PT, ty * PT, (ty + 1) * PT)) {
            if (quota <= 0) { left++; if (pend[t] !== 2) { pend[t] = 2; fullT(oB, t); blank(tx, ty); tiles[k++] = t; } continue; }
            quota -= (bx1 - bx0) * (by1 - by0);
          }
          drawB(bx0, bx1, by0, by1); pend[t] = 0; oB[b] = oB[b + 2] = 32767; oB[b + 1] = oB[b + 3] = -1;
          if (bx0 < x0) x0 = bx0; if (bx1 > x1) x1 = bx1; if (by0 < y0) y0 = by0; if (by1 > y1) y1 = by1;
        }
        drawF(x0, x1, y0, y1); oF[b] = oF[b + 2] = 32767; oF[b + 1] = oF[b + 3] = -1; tiles[k++] = t;
      }
      pen.left = left;
      pen.n = k;
      return pen;
    };
    return pen;
  }

  /* data: 자료 바이트 배열(롬과 같은 주소 배치), atlas: {rgba, w, h, frames:{'g_k':[x,y,w,h,ox,oy,rest]}}, makeCore: 핵심부 */
  function makeGame(makeCore, data, atlas, opts) {
    opts = opts || {};
    const G = decodeGroups(data);
    const A32C = new Uint32Array(atlas.rgba.buffer, atlas.rgba.byteOffset, atlas.rgba.byteLength >> 2), A32G = grayAtlas(A32C, HERO_GRAY), A32P = grayAtlas(A32C, HERO_PEN), AW = atlas.w;
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
    /* 색상: 0 그레이스케일 · 1 컬러(파스텔) · 2 본래 색 · 3 연필. 아몰랑 그림은 그레이스케일과 연필에서 네 단계 판을 따로 쓴다.
       연필은 네 단계로 그린 화면을 S.pencil()이 세 배의 연필 그림으로 옮긴다(S.out은 v0.60까지의 그레이스케일 화면: 벽 옆면과 머리·바지가 어두운 회색) */
    S.setColor = (v) => {
      v = v === 1 || v === 2 || v === 3 ? v : 0; S.color = v;
      A32 = v === 3 ? A32P : v === 0 ? A32G : A32C; tone.setMode(v); c.setRecolor(v === 2 ? null : tone);
      if (v === 3) { if (!pen) pen = makePencil(); penAll = true; sprHi.fill(0); }
    };
    /* 연필 화면: 지금의 S.out을 옮겨 { out, w, h, tile, cols, tiles, n, left }를 낸다. 바뀐 조각만 다시 그리고 그 번호를 tiles[0..n)에 적는다.
       max를 주면 스프라이트·아래 띠에서 먼 배경 조각은 한 번에 그만큼만 그리고 나머지(left개)는 다음에 그린다. 연필이 아니면 null */
    S.pencil = (all, max) => { if (S.color !== 3) return null; const p = pen.draw(out32, sprHi, c.bgp, c.spm, all || penAll, max); penAll = false; return p; };
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
  const api = { SW, SH, OW, OH, PW, PH, makeGame, makePencil, decodeGroups, makeTone, grayAtlas, HERO_GRAY, HERO_PEN, GRAY, DEEP, INK, GOLD, PAPER, FILL, LEAD, pastelOf, grayLevel, pack, unpack };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DonghyunPe = api;
})(typeof self !== 'undefined' ? self : this);
