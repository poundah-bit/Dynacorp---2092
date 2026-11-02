'use strict';

/* Scorched Earth Revival – Prototyp
 * Zwei Spieler am selben Tablet, abwechselnd. Zerstörbares Gelände, Wind, eine Waffe.
 */
(() => {
  // ---------- Konstanten ----------
  const W = 1280, H = 640;
  const GRAV = 400;            // px/s²
  const POWER_TO_V = 7;        // Kraft 100 -> 700 px/s
  const MAX_HP = 100;
  const BLAST_R = 38;          // Kraterradius
  const BLAST_REACH = 22;      // zusätzlicher Schadensradius um den Krater
  const MAX_DMG = 70;          // Schaden bei Volltreffer
  const TANK_W = 36;
  const COLORS = ['#ff8a2a', '#38d4ff'];
  const NAMES = ['Spieler 1', 'Spieler 2'];

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = W;
  canvas.height = H;

  const el = (id) => document.getElementById(id);
  const angleInput = el('angle'), powerInput = el('power');
  const angleVal = el('angle-val'), powerVal = el('power-val');
  const fireBtn = el('fire'), turnLabel = el('turn-label');
  const overlay = el('overlay'), ovTitle = el('ov-title'), ovText = el('ov-text'), ovButton = el('ov-button');

  // ---------- Zustand ----------
  const terrainCanvas = document.createElement('canvas');
  terrainCanvas.width = W;
  terrainCanvas.height = H;
  const tctx = terrainCanvas.getContext('2d');
  const mask = new Uint8Array(W * H);   // 1 = Erde
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = W;
  skyCanvas.height = H;

  let tanks = [];
  let current = 0;
  let wind = 0;
  let state = 'menu';       // menu | aim | flight | settle | roundover
  let projectile = null;
  let explosions = [];
  let particles = [];
  let settleIdle = 0;
  let scores = [0, 0];
  let roundResult = null;
  let started = false;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- Gelände ----------
  function isSolid(x, y) {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || xi >= W || yi < 0) return false;
    if (yi >= H) return true;
    return mask[yi * W + xi] === 1;
  }

  function groundY(x) {
    const xi = clamp(Math.round(x), 0, W - 1);
    for (let y = 0; y < H; y++) if (mask[y * W + xi]) return y;
    return H;
  }

  function generateTerrain() {
    const heights = new Float32Array(W);
    const p = [rand(0, 6.28), rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)];
    const base = H * 0.62;
    for (let x = 0; x < W; x++) {
      const h = base
        + Math.sin(x / 210 + p[0]) * 62
        + Math.sin(x / 95 + p[1]) * 30
        + Math.sin(x / 41 + p[2]) * 11
        + Math.sin(x / 17 + p[3]) * 3;
      heights[x] = clamp(h, H * 0.33, H * 0.86);
    }

    mask.fill(0);
    for (let x = 0; x < W; x++) {
      for (let y = Math.floor(heights[x]); y < H; y++) mask[y * W + x] = 1;
    }

    tctx.clearRect(0, 0, W, H);
    const grad = tctx.createLinearGradient(0, H * 0.3, 0, H);
    grad.addColorStop(0, '#8a5a2b');
    grad.addColorStop(1, '#3b230f');
    tctx.fillStyle = grad;
    tctx.beginPath();
    tctx.moveTo(0, H);
    for (let x = 0; x < W; x++) tctx.lineTo(x, heights[x]);
    tctx.lineTo(W - 1, H);
    tctx.closePath();
    tctx.fill();

    tctx.strokeStyle = '#4fae3f';
    tctx.lineWidth = 6;
    tctx.beginPath();
    for (let x = 0; x < W; x++) {
      if (x === 0) tctx.moveTo(x, heights[x] + 2);
      else tctx.lineTo(x, heights[x] + 2);
    }
    tctx.stroke();
  }

  function drawSky() {
    const s = skyCanvas.getContext('2d');
    const g = s.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1026');
    g.addColorStop(0.6, '#2a2a5e');
    g.addColorStop(1, '#6b3a5e');
    s.fillStyle = g;
    s.fillRect(0, 0, W, H);
    s.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 90; i++) {
      const r = Math.random() < 0.15 ? 1.8 : 1;
      s.fillRect(rand(0, W), rand(0, H * 0.55), r, r);
    }
    s.fillStyle = '#f4efd8';
    s.beginPath();
    s.arc(rand(W * 0.3, W * 0.7), rand(70, 120), 26, 0, Math.PI * 2);
    s.fill();
  }

  function carve(x, y, r) {
    tctx.save();
    tctx.globalCompositeOperation = 'destination-out';
    tctx.beginPath();
    tctx.arc(x, y, r, 0, Math.PI * 2);
    tctx.fill();
    tctx.restore();

    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx - x, dy = yy - y;
        if (dx * dx + dy * dy <= r2) mask[yy * W + xx] = 0;
      }
    }
  }

  // ---------- Panzer ----------
  function supportY(x) {
    return Math.min(groundY(x - 13), groundY(x), groundY(x + 13));
  }

  function newRound() {
    generateTerrain();
    drawSky();
    explosions = [];
    particles = [];
    projectile = null;
    const xs = [rand(W * 0.08, W * 0.28), rand(W * 0.72, W * 0.92)];
    const old = tanks;
    tanks = [0, 1].map((i) => ({
      x: xs[i],
      y: supportY(xs[i]),
      hp: MAX_HP,
      alive: true,
      angle: old[i] ? old[i].angle : (i === 0 ? 55 : 125),
      power: old[i] ? old[i].power : 60,
      color: COLORS[i],
      name: NAMES[i],
    }));
    current = Math.random() < 0.5 ? 0 : 1;
    wind = Math.round(rand(-50, 50));
    startTurn();
  }

  function startTurn() {
    state = 'aim';
    const t = tanks[current];
    angleInput.value = t.angle;
    powerInput.value = t.power;
    syncLabels();
    turnLabel.textContent = t.name;
    turnLabel.style.color = t.color;
    setControlsEnabled(true);
  }

  function setControlsEnabled(on) {
    fireBtn.disabled = !on;
    document.querySelectorAll('button.step').forEach((b) => (b.disabled = !on));
    angleInput.disabled = !on;
    powerInput.disabled = !on;
  }

  function syncLabels() {
    angleVal.textContent = angleInput.value + '°';
    powerVal.textContent = powerInput.value;
  }

  function setValue(target, v) {
    if (state !== 'aim') return;
    const input = target === 'angle' ? angleInput : powerInput;
    input.value = clamp(v, Number(input.min), Number(input.max));
    tanks[current][target] = Number(input.value);
    syncLabels();
  }

  // ---------- Schuss ----------
  function fire() {
    if (state !== 'aim') return;
    initAudio();
    const t = tanks[current];
    const a = (t.angle * Math.PI) / 180;
    const v = t.power * POWER_TO_V;
    projectile = {
      x: t.x + Math.cos(a) * 24,
      y: t.y - 14 - Math.sin(a) * 24,
      vx: Math.cos(a) * v,
      vy: -Math.sin(a) * v,
      age: 0,
      trail: [],
      owner: current,
    };
    state = 'flight';
    setControlsEnabled(false);
    sound('shot');
  }

  function stepProjectile(dt) {
    const p = projectile;
    const sub = 4;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      p.vx += wind * h;
      p.vy += GRAV * h;
      p.x += p.vx * h;
      p.y += p.vy * h;
      p.age += h;

      if (p.x < -30 || p.x > W + 30 || p.y > H + 30) {
        projectile = null;
        endShot();
        return;
      }
      for (let ti = 0; ti < tanks.length; ti++) {
        const t = tanks[ti];
        if (!t.alive) continue;
        if (ti === p.owner && p.age < 0.3) continue;
        if (Math.abs(p.x - t.x) < TANK_W / 2 && p.y > t.y - 20 && p.y < t.y + 2) {
          explode(p.x, p.y, BLAST_R, true);
          projectile = null;
          endShot();
          return;
        }
      }
      if (isSolid(p.x, p.y)) {
        explode(p.x, p.y, BLAST_R, true);
        projectile = null;
        endShot();
        return;
      }
    }
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 40) p.trail.shift();
  }

  function explode(x, y, r, doDamage) {
    carve(x, y, r);
    explosions.push({ x, y, r, t: 0 });
    for (let i = 0; i < 36; i++) {
      const a = rand(0, Math.PI * 2), s = rand(60, 320);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: rand(0.4, 1.0), max: 1 });
    }
    sound('boom');
    if (!doDamage) return;
    tanks.forEach((t) => {
      if (!t.alive) return;
      const d = Math.hypot(t.x - x, t.y - 10 - y);
      const reach = r + BLAST_REACH;
      if (d < reach) t.hp = Math.max(0, t.hp - Math.round(MAX_DMG * (1 - d / reach)));
    });
  }

  function endShot() {
    state = 'settle';
    settleIdle = 0;
  }

  function settleStep(dt) {
    let moved = false;
    tanks.forEach((t) => {
      if (!t.alive) return;
      const s = supportY(t.x);
      if (s > t.y + 0.5) {
        t.y = Math.min(s, t.y + 200 * dt);
        moved = true;
      }
    });
    settleIdle = moved ? 0 : settleIdle + dt;
    if (settleIdle > 0.35 && explosions.length === 0) afterTurn();
  }

  function afterTurn() {
    const dead = tanks.filter((t) => t.hp <= 0 && t.alive);
    if (dead.length) {
      dead.forEach((t) => {
        t.alive = false;
        explode(t.x, t.y - 8, 52, false);
      });
      const alive = tanks.filter((t) => t.alive);
      if (alive.length === 1) {
        const winner = tanks.indexOf(alive[0]);
        scores[winner]++;
        roundResult = { title: NAMES[winner] + ' gewinnt die Runde!', text: 'Stand: ' + scores[0] + ' : ' + scores[1] };
      } else {
        roundResult = { title: 'Unentschieden!', text: 'Beide Panzer sind zerstört. Stand: ' + scores[0] + ' : ' + scores[1] };
      }
      state = 'roundover';
      setControlsEnabled(false);
      return;
    }
    current = 1 - current;
    wind = clamp(wind + Math.round(rand(-18, 18)), -80, 80);
    startTurn();
  }

  // ---------- Update ----------
  function update(dt) {
    if (state === 'flight' && projectile) stepProjectile(dt);
    if (state === 'settle') settleStep(dt);

    explosions.forEach((e) => (e.t += dt));
    explosions = explosions.filter((e) => e.t < 0.55);

    particles.forEach((p) => {
      p.vy += GRAV * 0.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    });
    particles = particles.filter((p) => p.life > 0);

    if (state === 'roundover' && explosions.length === 0 && overlay.classList.contains('hidden')) {
      showOverlay(roundResult.title, roundResult.text, 'Nächste Runde');
    }
  }

  // ---------- Zeichnen ----------
  function drawTank(t, active) {
    if (!t.alive) {
      ctx.fillStyle = '#222';
      ctx.fillRect(t.x - 18, t.y - 6, 36, 6);
      return;
    }
    const a = (t.angle * Math.PI) / 180;
    // Rohr
    ctx.strokeStyle = '#d8d8e0';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 14);
    ctx.lineTo(t.x + Math.cos(a) * 24, t.y - 14 - Math.sin(a) * 24);
    ctx.stroke();
    // Ketten und Wanne
    ctx.fillStyle = '#2b2b33';
    ctx.fillRect(t.x - 19, t.y - 7, 38, 7);
    ctx.fillStyle = t.color;
    ctx.fillRect(t.x - 15, t.y - 13, 30, 8);
    ctx.beginPath();
    ctx.arc(t.x, t.y - 13, 9, Math.PI, 0);
    ctx.fill();
    // Lebensbalken
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(t.x - 22, t.y - 38, 44, 6);
    ctx.fillStyle = t.hp > 50 ? '#5fd35f' : t.hp > 25 ? '#f0c040' : '#e5483c';
    ctx.fillRect(t.x - 22, t.y - 38, 44 * (t.hp / MAX_HP), 6);
    // Aktiv-Markierung
    if (active) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(t.x, t.y - 46);
      ctx.lineTo(t.x - 6, t.y - 56);
      ctx.lineTo(t.x + 6, t.y - 56);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawHud() {
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    tanks.forEach((t, i) => {
      const x = i === 0 ? 20 : W - 20;
      ctx.textAlign = i === 0 ? 'left' : 'right';
      ctx.fillStyle = COLORS[i];
      ctx.fillText(NAMES[i] + '  ·  ' + scores[i], x, 24);
      const bw = 180, bx = i === 0 ? 20 : W - 20 - bw;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(bx, 40, bw, 10);
      ctx.fillStyle = COLORS[i];
      ctx.fillRect(bx, 40, bw * (t.hp / MAX_HP), 10);
    });
    // Wind
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eef1ff';
    ctx.fillText('Wind', W / 2, 20);
    const len = (Math.abs(wind) / 80) * 90;
    const dir = wind >= 0 ? 1 : -1;
    ctx.strokeStyle = '#eef1ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(W / 2 - dir * len / 2, 44);
    ctx.lineTo(W / 2 + dir * len / 2, 44);
    ctx.stroke();
    if (len > 4) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + dir * len / 2, 44);
      ctx.lineTo(W / 2 + dir * (len / 2 - 9), 38);
      ctx.lineTo(W / 2 + dir * (len / 2 - 9), 50);
      ctx.closePath();
      ctx.fill();
    }
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.fillText(String(Math.abs(wind)), W / 2, 62);
  }

  function draw() {
    ctx.drawImage(skyCanvas, 0, 0);
    ctx.drawImage(terrainCanvas, 0, 0);

    tanks.forEach((t, i) => drawTank(t, state === 'aim' && i === current));

    if (projectile) {
      ctx.fillStyle = 'rgba(255,220,150,.35)';
      projectile.trail.forEach((p, i) => {
        ctx.fillRect(p.x - 1, p.y - 1, 2 + i / 20, 2 + i / 20);
      });
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    explosions.forEach((e) => {
      const k = e.t / 0.55;
      const r = e.r * (0.5 + k * 0.9);
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      g.addColorStop(0, 'rgba(255,255,220,' + (1 - k) + ')');
      g.addColorStop(0.5, 'rgba(255,150,40,' + (0.85 * (1 - k)) + ')');
      g.addColorStop(1, 'rgba(200,40,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
    });

    particles.forEach((p) => {
      ctx.fillStyle = 'rgba(255,' + Math.round(120 + 100 * p.life) + ',60,' + clamp(p.life * 1.6, 0, 1) + ')';
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    });

    drawHud();
  }

  // ---------- Ton ----------
  let audio = null;
  function initAudio() {
    if (audio || !(window.AudioContext || window.webkitAudioContext)) return;
    try {
      audio = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      audio = null;
    }
  }

  function sound(kind) {
    if (!audio) return;
    const now = audio.currentTime;
    const dur = kind === 'boom' ? 0.5 : 0.18;
    const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * dur), audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const f = 1 - i / data.length;
      data[i] = (Math.random() * 2 - 1) * f * f;
    }
    const src = audio.createBufferSource();
    src.buffer = buf;
    const filter = audio.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = kind === 'boom' ? 420 : 1400;
    const gain = audio.createGain();
    gain.gain.value = kind === 'boom' ? 0.5 : 0.25;
    src.connect(filter).connect(gain).connect(audio.destination);
    src.start(now);
  }

  // ---------- Eingabe ----------
  function showOverlay(title, text, button) {
    ovTitle.textContent = title;
    ovText.textContent = text;
    ovButton.textContent = button;
    overlay.classList.remove('hidden');
  }

  ovButton.addEventListener('click', () => {
    initAudio();
    overlay.classList.add('hidden');
    started = true;
    newRound();
  });

  angleInput.addEventListener('input', () => setValue('angle', Number(angleInput.value)));
  powerInput.addEventListener('input', () => setValue('power', Number(powerInput.value)));
  fireBtn.addEventListener('click', fire);

  // Plus/Minus-Knöpfe: gedrückt halten wiederholt
  document.querySelectorAll('button.step').forEach((btn) => {
    let timer = null, delay = null;
    const target = btn.dataset.target, delta = Number(btn.dataset.delta);
    const bump = () => {
      const input = target === 'angle' ? angleInput : powerInput;
      setValue(target, Number(input.value) + delta);
    };
    const stop = () => {
      clearTimeout(delay);
      clearInterval(timer);
      timer = delay = null;
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      bump();
      delay = setTimeout(() => (timer = setInterval(bump, 60)), 350);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
  });

  window.addEventListener('keydown', (e) => {
    if (state !== 'aim') return;
    const t = tanks[current];
    if (e.key === 'ArrowLeft') setValue('angle', t.angle + 1);
    else if (e.key === 'ArrowRight') setValue('angle', t.angle - 1);
    else if (e.key === 'ArrowUp') setValue('power', t.power + 1);
    else if (e.key === 'ArrowDown') setValue('power', t.power - 1);
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fire(); }
  });

  // ---------- Hauptschleife ----------
  let last = 0;
  function frame(ts) {
    const dt = Math.min(0.033, (ts - last) / 1000 || 0);
    last = ts;
    if (started) update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // Startbild: Gelände zeigen, bevor das Spiel läuft
  generateTerrain();
  drawSky();
  setControlsEnabled(false);
  requestAnimationFrame(frame);

  // Für Tests von außen
  window.__game = { newRound, fire, tanks: () => tanks, state: () => state, scores: () => scores, setValue };

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
