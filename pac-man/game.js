const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const CELL = 20;

// Maze legend: # wall, - ghost-house door, . pellet, o power pellet, space = empty path
const MAZE = [
  "############################",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#o####.#####.##.#####.####o#",
  "#.####.#####.##.#####.####.#",
  "#..........................#",
  "#.####.##.########.##.####.#",
  "#.####.##.########.##.####.#",
  "#......##....##....##......#",
  "######.#####.##.#####.######",
  "######.#####.##.#####.######",
  "######.##..........##.######",
  "######.##.###--###.##.######",
  "######.##.#      #.##.######",
  "..........#      #..........",
  "######.##.#      #.##.######",
  "######.##.########.##.######",
  "######.##..........##.######",
  "######.##.########.##.######",
  "######.##.########.##.######",
  "#............##............#",
  "#.####.#####.##.#####.####.#",
  "#.####.#####.##.#####.####.#",
  "#o..##................##..o#",
  "###.##.##.########.##.##.###",
  "###.##.##.########.##.##.###",
  "#......##....##....##......#",
  "#.##########.##.##########.#",
  "#.##########.##.##########.#",
  "#..........................#",
  "############################",
];

const COLS = MAZE[0].length;   // 28
const ROWS = MAZE.length;      // 31
canvas.width = COLS * CELL;
canvas.height = ROWS * CELL;

const TUNNEL_ROW = 14;
const DIRS = [ { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 } ]; // up, left, down, right (tie-break order)

// --- Pre-render the static maze walls to an offscreen canvas ---
const mazeCanvas = document.createElement('canvas');
mazeCanvas.width = canvas.width;
mazeCanvas.height = canvas.height;
const mc = mazeCanvas.getContext('2d');

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function renderMaze() {
  mc.clearRect(0, 0, mazeCanvas.width, mazeCanvas.height);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = MAZE[r][c];
      if (ch === '#') {
        mc.fillStyle = '#1e2a78';
        roundRect(mc, c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4, 5);
        mc.fill();
      } else if (ch === '-') {
        mc.fillStyle = '#f7b5d0';
        mc.fillRect(c * CELL + 2, r * CELL + CELL / 2 - 2, CELL - 4, 4);
      }
    }
  }
}
renderMaze();

// --- Grid state (mutable copy for pellet eating) ---
let grid = MAZE.map(row => row.split(''));
let pelletsLeft = 0;

function countPellets() {
  pelletsLeft = 0;
  for (const row of grid) for (const ch of row) if (ch === '.' || ch === 'o') pelletsLeft++;
}

// --- Tile helpers ---
function tileAt(c, r) {
  if (r < 0 || r >= ROWS) return '#';
  if (c < 0 || c >= COLS) return r === TUNNEL_ROW ? ' ' : '#';
  return grid[r][c];
}
const isWallPac = (c, r) => { const t = tileAt(c, r); return t === '#' || t === '-'; };
const isWallGhost = (c, r) => tileAt(c, r) === '#';
function inHouseTile(c, r) {
  if (r >= 13 && r <= 15 && c >= 11 && c <= 16) return true;
  if (r === 12 && (c === 13 || c === 14)) return true;
  return false;
}

const col = e => Math.round((e.x - CELL / 2) / CELL);
const row = e => Math.round((e.y - CELL / 2) / CELL);
const aligned = e => ((e.x - CELL / 2) % CELL === 0) && ((e.y - CELL / 2) % CELL === 0);
function snapCenter(e) {
  e.x = Math.round((e.x - CELL / 2) / CELL) * CELL + CELL / 2;
  e.y = Math.round((e.y - CELL / 2) / CELL) * CELL + CELL / 2;
}
const tileCenter = (c, r) => ({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 });

// --- Entities ---
function makeEntity(c, r) {
  const p = tileCenter(c, r);
  return { x: p.x, y: p.y, dir: { x: 0, y: 0 } };
}

let pac, ghosts, blinky, pinky, inky, clyde;

const GHOST_DEFS = [
  { name: 'blinky', color: '#ff3b30', start: [13, 11], scatter: { x: COLS - 3, y: 0 }, house: false, release: 0 },
  { name: 'pinky',  color: '#ff9ce3', start: [13, 14], scatter: { x: 2, y: 0 }, house: true, release: 0 },
  { name: 'inky',   color: '#4fd0e0', start: [12, 14], scatter: { x: COLS - 1, y: ROWS - 1 }, house: true, release: 4000 },
  { name: 'clyde',  color: '#ffb852', start: [15, 14], scatter: { x: 0, y: ROWS - 1 }, house: true, release: 8000 },
];

