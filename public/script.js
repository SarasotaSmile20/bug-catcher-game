const gameArea = document.getElementById("game-area");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const bestScoreEl = document.getElementById("best-score");
const startBtn = document.getElementById("start-btn");
const messageEl = document.getElementById("message");
const blaster = document.getElementById("blaster");

// Sounds
const sndLaser = document.getElementById("snd-laser");
const sndPowerup = document.getElementById("snd-powerup");
const sndMega = document.getElementById("snd-mega");
const sndGameover = document.getElementById("snd-gameover");

let score = 0;
let timeLeft = 30;
let gameTickInterval = null;
let timerInterval = null;
let gameRunning = false;

let doublePointsActive = false;
let freezeActive = false;
let powerupTimeout = null;

// blaster position (in pixels within gameArea)
let blasterX = 0;
let blasterWidth = 0;

// Load best score
const storedBest = parseInt(localStorage.getItem("spaceBugBest") || "0", 10);
if (!isNaN(storedBest)) {
  bestScoreEl.textContent = storedBest;
}

/* ---------- BLASTER SETUP & MOVEMENT ---------- */

function initBlaster() {
  if (!gameArea || !blaster) return;
  const areaRect = gameArea.getBoundingClientRect();
  const blRect = blaster.getBoundingClientRect();

  // if width not known yet, assume 160px (matches CSS)
  blasterWidth = blRect.width || 160;

  // center it
  blasterX = (areaRect.width - blasterWidth) / 2;
  blaster.style.left = `${blasterX}px`;
}

function moveBlasterTo(newX) {
  const areaRect = gameArea.getBoundingClientRect();
  const min = 0;
  const max = areaRect.width - blasterWidth;

  blasterX = Math.max(min, Math.min(newX, max));
  blaster.style.left = `${blasterX}px`;
}

function moveBlaster(delta) {
  moveBlasterTo(blasterX + delta);
}

// keyboard controls
window.addEventListener("keydown", e => {
  if (!gameRunning) return;

  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
    e.preventDefault();
    moveBlaster(-30);
  } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
    e.preventDefault();
    moveBlaster(30);
  }
});

// tap / click in empty space to slide blaster there (good for tablet)
gameArea.addEventListener(
  "click",
  e => {
    if (!gameRunning) return;
    // ignore clicks on bugs/powerups/buttons
    if (e.target !== gameArea) return;

    const areaRect = gameArea.getBoundingClientRect();
    const targetX = e.clientX - areaRect.left;
    moveBlasterTo(targetX - blasterWidth / 2);
  },
  { passive: true }
);

// re-center on resize
window.addEventListener("resize", () => {
  initBlaster();
});

/* ---------- GAME LOGIC ---------- */

function resetGame() {
  score = 0;
  timeLeft = 30;
  scoreEl.textContent = "0";
  timerEl.textContent = "30";

  [...gameArea.querySelectorAll(".bug, .powerup, .screen-flash")].forEach(el =>
    el.remove()
  );

  doublePointsActive = false;
  freezeActive = false;
  if (powerupTimeout) {
    clearTimeout(powerupTimeout);
    powerupTimeout = null;
  }

  // re-center blaster for new mission
  initBlaster();
}

function startGame() {
  if (gameRunning) return;

  gameRunning = true;
  resetGame();
  startBtn.classList.add("hidden");
  hideMessage();

  // main spawn loop
  gameTickInterval = setInterval(() => {
    if (!freezeActive) {
      const spawnCount = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < spawnCount; i++) {
        spawnBug();
      }
    }

    if (Math.random() < 0.18) {
      spawnPowerup();
    }
  }, 850);

  // timer
  timerInterval = setInterval(() => {
    timeLeft -= 1;
    timerEl.textContent = timeLeft.toString();

    if (timeLeft <= 0) {
      endGame();
    }
  }, 1000);
}

function endGame() {
  gameRunning = false;
  clearInterval(gameTickInterval);
  clearInterval(timerInterval);
  gameTickInterval = null;
  timerInterval = null;

  if (powerupTimeout) {
    clearTimeout(powerupTimeout);
    powerupTimeout = null;
  }

  playSoundSafe(sndGameover);

  const best = parseInt(localStorage.getItem("spaceBugBest") || "0", 10);
  if (score > best) {
    localStorage.setItem("spaceBugBest", String(score));
    bestScoreEl.textContent = score.toString();
  }

  showMessage(
    "Mission Complete!",
    `You blasted <strong>${score}</strong> space bugs!`,
    "Tap <em>Start Mission</em> to play again."
  );

  startBtn.textContent = "Play Again";
  startBtn.classList.remove("hidden");
}

