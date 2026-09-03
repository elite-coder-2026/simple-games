const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
canvas.style.setProperty('width', W + 'px', 'important');
canvas.style.setProperty('height', H + 'px', 'important');
canvas.addEventListener('contextmenu', e => e.preventDefault());

const BALL_RADIUS = 7;
const CELL = 8;
const GRID_W = Math.ceil(W / CELL);
const GRID_H = Math.ceil(H / CELL);
const WALL_GROW_SPEED = 6;
const CLEAR_TARGET = 75; // percent
const MAX_BALLS = 99;

const idx = (cx, cy) => cy * GRID_W + cx;

let solid = new Uint8Array(GRID_W * GRID_H);   // permanent walls + cleared regions
let permanentWalls = [];                        // { x1,y1,x2,y2 } for rendering + ball bounce
let attempt = null;                              // in-progress growing wall
let balls = [];
let level = 1;
let ballCount = 2;
let clearedPercent = 0;

const getPos = (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
};

const cellSolid = (cx, cy) => {
  if (cx < 0 || cx >= GRID_W || cy < 0 || cy >= GRID_H) return true; // canvas edge counts as solid
  return solid[idx(cx, cy)] === 1;
};

const spawnBall = () => {
  const angle = Math.random() * Math.PI * 2;
  const speed = 1.6 + Math.random() * 1.2;
  // find an open cell to start in
  let x, y, cx, cy, tries = 0;
  do {
    x = 20 + Math.random() * (W - 40);
    y = 20 + Math.random() * (H - 40);
    cx = Math.floor(x / CELL); cy = Math.floor(y / CELL);
    tries++;
  } while (cellSolid(cx, cy) && tries < 200);
  return {
    x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    cooldown: 0, rot: 0, color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`,
  };
};

const resetBoard = (keepBallCount) => {
  solid = new Uint8Array(GRID_W * GRID_H);
  permanentWalls = [];
  attempt = null;
  clearedPercent = 0;
  balls = [];
  for (let i = 0; i < keepBallCount; i++) balls.push(spawnBall());
  updateHud();
};

const updateHud = () => {
  document.getElementById('level').textContent = `LEVEL ${level}`;
  document.getElementById('balls').textContent = `BALLS: ${ballCount}`;
  document.getElementById('cleared').textContent = `CLEARED: ${clearedPercent.toFixed(0)}%`;
};

const showBanner = (text) => {
  const el = document.getElementById('banner');
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 1400);
};

// --- Connected components among non-solid cells ---
const findComponents = () => {
  const comp = new Int32Array(GRID_W * GRID_H).fill(-1);
  const components = [];
  let compCount = 0;
  for (let sy = 0; sy < GRID_H; sy++) {
    for (let sx = 0; sx < GRID_W; sx++) {
      const startIdx = idx(sx, sy);
      if (solid[startIdx] || comp[startIdx] !== -1) continue;
      const cells = [];
      const stack = [[sx, sy]];
      comp[startIdx] = compCount;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        cells.push(idx(cx, cy));
        const neighbors = [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
          const nIdx = idx(nx, ny);
          if (solid[nIdx] || comp[nIdx] !== -1) continue;
          comp[nIdx] = compCount;
          stack.push([nx, ny]);
        }
      }
      components.push(cells);
      compCount++;
    }
  }
  return components;
};

const recomputeClearing = () => {
  const components = findComponents();
  let anyCleared = false;
  for (const cells of components) {
    const cellSet = new Set(cells);
    const hasBall = balls.some(b => {
      const cx = Math.max(0, Math.min(GRID_W - 1, Math.floor(b.x / CELL)));
      const cy = Math.max(0, Math.min(GRID_H - 1, Math.floor(b.y / CELL)));
      return cellSet.has(idx(cx, cy));
    });
    if (!hasBall) {
      for (const c of cells) solid[c] = 1;
      anyCleared = true;
    }
  }
  const total = GRID_W * GRID_H;
  const clearedCells = solid.reduce((a, v) => a + v, 0);
  clearedPercent = (clearedCells / total) * 100;
  updateHud();
  if (clearedPercent >= CLEAR_TARGET) {
    level += 1;
    ballCount = Math.min(MAX_BALLS, ballCount + 1);
    showBanner(`LEVEL ${level}!`);
    resetBoard(ballCount);
  }
  return anyCleared;
};

// --- Input: start / grow / resolve a wall attempt ---
const startAttempt = (pos, axis) => {
  if (attempt) return; // only one attempt at a time
  const cx = Math.floor(pos.x / CELL), cy = Math.floor(pos.y / CELL);
  if (cellSolid(cx, cy)) return; // can't start inside a wall/cleared area
  attempt = { x: pos.x, y: pos.y, axis, posLen: 0, negLen: 0, posDone: false, negDone: false };
};

let wallOrientation = 'v';
const orientationBtn = document.getElementById('orientation');
orientationBtn.addEventListener('click', () => {
  wallOrientation = wallOrientation === 'v' ? 'h' : 'v';
  orientationBtn.textContent = `WALL: ${wallOrientation === 'v' ? 'VERTICAL' : 'HORIZONTAL'}`;
});

canvas.addEventListener('mousedown', e => {
  const pos = getPos(e);
  startAttempt(pos, e.button === 2 ? 'h' : wallOrientation);
});

const growAttempt = () => {
  if (!attempt) return;
  const a = attempt;

  if (!a.posDone) {
    a.posLen += WALL_GROW_SPEED;
    if (a.axis === 'v') {
      const tipY = a.y + a.posLen;
      const cx = Math.floor(a.x / CELL), cy = Math.floor(tipY / CELL);
      if (tipY >= H || cellSolid(cx, cy)) { a.posDone = true; a.posLen = Math.min(a.posLen, H - a.y); }
    } else {
      const tipX = a.x + a.posLen;
      const cx = Math.floor(tipX / CELL), cy = Math.floor(a.y / CELL);
      if (tipX >= W || cellSolid(cx, cy)) { a.posDone = true; a.posLen = Math.min(a.posLen, W - a.x); }
    }
  }
  if (!a.negDone) {
    a.negLen += WALL_GROW_SPEED;
    if (a.axis === 'v') {
      const tipY = a.y - a.negLen;
      const cx = Math.floor(a.x / CELL), cy = Math.floor(tipY / CELL);
      if (tipY <= 0 || cellSolid(cx, cy)) { a.negDone = true; a.negLen = Math.min(a.negLen, a.y); }
    } else {
      const tipX = a.x - a.negLen;
      const cx = Math.floor(tipX / CELL), cy = Math.floor(a.y / CELL);
      if (tipX <= 0 || cellSolid(cx, cy)) { a.negDone = true; a.negLen = Math.min(a.negLen, a.x); }
    }
  }

  // Current full extent of the attempt, for ball-collision checks
  let x1, y1, x2, y2;
  if (a.axis === 'v') { x1 = x2 = a.x; y1 = a.y - a.negLen; y2 = a.y + a.posLen; }
  else { y1 = y2 = a.y; x1 = a.x - a.negLen; x2 = a.x + a.posLen; }

  for (const b of balls) {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((b.x - x1) * dx + (b.y - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    if (Math.hypot(b.x - cx, b.y - cy) < BALL_RADIUS) {
      attempt = null; // touched before finishing — the whole attempt is destroyed
      return;
    }
  }

  if (a.posDone && a.negDone) {
    permanentWalls.push({ x1, y1, x2, y2 });
    // rasterize into the solid grid
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(dist / (CELL / 2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
      const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL);
      if (cx >= 0 && cx < GRID_W && cy >= 0 && cy < GRID_H) solid[idx(cx, cy)] = 1;
    }
    attempt = null;
    recomputeClearing();
  }
};

const update = () => {
  growAttempt();

  for (const b of balls) {
    b.x += b.vx;
    b.y += b.vy;
    b.rot += Math.hypot(b.vx, b.vy) / BALL_RADIUS;

    if (b.x - BALL_RADIUS < 0) { b.x = BALL_RADIUS; b.vx *= -1; }
    if (b.x + BALL_RADIUS > W) { b.x = W - BALL_RADIUS; b.vx *= -1; }
    if (b.y - BALL_RADIUS < 0) { b.y = BALL_RADIUS; b.vy *= -1; }
    if (b.y + BALL_RADIUS > H) { b.y = H - BALL_RADIUS; b.vy *= -1; }

    if (b.cooldown > 0) { b.cooldown -= 1; continue; }

    for (const w of permanentWalls) {
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;
      let t = ((b.x - w.x1) * dx + (b.y - w.y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = w.x1 + t * dx, cy = w.y1 + t * dy;
      const distX = b.x - cx, distY = b.y - cy;
      const dist = Math.hypot(distX, distY);
      if (dist < BALL_RADIUS) {
        let nx, ny;
        if (dist > 0.0001) { nx = distX / dist; ny = distY / dist; }
        else { const len = Math.hypot(dx, dy) || 1; nx = -dy / len; ny = dx / len; }
        const overlap = BALL_RADIUS - dist + 0.5;
        b.x += nx * overlap; b.y += ny * overlap;
        const dot = b.vx * nx + b.vy * ny;
        b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
        b.cooldown = 6;
        break;
      }
    }
  }
};

const draw = () => {
  ctx.clearRect(0, 0, W, H);

  // Cleared regions (shaded)
  ctx.fillStyle = 'rgba(74,222,128,0.15)';
  for (let cy = 0; cy < GRID_H; cy++) {
    for (let cx = 0; cx < GRID_W; cx++) {
      if (solid[idx(cx, cy)]) ctx.fillRect(cx * CELL, cy * CELL, CELL, CELL);
    }
  }

  // Permanent walls
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  permanentWalls.forEach(w => {
    ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke();
  });

  // Growing attempt
  if (attempt) {
    const a = attempt;
    let x1, y1, x2, y2;
    if (a.axis === 'v') { x1 = x2 = a.x; y1 = a.y - a.negLen; y2 = a.y + a.posLen; }
    else { y1 = y2 = a.y; x1 = a.x - a.negLen; x2 = a.x + a.posLen; }
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  // Balls — half white, half red, spinning as they roll
  balls.forEach(b => {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);

    ctx.beginPath();
    ctx.arc(0, 0, BALL_RADIUS, -Math.PI / 2, Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = '#f43f3f';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, BALL_RADIUS, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = '#f5f5f5';
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  });
};

const loop = () => { update(); draw(); requestAnimationFrame(loop); };

resetBoard(ballCount);
loop();