// --- Mode schedule (scatter / chase) ---
const SCHEDULE = [
  ['scatter', 7], ['chase', 20], ['scatter', 7], ['chase', 20],
  ['scatter', 5], ['chase', 20], ['scatter', 5], ['chase', 99999],
];
let schedIdx, modeTimer, globalMode;

// --- Game state ---
let score, lives, level, combo;
let state = 'start';        // start | playing | paused | dying | levelclear | gameover
let stateTimer = 0;
let frame = 0;
let now = performance.now();

function updateHud() {
  document.getElementById('score').textContent = 'SCORE: ' + score;
  document.getElementById('lives').textContent = 'LIVES: ' + Math.max(0, lives);
  document.getElementById('level').textContent = 'LEVEL ' + level;
}

function resetPositions() {
  pac = makeEntity(13, 23);
  pac.dir = { x: -1, y: 0 };
  pac.want = { x: -1, y: 0 };
  pac.face = Math.PI;

  ghosts = GHOST_DEFS.map(def => {
    const g = makeEntity(def.start[0], def.start[1]);
    g.name = def.name;
    g.color = def.color;
    g.scatter = def.scatter;
    g.dir = { x: -1, y: 0 };
    g.frightened = false;
    g.frightenedUntil = 0;
    g.eyes = false;
    g.inHouse = def.house;
    g.leaving = false;
    g.entering = false;
    g.releaseAt = now + def.release;
    return g;
  });
  [blinky, pinky, inky, clyde] = ghosts;

  schedIdx = 0;
  globalMode = SCHEDULE[0][0];
  modeTimer = SCHEDULE[0][1];
  combo = 0;
}

function loadLevel() {
  grid = MAZE.map(r => r.split(''));
  countPellets();
  resetPositions();
  updateHud();
}

function fullReset() {
  score = 0;
  lives = 3;
  level = 1;
  loadLevel();
}

// --- Power pellet ---
function frighten() {
  combo = 0;
  for (const g of ghosts) {
    if (g.eyes) continue;
    g.frightened = true;
    g.frightenedUntil = now + 6000;
    g.dir = { x: -g.dir.x, y: -g.dir.y };
  }
}

// --- Ghost targeting ---
function getTarget(g) {
  if (g.eyes) return { x: 13, y: 11 };
  if (globalMode === 'scatter' && !g.frightened) return g.scatter;

  const pc = { x: col(pac), y: row(pac) };
  if (g.name === 'blinky') return pc;
  if (g.name === 'pinky') return { x: pc.x + 4 * pac.dir.x, y: pc.y + 4 * pac.dir.y };
  if (g.name === 'inky') {
    const ax = pc.x + 2 * pac.dir.x, ay = pc.y + 2 * pac.dir.y;
    const bx = col(blinky), by = row(blinky);
    return { x: ax + (ax - bx), y: ay + (ay - by) };
  }
  // clyde: chase when far, flee to his corner when close
  const dx = pc.x - col(g), dy = pc.y - row(g);
  return (dx * dx + dy * dy) > 64 ? pc : g.scatter;
}