function spawnBug() {
  const rect = gameArea.getBoundingClientRect();
  const margin = 60;
  const x = Math.random() * (rect.width - margin * 2) + margin;
  const y = Math.random() * (rect.height - margin * 2) + margin;

  const bug = document.createElement("div");
  bug.className = `bug variant-${1 + Math.floor(Math.random() * 4)}`;
  bug.style.left = `${x}px`;
  bug.style.top = `${y}px`;

  const inner = document.createElement("div");
  inner.className = "bug-inner";
  const face = document.createElement("span");
  inner.appendChild(face);
  bug.appendChild(inner);

  bug.addEventListener(
    "click",
    () => handleBugClick(bug, x, y),
    { passive: true }
  );

  gameArea.appendChild(bug);

  setTimeout(() => {
    bug.remove();
  }, 4000);
}

function handleBugClick(bug, x, y) {
  if (!gameRunning) return;

  createBlastRing(x, y);
  bug.remove();

  let points = 10;
  if (doublePointsActive) points *= 2;
  score += points;
  scoreEl.textContent = score.toString();

  playSoundSafe(sndLaser);
  chainBlastNearby(x, y);
}

function chainBlastNearby(x, y) {
  const radius = 70;
  const bugs = [...gameArea.querySelectorAll(".bug")];
  const gaRect = gameArea.getBoundingClientRect();

  bugs.forEach(b => {
    const rect = b.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2 - gaRect.left;
    const centerY = rect.top + rect.height / 2 - gaRect.top;

    const dx = centerX - x;
    const dy = centerY - y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < radius) {
      b.remove();
      let points = 5;
      if (doublePointsActive) points *= 2;
      score += points;
      scoreEl.textContent = score.toString();
    }
  });
}

function createBlastRing(x, y) {
  const ring = document.createElement("div");
  ring.className = "blast-ring";
  ring.style.left = `${x - 40}px`;
  ring.style.top = `${y - 40}px`;
  gameArea.appendChild(ring);

  setTimeout(() => ring.remove(), 350);
}

function spawnPowerup() {
  const existing = gameArea.querySelectorAll(".powerup").length;
  if (existing >= 2) return;

  const rect = gameArea.getBoundingClientRect();
  const margin = 70;
  const x = Math.random() * (rect.width - margin * 2) + margin;
  const y = Math.random() * (rect.height - margin * 2) + margin;

  const types = ["freeze", "double", "mega"];
  const type = types[Math.floor(Math.random() * types.length)];

  const el = document.createElement("div");
  el.className = `powerup ${type}`;
  el.dataset.type = type;

  if (type === "freeze") el.textContent = "Freeze";
  if (type === "double") el.textContent = "2x";
  if (type === "mega") el.textContent = "Mega";

  el.style.left = `${x}px`;
  el.style.top = `${y}px`;

  el.addEventListener(
    "click",
    () => {
      if (!gameRunning) return;
      activatePowerup(type);
      el.remove();
    },
    { passive: true }
  );

  gameArea.appendChild(el);

  setTimeout(() => el.remove(), 5000);
}

function activatePowerup(type) {
  if (type === "freeze") applyFreezePowerup();
  if (type === "double") applyDoublePointsPowerup();
  if (type === "mega") applyMegaBlastPowerup();
}

function applyFreezePowerup() {
  freezeActive = true;
  playSoundSafe(sndPowerup);

  if (powerupTimeout) clearTimeout(powerupTimeout);
  powerupTimeout = setTimeout(() => {
    freezeActive = false;
    powerupTimeout = null;
  }, 3500);
}

function applyDoublePointsPowerup() {
  doublePointsActive = true;
  playSoundSafe(sndPowerup);

  if (powerupTimeout) clearTimeout(powerupTimeout);
  powerupTimeout = setTimeout(() => {
    doublePointsActive = false;
    powerupTimeout = null;
  }, 6000);
}

function applyMegaBlastPowerup() {
  playSoundSafe(sndMega);

  const flash = document.createElement("div");
  flash.className = "screen-flash";
  gameArea.appendChild(flash);
  setTimeout(() => flash.remove(), 400);

  const bugs = [...gameArea.querySelectorAll(".bug")];
  let gained = 0;
  bugs.forEach(bug => {
    bug.remove();
    gained += doublePointsActive ? 6 : 3;
  });

  score += gained;
  scoreEl.textContent = score.toString();
}

function showMessage(title, body, footer) {
  messageEl.innerHTML = `
    <div class="message-title">${title}</div>
    <div class="message-body">${body}</div>
    <div class="message-footer">${footer}</div>
  `;
  messageEl.classList.remove("hidden");
}

function hideMessage() {
  messageEl.classList.add("hidden");
}

function playSoundSafe(audio) {
  if (!audio) return;
  try {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {
    // ignore
  }
}

/* ---------- EVENT HOOKS ---------- */

startBtn.addEventListener("click", startGame);

// initialize once DOM is laid out
initBlaster();
