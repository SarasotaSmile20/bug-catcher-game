const gameArea = document.getElementById("game-area");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const bestScoreEl = document.getElementById("best-score");
const startBtn = document.getElementById("start-btn");
const messageEl = document.getElementById("message");

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

// Load best score from localStorage
const storedBest = parseInt(localStorage.getItem("spaceBugBest") || "0", 10);
if (!isNaN(storedBest)) {
  bestScoreEl.textContent = storedBest;
}

function resetGame() {
  score = 0;
  timeLeft = 30;
  scoreEl.textContent = "0";
  timerEl.textContent = "30";

  // Clear bugs and powerups
  [...gameArea.querySelectorAll(".bug, .powerup, .screen-flash")].forEach(el =>
    el.remove()
  );

  doublePointsActive = false;
  freezeActive = false;
  if (powerupTimeout) {
    clearTimeout(powerupTimeout);
    powerupTimeout = null;
  }
}

function startGame() {
  if (gameRunning) return;

  gameRunning = true;
  resetGame();
  startBtn.classList.add("hidden");
  hideMessage();

  // Main spawn loop
  gameTickInterval = setInterval(() => {
    if (!freezeActive) {
      // More powerful feel: more bugs / more chaos
      const spawnCount = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < spawnCount; i++) {
        spawnBug();
      }
    }

    // Chance to spawn power-up
    if (Math.random() < 0.18) {
      spawnPowerup();
    }
  }, 850);

  // Timer
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

  // Play game over sound (safe if file missing)
  playSoundSafe(sndGameover);

  // Update best score
  const best = parseInt(localStorage.getItem("spaceBugBest") || "0", 10);
  if (score > best) {
    localStorage.setItem("spaceBugBest", String(score));
    bestScoreEl.textContent = score.toString();
  }

  // Show message
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
  // Keep a small margin
  const margin = 60;
  const x =
    Math.random() * (rect.width - margin * 2) + margin;
  const y =
    Math.random() * (rect.height - margin * 2) + margin;

  const bug = document.createElement("div");
  bug.className = `bug variant-${1 + Math.floor(Math.random() * 4)}`;
  bug.style.left = `${x}px`;
  bug.style.top = `${y}px`;

  const inner = document.createElement("div");
  inner.className = "bug-inner";
  const face = document.createElement("span");
  inner.appendChild(face);
  bug.appendChild(inner);

  bug.addEventListener("click", () => handleBugClick(bug, x, y), {
    passive: true
  });

  gameArea.appendChild(bug);

  // Auto-despawn after a while
  setTimeout(() => {
    bug.remove();
  }, 4000);
}

function handleBugClick(bug, x, y) {
  if (!gameRunning) return;

  // More powerful weapon feel: blast ring + possible multi-hit
  createBlastRing(x, y);

  // Remove clicked bug
  bug.remove();

  // Score
  let points = 10;
  if (doublePointsActive) {
    points *= 2;
  }
  score += points;
  scoreEl.textContent = score.toString();

  // Play laser sound
  playSoundSafe(sndLaser);

  // Optional: small chance to chain-blast nearby bugs
  chainBlastNearby(x, y);
}

function chainBlastNearby(x, y) {
  const radius = 70; // pixels

  const bugs = [...gameArea.querySelectorAll(".bug")];
  bugs.forEach(bug => {
    const rect = bug.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2 - gameArea.getBoundingClientRect().left;
    const centerY = rect.top + rect.height / 2 - gameArea.getBoundingClientRect().top;

    const dx = centerX - x;
    const dy = centerY - y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < radius) {
      bug.remove();
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
  // Limit to 1–2 visible powerups
  const existing = gameArea.querySelectorAll(".powerup").length;
  if (existing >= 2) return;

  const rect = gameArea.getBoundingClientRect();
  const margin = 70;
  const x =
    Math.random() * (rect.width - margin * 2) + margin;
  const y =
    Math.random() * (rect.height - margin * 2) + margin;

  const types = ["freeze", "double", "mega"];
  const type = types[Math.floor(Math.random() * types.length)];

  const el = document.createElement("div");
  el.className = `powerup ${type}`;
  el.dataset.type = type;

  if (type === "freeze") {
    el.textContent = "Freeze";
  } else if (type === "double") {
    el.textContent = "2x";
  } else {
    el.textContent = "Mega";
  }

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

  // Despawn after a few seconds if unused
  setTimeout(() => el.remove(), 5000);
}

function activatePowerup(type) {
  if (type === "freeze") {
    applyFreezePowerup();
  } else if (type === "double") {
    applyDoublePointsPowerup();
  } else if (type === "mega") {
    applyMegaBlastPowerup();
  }
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

  // Screen flash
  const flash = document.createElement("div");
  flash.className = "screen-flash";
  gameArea.appendChild(flash);
  setTimeout(() => flash.remove(), 400);

  // Remove all bugs and award some points
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
    // ignore if autoplay blocked, etc.
  }
}

// Events

startBtn.addEventListener("click", startGame);