function chooseGhostDir(g, c, r) {
  let opts = DIRS.filter(d =>
    !(d.x === -g.dir.x && d.y === -g.dir.y) &&
    !isWallGhost(c + d.x, r + d.y) &&
    !inHouseTile(c + d.x, r + d.y)
  );
  if (opts.length === 0) opts = [{ x: -g.dir.x, y: -g.dir.y }];

  if (g.frightened) return opts[(Math.random() * opts.length) | 0];

  const t = getTarget(g);
  let best = opts[0], bestDist = Infinity;
  for (const d of opts) {
    const nx = c + d.x, ny = r + d.y;
    const dist = (nx - t.x) * (nx - t.x) + (ny - t.y) * (ny - t.y);
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

// --- Movement ---
function moveGhost(g) {
  // Waiting in the house for release
  if (g.inHouse && !g.leaving && !g.entering) {
    if (now >= g.releaseAt) g.leaving = true;
    else return;
  }

  // Scripted exit: slide to the door column, then climb out
  if (g.leaving) {
    const tx = 13 * CELL + CELL / 2;
    const outY = 11 * CELL + CELL / 2;
    if (Math.abs(g.x - tx) > 2) {
      g.x += Math.sign(tx - g.x) * 2;
    } else {
      g.x = tx;
      g.y -= 2;
      if (g.y <= outY) {
        g.y = outY;
        g.leaving = false;
        g.inHouse = false;
        g.dir = { x: -1, y: 0 };
      }
    }
    return;
  }

  // Scripted re-entry after being eaten
  if (g.entering) {
    const tx = 13 * CELL + CELL / 2;
    const homeY = 14 * CELL + CELL / 2;
    if (Math.abs(g.x - tx) > 3) {
      g.x += Math.sign(tx - g.x) * 3;
    } else if (g.y < homeY) {
      g.x = tx;
      g.y += 3;
    } else {
      g.y = homeY;
      g.entering = false;
      g.eyes = false;
      g.inHouse = true;
      g.releaseAt = now + 500;
      snapCenter(g);
    }
    return;
  }

  // Frightened ghosts crawl at half speed
  if (g.frightened && frame % 2 === 0) return;

  const speed = g.eyes ? 4 : 2;

  if (aligned(g)) {
    let c = col(g), r = row(g);

    if (r === TUNNEL_ROW) {
      if (c <= 0 && g.dir.x < 0) { g.x = (COLS - 1) * CELL + CELL / 2; c = COLS - 1; }
      else if (c >= COLS - 1 && g.dir.x > 0) { g.x = CELL / 2; c = 0; }
    }

    if (g.eyes && c === 13 && r === 11) {
      g.entering = true;
      g.dir = { x: 0, y: 1 };
      snapCenter(g);
      return;
    }

    g.dir = chooseGhostDir(g, c, r);
  }

  g.x += g.dir.x * speed;
  g.y += g.dir.y * speed;
}

function movePac() {
  if (aligned(pac)) {
    let c = col(pac), r = row(pac);

    if (r === TUNNEL_ROW) {
      if (c <= 0 && pac.dir.x < 0) { pac.x = (COLS - 1) * CELL + CELL / 2; c = COLS - 1; }
      else if (c >= COLS - 1 && pac.dir.x > 0) { pac.x = CELL / 2; c = 0; }
    }

    const ch = grid[r][c];
    if (ch === '.') { grid[r][c] = ' '; score += 10; pelletsLeft--; updateHud(); }
    else if (ch === 'o') { grid[r][c] = ' '; score += 50; pelletsLeft--; updateHud(); frighten(); }

    if ((pac.want.x || pac.want.y) && !isWallPac(c + pac.want.x, r + pac.want.y)) {
      pac.dir = { x: pac.want.x, y: pac.want.y };
    }
    if (isWallPac(c + pac.dir.x, r + pac.dir.y)) {
      pac.dir = { x: 0, y: 0 };
    }
  }

  pac.x += pac.dir.x * 2;
  pac.y += pac.dir.y * 2;
  if (pac.dir.x || pac.dir.y) pac.face = Math.atan2(pac.dir.y, pac.dir.x);
}

function checkCollisions() {
  for (const g of ghosts) {
    if (g.inHouse || g.leaving || g.entering || g.eyes) continue;
    if (Math.hypot(pac.x - g.x, pac.y - g.y) < CELL * 0.6) {
      if (g.frightened) {
        g.frightened = false;
        g.eyes = true;
        snapCenter(g);
        score += 200 * Math.pow(2, combo);
        combo++;
        updateHud();
      } else {
        lives--;
        updateHud();
        state = lives < 0 ? 'gameover' : 'dying';
        stateTimer = 1.2;
        return;
      }
    }
  }
}

// --- Main update ---
function update(dt) {
  frame++;
  now = performance.now();

  if (state === 'playing') {
    let anyFrightened = false;
    for (const g of ghosts) {
      if (g.frightened) {
        if (now > g.frightenedUntil) g.frightened = false;
        else anyFrightened = true;
      }
    }
    if (!anyFrightened) combo = 0;

    if (!anyFrightened) {
      modeTimer -= dt;
      if (modeTimer <= 0 && schedIdx < SCHEDULE.length - 1) {
        schedIdx++;
        globalMode = SCHEDULE[schedIdx][0];
        modeTimer = SCHEDULE[schedIdx][1];
        for (const g of ghosts) {
          if (!g.eyes && !g.inHouse && !g.leaving && !g.entering) {
            g.dir = { x: -g.dir.x, y: -g.dir.y };
          }
        }
      }
    }

    movePac();
    for (const g of ghosts) moveGhost(g);
    checkCollisions();

    if (state === 'playing' && pelletsLeft === 0) {
      state = 'levelclear';
      stateTimer = 1.6;
    }
  } else if (state === 'dying') {
    stateTimer -= dt;
    if (stateTimer <= 0) { resetPositions(); state = 'playing'; }
  } else if (state === 'levelclear') {
    stateTimer -= dt;
    if (stateTimer <= 0) { level++; loadLevel(); state = 'playing'; }
  }
}

// --- Rendering ---
function drawPellets() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c];
      const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
      if (ch === '.') {
        ctx.fillStyle = '#ffd7b0';
        ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      } else if (ch === 'o') {
        if (Math.floor(now / 150) % 2 === 0) {
          ctx.fillStyle = '#ffd7b0';
          ctx.beginPath();
          ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

function drawPac() {
  const r = CELL / 2 - 1;
  let open = 0.16;
  if (state === 'playing' && (pac.dir.x || pac.dir.y)) {
    open = 0.05 + 0.22 * (1 + Math.sin(frame * 0.35)) / 2;
  }
  ctx.save();
  ctx.translate(pac.x, pac.y);
  ctx.rotate(pac.face || 0);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, open * Math.PI, (2 - open) * Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGhost(g) {
  const r = CELL / 2 - 1;
  const x = g.x, y = g.y;

  let body = null;
  if (!g.eyes) {
    if (g.frightened) {
      const flashing = now > g.frightenedUntil - 1600 && Math.floor(now / 200) % 2 === 0;
      body = flashing ? '#ffffff' : '#2637d6';
    } else {
      body = g.color;
    }
  }

  if (body) {
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(x, y - 1, r, Math.PI, 0);
    ctx.lineTo(x + r, y + r);
    const feet = 3;
    for (let i = 0; i < feet; i++) {
      const x0 = x + r - (i * 2 * r) / feet;
      ctx.lineTo(x0 - r / feet, y + r - 4);
      ctx.lineTo(x0 - (2 * r) / feet, y + r);
    }
    ctx.closePath();
    ctx.fill();
  }

  if (g.frightened && !g.eyes) {
    ctx.fillStyle = '#ffd7b0';
    ctx.fillRect(x - 4, y - 2, 2, 3);
    ctx.fillRect(x + 2, y - 2, 2, 3);
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - 3, y - 2, 2.6, 0, Math.PI * 2);
    ctx.arc(x + 3, y - 2, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20228c';
    const px = g.dir.x * 1.8, py = g.dir.y * 1.8;
    ctx.beginPath();
    ctx.arc(x - 3 + px, y - 2 + py, 1.4, 0, Math.PI * 2);
    ctx.arc(x + 3 + px, y - 2 + py, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOverlay(lines) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(0, canvas.height / 2 - 70, canvas.width, 140);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 30px "Courier New", monospace';
  ctx.fillText(lines[0], canvas.width / 2, canvas.height / 2 - 8);
  if (lines[1]) {
    ctx.fillStyle = '#eee';
    ctx.font = '15px "Courier New", monospace';
    ctx.fillText(lines[1], canvas.width / 2, canvas.height / 2 + 26);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(mazeCanvas, 0, 0);
  drawPellets();

  if (pac) drawPac();
  if (ghosts) for (const g of ghosts) drawGhost(g);

  if (state === 'start') drawOverlay(['PAC-MAN', 'Press ENTER or click START']);
  else if (state === 'paused') drawOverlay(['PAUSED', 'Press P to resume']);
  else if (state === 'gameover') drawOverlay(['GAME OVER', 'Press ENTER to play again']);
  else if (state === 'levelclear') drawOverlay(['LEVEL CLEAR', '']);
}

// --- Loop ---
let last = performance.now();
function loop(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// --- Input ---
window.addEventListener('keydown', e => {
  const k = e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();

  if (k === 'Enter') {
    if (state === 'start' || state === 'gameover') { fullReset(); state = 'playing'; }
    return;
  }
  if (k === 'p' || k === 'P') {
    if (state === 'playing') state = 'paused';
    else if (state === 'paused') state = 'playing';
    return;
  }
  if (state !== 'playing') return;

  if (k === 'ArrowUp') pac.want = { x: 0, y: -1 };
  else if (k === 'ArrowDown') pac.want = { x: 0, y: 1 };
  else if (k === 'ArrowLeft') pac.want = { x: -1, y: 0 };
  else if (k === 'ArrowRight') pac.want = { x: 1, y: 0 };
});

document.getElementById('startBtn').addEventListener('click', () => {
  if (state === 'start' || state === 'gameover') { fullReset(); state = 'playing'; }
});
document.getElementById('pauseBtn').addEventListener('click', () => {
  if (state === 'playing') state = 'paused';
  else if (state === 'paused') state = 'playing';
});

fullReset();
requestAnimationFrame(loop);
