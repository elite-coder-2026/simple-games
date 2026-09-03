const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const GRAVITY = 0.5;
const MOVE_SPEED = 3;
const JUMP_VELOCITY = -9;

// --- Level geometry: three stacked platforms with ladders connecting them ---
const platforms = [
  { x: 0,   y: 380, w: 640, h: 20 },   // ground floor
  { x: 40,  y: 280, w: 260, h: 16 },
  { x: 340, y: 280, w: 260, h: 16 },
  { x: 40,  y: 180, w: 260, h: 16 },
  { x: 340, y: 180, w: 260, h: 16 },
  { x: 40,  y: 80,  w: 560, h: 16 },
];

const ladders = [
  { x: 290, y: 180, w: 20, h: 200 },
  { x: 590, y: 80,  w: 20, h: 200 },
  { x: 140, y: 80,  w: 20, h: 100 },
];

// Collectible plates (the "goal" items, standing in for Hard Hat Mack's steel plates)
let plates = [
  { x: 60,  y: 260, w: 16, h: 16, collected: false },
  { x: 560, y: 260, w: 16, h: 16, collected: false },
  { x: 60,  y: 160, w: 16, h: 16, collected: false },
  { x: 560, y: 160, w: 16, h: 16, collected: false },
  { x: 300, y: 60,  w: 16, h: 16, collected: false },
];

// Falling bolts (hazard) spawn from the top and fall straight down
let bolts = [];
let boltTimer = 0;

// Patrol "inspector" walks back and forth on the ground floor
const patrol = { x: 300, y: 364, w: 16, h: 16, dir: 1, speed: 1.4 };

const player = {
  x: 20, y: 364, w: 16, h: 16,
  vx: 0, vy: 0,
  onGround: false,
  onLadder: false,
  facing: 1,
};

let score = 0;
let lives = 3;
let keys = {};

document.addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
document.addEventListener('keyup', e => { keys[e.code] = false; });

const aabb = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const onLadderNow = () =>
  ladders.some(l => player.x + player.w > l.x && player.x < l.x + l.w &&
                     player.y + player.h > l.y && player.y < l.y + l.h);

const groundBelow = () => {
  for (const p of platforms) {
    if (player.x + player.w > p.x && player.x < p.x + p.w) {
      const feetY = player.y + player.h;
      if (feetY >= p.y && feetY <= p.y + 10 && player.vy >= 0) return p;
    }
  }
  return null;
};

const resetPlayer = () => {
  player.x = 20; player.y = 364; player.vx = 0; player.vy = 0;
};

const loseLife = () => {
  lives -= 1;
  document.getElementById('lives').textContent = 'LIVES: ' + lives;
  if (lives <= 0) {
    lives = 3;
    score = 0;
    plates.forEach(p => p.collected = false);
    document.getElementById('score').textContent = 'SCORE: 0';
    document.getElementById('lives').textContent = 'LIVES: 3';
  }
  resetPlayer();
};

const update = () => {
  player.onLadder = onLadderNow();

  // Horizontal movement
  if (keys['ArrowLeft']) { player.vx = -MOVE_SPEED; player.facing = -1; }
  else if (keys['ArrowRight']) { player.vx = MOVE_SPEED; player.facing = 1; }
  else player.vx = 0;

  if (player.onLadder) {
    player.vy = 0;
    if (keys['ArrowUp']) player.vy = -MOVE_SPEED;
    else if (keys['ArrowDown']) player.vy = MOVE_SPEED;
  } else {
    player.vy += GRAVITY;
    if (keys['Space'] && player.onGround) {
      player.vy = JUMP_VELOCITY;
      player.onGround = false;
    }
  }

  player.x += player.vx;
  player.y += player.vy;
  player.x = Math.max(0, Math.min(W - player.w, player.x));

  // Platform collision (land on top only)
  player.onGround = false;
  for (const p of platforms) {
    if (player.x + player.w > p.x && player.x < p.x + p.w) {
      const feetY = player.y + player.h;
      if (feetY >= p.y && feetY <= p.y + 12 && player.vy >= 0) {
        player.y = p.y - player.h;
        player.vy = 0;
        player.onGround = true;
      }
    }
  }
  if (player.y + player.h > H) {
    player.y = H - player.h;
    player.vy = 0;
    player.onGround = true;
  }

  // Plates
  for (const plate of plates) {
    if (!plate.collected && aabb(player, plate)) {
      plate.collected = true;
      score += 100;
      document.getElementById('score').textContent = 'SCORE: ' + score;
    }
  }
  if (plates.every(p => p.collected)) {
    plates.forEach(p => p.collected = false);
    score += 500;
    document.getElementById('score').textContent = 'SCORE: ' + score;
  }

  // Bolts: spawn and fall
  boltTimer++;
  if (boltTimer > 70) {
    boltTimer = 0;
    bolts.push({ x: 60 + Math.random() * (W - 120), y: 90, w: 8, h: 8 });
  }
  bolts.forEach(b => b.y += 3.2);
  bolts = bolts.filter(b => b.y < H);
  for (const b of bolts) {
    if (aabb(player, b)) {
      bolts = bolts.filter(x => x !== b);
      loseLife();
      break;
    }
  }

  // Patrol
  patrol.x += patrol.dir * patrol.speed;
  if (patrol.x < 0 || patrol.x > W - patrol.w) patrol.dir *= -1;
  if (aabb(player, patrol)) loseLife();
};

const draw = () => {
  ctx.clearRect(0, 0, W, H);

  // Platforms
  ctx.fillStyle = '#3a3a4a';
  platforms.forEach(p => ctx.fillRect(p.x, p.y, p.w, p.h));

  // Ladders
  ctx.strokeStyle = '#8a7a4a';
  ctx.lineWidth = 2;
  ladders.forEach(l => {
    ctx.strokeRect(l.x + 2, l.y, l.w - 4, l.h);
    for (let ry = l.y + 8; ry < l.y + l.h; ry += 16) {
      ctx.beginPath();
      ctx.moveTo(l.x, ry);
      ctx.lineTo(l.x + l.w, ry);
      ctx.stroke();
    }
  });

  // Plates
  ctx.fillStyle = '#4ade80';
  plates.forEach(p => { if (!p.collected) ctx.fillRect(p.x, p.y, p.w, p.h); });

  // Bolts
  ctx.fillStyle = '#f87171';
  bolts.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));

  // Patrol
  ctx.fillStyle = '#facc15';
  ctx.fillRect(patrol.x, patrol.y, patrol.w, patrol.h);

  // Player
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(player.x, player.y, player.w, player.h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(player.x + (player.facing > 0 ? player.w - 4 : 0), player.y + 2, 4, 4);
};

const loop = () => {
  update();
  draw();
  requestAnimationFrame(loop);
};
loop();
