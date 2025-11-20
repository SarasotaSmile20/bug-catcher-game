// Invoice generator deployed earlier installed a service worker that still
// served cached files. Remove any existing registrations/caches so the new
// Bug Catcher build renders immediately.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });
  if ("caches" in window) {
    caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
  }
}

window.addEventListener("load", () => {
  const gameArea = document.getElementById("game-area");
  const scoreEl = document.getElementById("score");
  const timerEl = document.getElementById("timer");
  const bestScoreEl = document.getElementById("best-score");
  const startBtn = document.getElementById("start-btn");
  const messageEl = document.getElementById("message");
  const blaster = document.getElementById("blaster");
  const playerNameInput = document.getElementById("player-name");
  const leaderboardList = document.getElementById("leaderboard-list");
  const currentPlayerEl = document.getElementById("current-player");
  const gamePage = document.querySelector(".game-page");
  const gameWrapper = document.querySelector(".game-wrapper");
  const hud = document.querySelector(".hud");
  const playerPanel = document.querySelector(".player-panel");
  const instructionsSection = document.querySelector(".instructions");

  // Sounds
  const sndLaser = document.getElementById("snd-laser");
  const sndPowerup = document.getElementById("snd-powerup");
  const sndMega = document.getElementById("snd-mega");
  const sndGameover = document.getElementById("snd-gameover");

  let score = 0;
  let timeLeft = 30;
  let spawnTimeout = null;
  let timerInterval = null;
  let gameRunning = false;

  let doublePointsActive = false;
  let freezeActive = false;
  let powerupTimeout = null;
  const INITIAL_SPAWN_DELAY = 650;
  const MIN_SPAWN_DELAY = 180;
  const SPAWN_ACCELERATION = 0.9;
  let spawnDelay = INITIAL_SPAWN_DELAY;

  // blaster position (in pixels within gameArea)
  let blasterX = 0;
  let blasterWidth = 0;
  const activeShots = [];
  let sprayLoopId = null;
  let sprayInterval = null;
  let lastShotTime = 0;
  let currentPlayer = "";
  const SCOREBOARD_KEY = "spaceBugScores";
  const PLAYER_NAME_KEY = "spaceBugPlayerName";
  let leaderboardData = loadLeaderboard();
  renderLeaderboard();

  if (playerNameInput) {
    const savedName = localStorage.getItem(PLAYER_NAME_KEY) || "";
    playerNameInput.value = savedName;
    currentPlayer = savedName.trim();
    if (currentPlayerEl) currentPlayerEl.textContent = currentPlayer || "—";
    playerNameInput.addEventListener("input", () => {
      const sanitized = playerNameInput.value.replace(/[^a-z0-9 _-]/gi, "").slice(0, 16);
      if (sanitized !== playerNameInput.value) {
        playerNameInput.value = sanitized;
      }
      localStorage.setItem(PLAYER_NAME_KEY, sanitized);
      if (currentPlayerEl) currentPlayerEl.textContent = sanitized || "—";
    });
  }

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

    blasterWidth = blRect.width || 160;

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

  // keyboard controls – ALWAYS allowed (even before start)
  window.addEventListener("keydown", e => {
    const typingName =
      playerNameInput && document.activeElement === playerNameInput;
    if (typingName) {
      return;
    }

    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
      e.preventDefault();
      moveBlaster(-30);
    }

    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
      e.preventDefault();
      moveBlaster(30);
    }

  });

  function shouldIgnorePointerTarget(target) {
    if (!target) return false;
    return Boolean(
      target.closest(".bug") ||
        target.closest(".powerup") ||
        target.closest("#start-btn") ||
        target.closest(".message")
    );
  }

  function moveToPointer(clientX) {
    const areaRect = gameArea.getBoundingClientRect();
    const targetX = clientX - areaRect.left;
    moveBlasterTo(targetX - blasterWidth / 2);
  }

  let pointerDragging = false;

  gameArea.addEventListener("pointerdown", e => {
    if (shouldIgnorePointerTarget(e.target)) return;
    pointerDragging = true;
    moveToPointer(e.clientX);
    if (e.pointerType === "touch") {
      e.preventDefault();
    }
  });

  gameArea.addEventListener("pointermove", e => {
    if (!pointerDragging) return;
    moveToPointer(e.clientX);
    if (e.pointerType === "touch") {
      e.preventDefault();
    }
  });

  ["pointerup", "pointerleave", "pointercancel"].forEach(evt => {
    window.addEventListener(evt, () => {
      pointerDragging = false;
    });
  });

  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("orientationchange", resizeCanvas);

  function resizeCanvas() {
    if (!gameArea) return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxContentWidth = Math.min(960, viewportWidth);

    if (gamePage) {
      gamePage.style.width = `${maxContentWidth}px`;
    }

    const pageStyles = gamePage ? getComputedStyle(gamePage) : null;
    const padLeft = pageStyles ? parseFloat(pageStyles.paddingLeft || "0") : 0;
    const padRight = pageStyles ? parseFloat(pageStyles.paddingRight || "0") : 0;
    const horizontalPadding = padLeft + padRight;
    const areaWidth = Math.max(320, maxContentWidth - horizontalPadding);

    if (gameWrapper) {
      gameWrapper.style.width = `${areaWidth}px`;
      gameWrapper.style.minHeight = `${areaWidth * 0.9}px`;
    }
    gameArea.style.width = `${areaWidth}px`;

    const areaHeight = Math.min(
      Math.max(320, viewportHeight - 80),
      areaWidth * 1.2
    );
    gameArea.style.height = `${areaHeight}px`;

    initBlaster();
  }

  /* ---------- GAME LOGIC ---------- */

  function resetGame() {
    score = 0;
    timeLeft = 30;
    scoreEl.textContent = "0";
    timerEl.textContent = "30";

    [...gameArea.querySelectorAll(".bug, .powerup, .screen-flash")].forEach(el =>
      el.remove()
    );
    clearShots();
    stopAutomaticSpray();
    lastShotTime = 0;
    spawnDelay = INITIAL_SPAWN_DELAY;
    if (spawnTimeout) {
      clearTimeout(spawnTimeout);
      spawnTimeout = null;
    }

    doublePointsActive = false;
    freezeActive = false;
    if (powerupTimeout) {
      clearTimeout(powerupTimeout);
      powerupTimeout = null;
    }

    initBlaster();
  }

  function startGame() {
    if (gameRunning) return;

    const enteredName = (playerNameInput?.value || "").trim();
    if (!enteredName) {
      showMessage(
        "Pilot Needed",
        "Enter your call sign to log your scores on the leaderboard.",
        "Type a name and tap Start Mission!"
      );
      setTimeout(() => {
        playerNameInput?.focus();
      }, 50);
      return;
    }

    currentPlayer = enteredName;
    localStorage.setItem(PLAYER_NAME_KEY, enteredName);
    if (currentPlayerEl) currentPlayerEl.textContent = currentPlayer || "—";

    gameRunning = true;
    resetGame();
    startBtn.classList.add("hidden");
    hideMessage();
    beginAutomaticSpray();

    scheduleSpawnWave();

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
    stopSprayLoop();
    clearShots();
    stopAutomaticSpray();
    if (spawnTimeout) {
      clearTimeout(spawnTimeout);
      spawnTimeout = null;
    }
    clearInterval(timerInterval);
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
    recordScore(currentPlayer, score);

    showMessage(
      "Mission Complete!",
      `You blasted <strong>${score}</strong> space bugs!`,
      "Tap <em>Start Mission</em> to play again."
    );

    startBtn.textContent = "Play Again";
    startBtn.classList.remove("hidden");
  }

  function scheduleSpawnWave() {
    if (!gameRunning) return;
    if (spawnTimeout) {
      clearTimeout(spawnTimeout);
    }

    spawnTimeout = setTimeout(() => {
      if (!gameRunning) return;

      const midBoost = spawnDelay < 600 ? 1 : 0;
      const lateBoost = spawnDelay < 420 ? 1 : 0;
      let spawnCount = 2 + midBoost + lateBoost + (Math.random() < 0.55 ? 1 : 0);
      if (freezeActive) {
        spawnCount = Math.max(1, Math.floor(spawnCount / 2));
      }
      for (let i = 0; i < spawnCount; i++) {
        spawnBug();
      }

      if (Math.random() < 0.18) {
        spawnPowerup();
      }

      const slowFactor = freezeActive ? 1.02 : SPAWN_ACCELERATION;
      spawnDelay = Math.max(MIN_SPAWN_DELAY, spawnDelay * slowFactor);
      scheduleSpawnWave();
    }, spawnDelay);
  }

  function recordScore(name, score) {
    if (!name) return;
    leaderboardData.push({ name, score, ts: Date.now() });
    leaderboardData.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.ts - b.ts;
    });
    leaderboardData = leaderboardData.slice(0, 6);
    saveLeaderboard();
    renderLeaderboard();
  }

  function loadLeaderboard() {
    try {
      const raw = localStorage.getItem(SCOREBOARD_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(entry => entry && typeof entry.name === "string" && typeof entry.score === "number")
        .map(entry => ({
          name: entry.name,
          score: entry.score,
          ts: entry.ts || Date.now()
        }));
    } catch {
      return [];
    }
  }

  function saveLeaderboard() {
    try {
      localStorage.setItem(SCOREBOARD_KEY, JSON.stringify(leaderboardData));
    } catch {
      // ignore
    }
  }

  function renderLeaderboard() {
    if (!leaderboardList) return;
    leaderboardList.innerHTML = "";
    if (!leaderboardData.length) {
      const li = document.createElement("li");
      li.className = "empty-entry";
      li.textContent = "No scores yet — be the first pilot!";
      leaderboardList.appendChild(li);
      return;
    }

    leaderboardData.slice(0, 5).forEach(entry => {
      const li = document.createElement("li");
      const nameSpan = document.createElement("span");
      nameSpan.className = "pilot-name";
      nameSpan.textContent = entry.name;
      const scoreSpan = document.createElement("span");
      scoreSpan.className = "pilot-score";
      scoreSpan.textContent = entry.score.toString();
      li.appendChild(nameSpan);
      li.appendChild(scoreSpan);
      leaderboardList.appendChild(li);
    });

    resizeCanvas();
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

    gameArea.appendChild(bug);

    setTimeout(() => {
      bug.remove();
    }, 4000);
  }

  function handleBugBlast(bug, gaRect = gameArea.getBoundingClientRect()) {
    if (!gameRunning) return;

    const rect = bug.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - gaRect.left;
    const y = rect.top + rect.height / 2 - gaRect.top;

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

  /* ---------- SPRAY & PROJECTILES ---------- */

  function fireSprayBurst() {
    if (!gameRunning) return;

    const now = performance.now();
    if (now - lastShotTime < 120) return;
    lastShotTime = now;

    const rect = gameArea.getBoundingClientRect();
    const originX = blasterX + blasterWidth / 2;
    const originY = rect.height - 80;
    const offsets = [-14, 0, 14];

    offsets.forEach(offset => {
      createShot(originX + offset, originY, offset * 0.02 + (Math.random() - 0.5) * 0.6);
    });

    startSprayLoop();
  }

  function createShot(x, y, drift) {
    const shot = document.createElement("div");
    const variant = 1 + Math.floor(Math.random() * 3);
    shot.className = `spray-shot spray-${variant}`;
    shot.style.left = `${x}px`;
    shot.style.top = `${y}px`;
    gameArea.appendChild(shot);

    activeShots.push({
      el: shot,
      x,
      y,
      drift,
      speed: 11 + Math.random() * 2
    });
  }

  function updateShots() {
    const areaWidth = gameArea.clientWidth;
    const gaRect = gameArea.getBoundingClientRect();

    for (let i = activeShots.length - 1; i >= 0; i--) {
      const shot = activeShots[i];
      shot.y -= shot.speed;
      shot.x += shot.drift;

      if (shot.y < -40 || shot.x < -40 || shot.x > areaWidth + 40) {
        removeShotAt(i);
        continue;
      }

      shot.el.style.left = `${shot.x}px`;
      shot.el.style.top = `${shot.y}px`;

      if (detectShotHit(shot, gaRect)) {
        removeShotAt(i);
      }
    }

    if (gameRunning || activeShots.length > 0) {
      sprayLoopId = requestAnimationFrame(updateShots);
    } else {
      sprayLoopId = null;
    }
  }

  function detectShotHit(shot, gaRect) {
    const shotRect = shot.el.getBoundingClientRect();
    const bugs = [...gameArea.querySelectorAll(".bug")];

    for (const bug of bugs) {
      const bugRect = bug.getBoundingClientRect();
      if (rectsOverlap(shotRect, bugRect)) {
        handleBugBlast(bug, gaRect);
        return true;
      }
    }

    const powerups = [...gameArea.querySelectorAll(".powerup")];
    for (const powerup of powerups) {
      const powerRect = powerup.getBoundingClientRect();
      if (rectsOverlap(shotRect, powerRect)) {
        const type = powerup.dataset.type;
        if (type) {
          activatePowerup(type);
        }
        powerup.remove();
        return true;
      }
    }

    return false;
  }

  function rectsOverlap(a, b) {
    return !(
      a.right < b.left ||
      a.left > b.right ||
      a.bottom < b.top ||
      a.top > b.bottom
    );
  }

  function removeShotAt(index) {
    const shot = activeShots[index];
    if (!shot) return;
    shot.el.remove();
    activeShots.splice(index, 1);
  }

  function clearShots() {
    while (activeShots.length) {
      const shot = activeShots.pop();
      if (shot) {
        shot.el.remove();
      }
    }
  }

  function startSprayLoop() {
    if (sprayLoopId) return;
    sprayLoopId = requestAnimationFrame(updateShots);
  }

  function stopSprayLoop() {
    if (!sprayLoopId) return;
    cancelAnimationFrame(sprayLoopId);
    sprayLoopId = null;
  }

  function beginAutomaticSpray() {
    if (sprayInterval) return;
    fireSprayBurst();
    sprayInterval = setInterval(fireSprayBurst, 160);
  }

  function stopAutomaticSpray() {
    if (!sprayInterval) return;
    clearInterval(sprayInterval);
    sprayInterval = null;
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
  // Prevent the game-area pointer handler from intercepting taps on the button
  startBtn.addEventListener("pointerdown", e => {
    e.stopPropagation();
  });
  startBtn.addEventListener(
    "touchstart",
    e => {
      e.preventDefault();
      startGame();
    },
    { passive: false }
  );
  startBtn.addEventListener(
    "touchend",
    e => {
      e.preventDefault();
      startGame();
    },
    { passive: false }
  );

  // initial layout
  resizeCanvas();
});
