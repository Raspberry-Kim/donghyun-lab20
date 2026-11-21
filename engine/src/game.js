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

  /* 벽돌색: 층마다 다른 주제색(팔레트 0의 0·2번 색과 팔레트 1의 네 색)을 읽어, 그 색상에서 24° 안쪽인 배경색을 어두운 파스텔 노랑으로 바꾼다.
     밝기 순서는 지킨다. 팔레트 4(횃불·체력·글자)와 금색(c0a800), 회색·흰색·검정은 그대로 둔다. 색은 0xAABBGGRR */
  const BRICK_HUE = 46 / 360, BRICK_SAT = 0.36, BRICK_WIN = 24, GOLD = 0xFF00A8C0;
  function hsl2rgb(h, s, l) {
    const f = (n) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  }
  /* 색상(도). 채도가 낮으면 -1 */
  function hueOf(v) {
    const r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d < 24) return -1;
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return h * 60;
  }
  function makeBrick() {
    let T = [], sig = '';
    const f = (v, k) => {
      if ((k >> 2) === 4 || v === GOLD) return v;
      const h = hueOf(v); if (h < 0) return v;
      let hit = false; for (let i = 0; i < T.length; i++) { const d = Math.abs(h - T[i]); if (Math.min(d, 360 - d) <= BRICK_WIN) { hit = true; break; } }
      if (!hit) return v;
      const r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255, l = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
      const c = hsl2rgb(BRICK_HUE, BRICK_SAT, l <= 0.5 ? l * 1.22 + 0.01 : 0.62 + (l - 0.5) * 0.35);
      return (0xFF000000 | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
    };
    f.theme = (raw) => {
      const t = []; for (const i of [0, 2, 4, 5, 6, 7]) { const h = hueOf(raw[i]); if (h >= 0 && raw[i] !== GOLD) t.push(Math.round(h)); }
      const s2 = t.join(','); if (s2 === sig) return false; sig = s2; T = t; return true;
    };
    return f;
  }

  /* data: 자료 바이트 배열(롬과 같은 주소 배치), atlas: {rgba, w, h, frames:{'g_k':[x,y,w,h,ox,oy,rest]}}, makeCore: 핵심부 */
  function makeGame(makeCore, data, atlas, opts) {
    opts = opts || {};
    const G = decodeGroups(data);
    const A32 = new Uint32Array(atlas.rgba.buffer, atlas.rgba.byteOffset, atlas.rgba.byteLength >> 2), AW = atlas.w;
    const out = new Uint8ClampedArray(OW * OH * 4), out32 = new Uint32Array(out.buffer);
    const stat = { frames: 0, hero: 0, ok: 0, miss: 0, hidden: 0, wrong: 0 };
    const S = { mode: 'boot', swap: true, brick: true, front: true, info: null, stat, out, onEvent: opts.onEvent || null, onIo: opts.onIo || null };
    const brick = makeBrick();
    const c = makeCore(data, { recolor: brick, onIo: (a, v, t) => { if (S.onIo) S.onIo(a, v, t); } });
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
      if (!fr) { blit(c.fb); return out; }
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
          out32[Y * OW + X] = v;
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
    S.setBrick = (v) => { S.brick = v; c.setRecolor(v ? brick : null); };
    S.setMusic = (v) => { S.music = !!v; };
    S.dead = () => m[V.group] === 0x69;
    S.G = G;
    boot();
    return S;
  }
  const api = { SW, SH, OW, OH, makeGame, decodeGroups, makeBrick };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DonghyunPe = api;
})(typeof self !== 'undefined' ? self : this);
