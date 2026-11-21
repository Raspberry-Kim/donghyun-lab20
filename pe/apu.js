/* 동현페 — 소리 층.
 * 엔진 핵심부가 알려 주는 소리 레지스터 쓰기(주소·값·시각)를 받아 파형을 만든다: 사각파 둘, 파형표 하나, 잡음 하나.
 * 길이·음량 변화·주파수 쓸기는 512Hz 순서기로 돌린다. 한 표본 구간 안의 평균값을 내어(상자 거르기) 높은 음의 거친 소리를 줄인다. */
(function (root) {
  'use strict';
  const CPS = 4194304;
  const DUTY = [[0, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 0, 0, 1], [1, 0, 0, 0, 0, 1, 1, 1], [0, 1, 1, 1, 1, 1, 1, 0]];
  function makeApu(rate) {
    const cps = CPS / rate;                       // 표본 하나의 길이(클럭)
    const reg = new Uint8Array(0x30);             // FF10–FF3F
    const sq = [0, 1].map(() => ({ on: 0, dac: 0, duty: 0, len: 0, lenEn: 0, vol: 0, envT: 0, freq: 0, timer: 8, pos: 0 }));
    const sw = { per: 0, neg: 0, sh: 0, t: 0, en: 0, shadow: 0 };
    const wv = { on: 0, dac: 0, len: 0, lenEn: 0, vs: 0, freq: 0, timer: 8, pos: 0 };
    const nz = { on: 0, dac: 0, len: 0, lenEn: 0, vol: 0, envT: 0, timer: 8, lfsr: 0x7FFF, per: 8, w7: 0 };
    let power = 1, seq = 0, seqAt = 8192, now = 0, hpL = 0, hpR = 0;
    const q = []; let qi = 0;
    const hp = Math.pow(0.999958, CPS / rate);    // 직류 성분 빼기

    function sweepCalc() { const d = sw.shadow >> sw.sh, f = sw.neg ? sw.shadow - d : sw.shadow + d; if (f > 2047) sq[0].on = 0; return f; }
    function trigSq(i) {
      const c = sq[i], b = i ? 5 : 0; c.on = c.dac; if (!c.len) c.len = 64;
      c.timer = (2048 - c.freq) * 4; c.vol = reg[b + 2] >> 4; c.envT = (reg[b + 2] & 7) || 8;
      if (!i) { sw.shadow = c.freq; sw.t = sw.per || 8; sw.en = (sw.per || sw.sh) ? 1 : 0; if (sw.sh) sweepCalc(); }
    }
    function write(a, v) {
      const r = a - 0xFF10; if (r < 0 || r >= 0x30) return;
      if (!power && r !== 0x16 && r < 0x20) return;
      reg[r] = v;
      switch (r) {
        case 0x00: sw.per = (v >> 4) & 7; sw.neg = (v >> 3) & 1; sw.sh = v & 7; break;
        case 0x01: case 0x06: { const c = sq[r === 1 ? 0 : 1]; c.duty = v >> 6; c.len = 64 - (v & 63); break; }
        case 0x02: case 0x07: { const c = sq[r === 2 ? 0 : 1]; c.dac = (v & 0xF8) ? 1 : 0; if (!c.dac) c.on = 0; break; }
        case 0x03: case 0x08: { const c = sq[r === 3 ? 0 : 1]; c.freq = (c.freq & 0x700) | v; break; }
        case 0x04: case 0x09: { const i = r === 4 ? 0 : 1, c = sq[i]; c.freq = (c.freq & 0xFF) | ((v & 7) << 8); c.lenEn = (v >> 6) & 1; if (v & 0x80) trigSq(i); break; }
        case 0x0A: wv.dac = v >> 7; if (!wv.dac) wv.on = 0; break;
        case 0x0B: wv.len = 256 - v; break;
        case 0x0C: wv.vs = (v >> 5) & 3; break;
        case 0x0D: wv.freq = (wv.freq & 0x700) | v; break;
        case 0x0E: wv.freq = (wv.freq & 0xFF) | ((v & 7) << 8); wv.lenEn = (v >> 6) & 1; if (v & 0x80) { wv.on = wv.dac; if (!wv.len) wv.len = 256; wv.timer = (2048 - wv.freq) * 2; wv.pos = 0; } break;
        case 0x10: nz.len = 64 - (v & 63); break;
        case 0x11: nz.dac = (v & 0xF8) ? 1 : 0; if (!nz.dac) nz.on = 0; break;
        case 0x12: { const d = v & 7; nz.per = (d ? d * 16 : 8) << (v >> 4); nz.w7 = (v >> 3) & 1; nz.stop = (v >> 4) > 13 ? 1 : 0; break; }
        case 0x13: nz.lenEn = (v >> 6) & 1; if (v & 0x80) { nz.on = nz.dac; if (!nz.len) nz.len = 64; nz.timer = nz.per; nz.lfsr = 0x7FFF; nz.vol = reg[0x11] >> 4; nz.envT = (reg[0x11] & 7) || 8; } break;
        case 0x16: { const p = v >> 7; if (power && !p) { for (let i = 0; i < 0x16; i++) reg[i] = 0; sq[0].on = sq[1].on = wv.on = nz.on = 0; sq[0].dac = sq[1].dac = wv.dac = nz.dac = 0; } power = p; break; }
      }
    }
    function env(c, nr) { const p = nr & 7; if (!p) return; if (--c.envT <= 0) { c.envT = p; if (nr & 8) { if (c.vol < 15) c.vol++; } else if (c.vol > 0) c.vol--; } }
    function step512() {
      if (!(seq & 1)) {
        for (const c of sq) if (c.lenEn && c.len && !--c.len) c.on = 0;
        if (wv.lenEn && wv.len && !--wv.len) wv.on = 0;
        if (nz.lenEn && nz.len && !--nz.len) nz.on = 0;
      }
      if ((seq & 3) === 2 && sw.en && --sw.t <= 0) {
        sw.t = sw.per || 8;
        if (sw.per) { const f = sweepCalc(); if (f <= 2047 && sw.sh) { sw.shadow = f; sq[0].freq = f; sweepCalc(); } }
      }
      if (seq === 7) { env(sq[0], reg[0x02]); env(sq[1], reg[0x07]); env(nz, reg[0x11]); }
      seq = (seq + 1) & 7;
    }
    /* 구간 평균(0…1). 채널 값은 0과 음량 사이를 오가고, 한쪽으로 치우친 몫은 맨 끝의 직류 빼기가 없앤다 */
    function runSq(c, n) {
      if (!c.on) return 0;
      const per = (2048 - c.freq) * 4, d = DUTY[c.duty]; let left = n, acc = 0;
      while (left > 0) { const t = c.timer < left ? c.timer : left; if (d[c.pos]) acc += t; c.timer -= t; left -= t; if (c.timer <= 0) { c.timer += per; c.pos = (c.pos + 1) & 7; } }
      return acc / n * c.vol / 15;
    }
    function runWv(n) {
      if (!wv.on) return 0;
      const per = (2048 - wv.freq) * 2, sh = wv.vs ? wv.vs - 1 : 4; let left = n, acc = 0;
      while (left > 0) {
        const t = wv.timer < left ? wv.timer : left, b = reg[0x20 + (wv.pos >> 1)], s = (wv.pos & 1) ? b & 15 : b >> 4;
        acc += (s >> sh) * t; wv.timer -= t; left -= t; if (wv.timer <= 0) { wv.timer += per; wv.pos = (wv.pos + 1) & 31; }
      }
      return acc / n / 15;
    }
    function runNz(n) {
      if (!nz.on) return 0;
      const per = nz.per; let left = n, acc = 0;
      if (nz.stop) return (nz.lfsr & 1) ? 0 : nz.vol / 15;
      while (left > 0) {
        const t = nz.timer < left ? nz.timer : left; if (!(nz.lfsr & 1)) acc += t; nz.timer -= t; left -= t;
        if (nz.timer <= 0) { nz.timer += per; const x = (nz.lfsr ^ (nz.lfsr >> 1)) & 1; nz.lfsr = (nz.lfsr >> 1) | (x << 14); if (nz.w7) nz.lfsr = (nz.lfsr & ~0x40) | (x << 6); }
      }
      return acc / n * nz.vol / 15;
    }
    /* 쓰기를 시각과 함께 쌓아 둔다 */
    function io(a, v, t) { q.push(a, v, t); }
    /* 시각 until(클럭)까지의 소리를 만들어 L·R에 채우고 표본 수를 돌려준다 */
    function render(until, L, R) {
      let n = 0;
      while (now + cps <= until && n < L.length) {
        const end = now + cps;
        while (qi < q.length && q[qi + 2] < end) { write(q[qi], q[qi + 1]); qi += 3; }
        while (seqAt <= end) { step512(); seqAt += 8192; }
        let l = 0, r = 0;
        if (power) {
          const pan = reg[0x15], a = runSq(sq[0], cps), b = runSq(sq[1], cps), c = runWv(cps), d = runNz(cps);
          if (pan & 0x10) l += a; if (pan & 0x20) l += b; if (pan & 0x40) l += c; if (pan & 0x80) l += d;
          if (pan & 0x01) r += a; if (pan & 0x02) r += b; if (pan & 0x04) r += c; if (pan & 0x08) r += d;
          const vv = reg[0x14]; l *= (((vv >> 4) & 7) + 1) / 32; r *= ((vv & 7) + 1) / 32;
        }
        /* 직류 빼기(고역 통과) */
        const ol = l - hpL, or = r - hpR; hpL = l - ol * hp; hpR = r - or * hp;
        L[n] = ol; R[n] = or; n++; now = end;
      }
      if (qi >= q.length) { q.length = 0; qi = 0; } else if (qi > 3000) { q.splice(0, qi); qi = 0; }
      return n;
    }
    /* 시각을 맞춘다(게임을 새로 시작할 때): 쌓인 쓰기는 버리지 않고 바로 반영한다 */
    function sync(t) { while (qi < q.length) { write(q[qi], q[qi + 1]); qi += 3; } q.length = 0; qi = 0; now = t; seqAt = t + 8192; }
    return { io, render, sync, write, reg, rate, dbg: () => ({ power, sq, wv, nz, sw }) };
  }
  const api = { makeApu };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DonghyunPeApu = api;
})(typeof self !== 'undefined' ? self : this);
