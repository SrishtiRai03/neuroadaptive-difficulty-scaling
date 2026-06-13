/* ============================================================
   NDS — Canvas Mini-Game
   A reaction-time target-clicking game with live NDS adaptation
   ============================================================ */
(function () {
  'use strict';

  /* ── Constants ── */
  const GAME_DURATION = 60; // seconds
  const BASE_TARGET_RADIUS = 22;
  const MIN_TARGET_RADIUS = 12;
  const BASE_TARGET_LIFETIME = 2500; // ms before target disappears
  const BASE_SPAWN_INTERVAL = 1200; // ms
  const MAX_TARGETS = 6;
  const PARTICLE_COUNT = 12;

  /* ── State ── */
  let canvas, ctx, wrapper;
  let gameRunning = false;
  let gamePaused = false;
  let timeLeft = GAME_DURATION;
  let score = 0;
  let hits = 0;
  let misses = 0;
  let totalRTs = [];
  let targets = [];
  let particles = [];
  let lastSpawn = 0;
  let animFrameId = null;
  let timerInterval = null;
  let zoneHistory = {};

  /* ── Internal NDS for the game (separate from dashboard simulation) ── */
  let gameNDS = null;

  /* ── Target Object ── */
  function createTarget(difficulty, zone) {
    const cw = canvas.width;
    const ch = canvas.height;
    const padding = 50;

    // Scale parameters based on difficulty
    const radius = Math.max(MIN_TARGET_RADIUS, BASE_TARGET_RADIUS - difficulty * 12);
    const lifetime = Math.max(800, BASE_TARGET_LIFETIME - difficulty * 1400);

    // Get archetype color from EnemyAI if available
    let color = '#00d4ff';
    let archetype = 'GRUNT';
    if (window.EnemyAI) {
      archetype = window.EnemyAI.getArchetype(zone || 'FLOW');
      const archetypeDef = window.EnemyAI.ARCHETYPES[archetype];
      if (archetypeDef) color = archetypeDef.color;
    }

    // Movement — higher difficulty = moving targets
    const speed = difficulty > 0.3 ? (0.3 + difficulty * 1.5) : 0;
    const angle = Math.random() * Math.PI * 2;

    return {
      x: padding + Math.random() * (cw - padding * 2),
      y: padding + Math.random() * (ch - padding * 2),
      radius,
      color,
      archetype,
      lifetime,
      spawnTime: performance.now(),
      speed,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      opacity: 1,
      pulsePhase: Math.random() * Math.PI * 2,
      hitPoints: archetype === 'TANK' || archetype === 'GUARDIAN' ? 2 : 1,
      maxHitPoints: archetype === 'TANK' || archetype === 'GUARDIAN' ? 2 : 1,
    };
  }

  /* ── Particle Effect ── */
  function spawnParticles(x, y, color) {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (Math.PI * 2 / PARTICLE_COUNT) * i + Math.random() * 0.3;
      const speed = 2 + Math.random() * 4;
      particles.push({
        x, y,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 3,
        color,
        life: 1,
        decay: 0.02 + Math.random() * 0.03,
      });
    }
  }

  /* ── Drawing ── */
  function drawTarget(t, now) {
    const age = now - t.spawnTime;
    const lifeRatio = 1 - age / t.lifetime;
    if (lifeRatio <= 0) return;

    // Pulse animation
    const pulse = 1 + Math.sin(now / 200 + t.pulsePhase) * 0.08;
    const r = t.radius * pulse;

    ctx.save();
    ctx.globalAlpha = lifeRatio * t.opacity;

    // Outer glow
    ctx.beginPath();
    ctx.arc(t.x, t.y, r + 8, 0, Math.PI * 2);
    ctx.fillStyle = t.color;
    ctx.globalAlpha = lifeRatio * 0.15;
    ctx.fill();

    // Main circle
    ctx.globalAlpha = lifeRatio * t.opacity;
    ctx.beginPath();
    ctx.arc(t.x, t.y, r, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(t.x - r * 0.3, t.y - r * 0.3, 0, t.x, t.y, r);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.4, t.color);
    grad.addColorStop(1, t.color + '88');
    ctx.fillStyle = grad;
    ctx.fill();

    // HP indicator for multi-hit targets
    if (t.maxHitPoints > 1) {
      ctx.beginPath();
      ctx.arc(t.x, t.y, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = t.hitPoints > 1 ? 'rgba(255,255,255,0.6)' : 'rgba(239,68,68,0.6)';
      ctx.fill();
    }

    // Remaining life ring
    ctx.beginPath();
    ctx.arc(t.x, t.y, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lifeRatio);
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = lifeRatio * 0.5;
    ctx.stroke();

    // Archetype label
    ctx.globalAlpha = lifeRatio * 0.7;
    ctx.fillStyle = '#fff';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(t.archetype, t.x, t.y + r + 16);

    ctx.restore();
  }

  function drawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();

      p.x += p.dx;
      p.y += p.dy;
      p.dx *= 0.96;
      p.dy *= 0.96;
      p.life -= p.decay;

      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function drawBackground() {
    // Dark background with subtle grid
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // HUD
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${score}`, 15, 25);
    ctx.textAlign = 'right';
    ctx.fillText(`TIME: ${timeLeft}s`, canvas.width - 15, 25);

    if (gameNDS) {
      const state = gameNDS.getState();
      ctx.textAlign = 'center';
      ctx.fillStyle = Visualizer.ZONE_COLORS[state.zone] || '#fff';
      ctx.fillText(`ZONE: ${state.zone}  |  DIFF: ${state.difficulty.toFixed(2)}`, canvas.width / 2, 25);
    }
  }

  /* ── Game Loop ── */
  function gameLoop(now) {
    if (!gameRunning) return;

    drawBackground();

    // Spawn logic
    const difficulty = gameNDS ? gameNDS.getState().difficulty : 0.35;
    const zone = gameNDS ? gameNDS.getState().zone : 'FLOW';
    const spawnInterval = Math.max(400, BASE_SPAWN_INTERVAL - difficulty * 700);

    if (now - lastSpawn > spawnInterval && targets.length < MAX_TARGETS) {
      targets.push(createTarget(difficulty, zone));
      lastSpawn = now;
    }

    // Update & draw targets
    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i];
      const age = now - t.spawnTime;

      // Move target
      if (t.speed > 0) {
        t.x += t.dx;
        t.y += t.dy;
        // Bounce off walls
        if (t.x - t.radius < 0 || t.x + t.radius > canvas.width) t.dx *= -1;
        if (t.y - t.radius < 0 || t.y + t.radius > canvas.height) t.dy *= -1;
        t.x = Math.max(t.radius, Math.min(canvas.width - t.radius, t.x));
        t.y = Math.max(t.radius, Math.min(canvas.height - t.radius, t.y));
      }

      // Remove expired targets
      if (age > t.lifetime) {
        misses++;
        // Feed a slow RT to NDS (missed = bad)
        if (gameNDS) gameNDS.rt.addRT(500);
        targets.splice(i, 1);
        continue;
      }

      drawTarget(t, now);
    }

    drawParticles();

    // Run NDS simulation tick every ~500ms
    if (gameNDS && Math.floor(now / 500) !== Math.floor((now - 16) / 500)) {
      gameNDS.tick();
      const state = gameNDS.getState();
      updateGameStats(state);
      if (window.Visualizer) {
        Visualizer.pushGameDifficultyData(state.difficulty);
      }

      // Track zone time
      zoneHistory[state.zone] = (zoneHistory[state.zone] || 0) + 1;
    }

    animFrameId = requestAnimationFrame(gameLoop);
  }

  /* ── Click Handling ── */
  function handleClick(e) {
    if (!gameRunning) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const now = performance.now();

    let hitSomething = false;

    for (let i = targets.length - 1; i >= 0; i--) {
      const t = targets[i];
      const dist = Math.hypot(mx - t.x, my - t.y);

      if (dist <= t.radius + 5) { // small forgiveness margin
        // Calculate RT
        const rt = now - t.spawnTime;
        totalRTs.push(rt);

        t.hitPoints--;

        if (t.hitPoints <= 0) {
          // Target destroyed
          hits++;
          score += Math.max(10, Math.round(100 - rt / 10));
          spawnParticles(t.x, t.y, t.color);
          targets.splice(i, 1);
        } else {
          // Multi-hit: flash but don't remove
          spawnParticles(t.x, t.y, '#ffffff');
          score += 15;
        }

        // Feed real data to NDS
        if (gameNDS) {
          gameNDS.rt.addRT(rt);
          gameNDS.stress.addClickEvent(now);
        }

        hitSomething = true;
        break; // only hit one target per click
      }
    }

    if (!hitSomething) {
      // Feed stress (angry clicking in empty space)
      if (gameNDS) {
        gameNDS.stress.addClickEvent(now);
      }
    }

    // Track mouse movement for NDS
    if (gameNDS) {
      gameNDS.movement.addPosition(mx, my, now);
    }
  }

  function handleMouseMove(e) {
    if (!gameRunning || !gameNDS) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    gameNDS.movement.addPosition(mx, my, performance.now());
  }

  /* ── Stats Update ── */
  function updateGameStats(state) {
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText('game-score', score);
    setText('game-rt', totalRTs.length > 0 ? Math.round(median(totalRTs)) + 'ms' : '—');
    setText('game-hits', `${hits} / ${misses}`);
    setText('game-zone', state.zone);
    setText('game-difficulty', state.difficulty.toFixed(2));
    setText('game-enemy-type', window.EnemyAI ? window.EnemyAI.getArchetype(state.zone) : '—');
    setText('game-timer', timeLeft + 's');
  }

  function median(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /* ── Timer ── */
  function startTimer() {
    timerInterval = setInterval(() => {
      timeLeft--;
      const el = document.getElementById('game-timer');
      if (el) el.textContent = timeLeft + 's';

      if (timeLeft <= 0) {
        endGame();
      }
    }, 1000);
  }

  /* ── Game Lifecycle ── */
  function startGame() {
    canvas = document.getElementById('game-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    wrapper = document.getElementById('game-wrapper');

    // Reset state
    gameRunning = true;
    timeLeft = GAME_DURATION;
    score = 0;
    hits = 0;
    misses = 0;
    totalRTs = [];
    targets = [];
    particles = [];
    zoneHistory = {};
    lastSpawn = 0;

    // Create a separate NDS instance for the game
    if (window.NDS) {
      // We'll use the global NDS but reset it
      window.NDS.reset();
      gameNDS = window.NDS;
    }

    // Hide overlay
    const overlay = document.getElementById('game-overlay');
    if (overlay) overlay.style.display = 'none';

    // Update buttons
    const startBtn = document.getElementById('game-start');
    const resetBtn = document.getElementById('game-reset');
    if (startBtn) startBtn.disabled = true;
    if (resetBtn) resetBtn.disabled = false;

    // Init game difficulty chart
    if (window.Visualizer) {
      Visualizer.initGameDifficultyChart();
    }

    // Add listeners
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousemove', handleMouseMove);

    startTimer();
    animFrameId = requestAnimationFrame(gameLoop);
  }

  function endGame() {
    gameRunning = false;

    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (timerInterval) clearInterval(timerInterval);

    canvas.removeEventListener('click', handleClick);
    canvas.removeEventListener('mousemove', handleMouseMove);

    // Show buttons
    const startBtn = document.getElementById('game-start');
    const resetBtn = document.getElementById('game-reset');
    if (startBtn) startBtn.disabled = false;
    if (resetBtn) resetBtn.disabled = true;

    // Show report modal
    showReport();
  }

  function resetGame() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (timerInterval) clearInterval(timerInterval);
    gameRunning = false;

    canvas.removeEventListener('click', handleClick);
    canvas.removeEventListener('mousemove', handleMouseMove);

    const overlay = document.getElementById('game-overlay');
    if (overlay) overlay.style.display = '';

    const startBtn = document.getElementById('game-start');
    const resetBtn = document.getElementById('game-reset');
    if (startBtn) startBtn.disabled = false;
    if (resetBtn) resetBtn.disabled = true;

    // Clear canvas
    if (ctx) {
      ctx.fillStyle = '#050510';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Reset stat display
    ['game-score', 'game-rt', 'game-hits', 'game-zone', 'game-difficulty', 'game-enemy-type'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = id === 'game-score' ? '0' : id === 'game-hits' ? '0 / 0' : '—';
    });
    const timerEl = document.getElementById('game-timer');
    if (timerEl) timerEl.textContent = '60s';
  }

  function showReport() {
    const avgRT = totalRTs.length > 0 ? Math.round(median(totalRTs)) : 0;
    const accuracy = hits + misses > 0 ? Math.round((hits / (hits + misses)) * 100) : 0;

    // Find dominant zone
    let dominantZone = 'FLOW';
    let maxTime = 0;
    for (const [z, t] of Object.entries(zoneHistory)) {
      if (t > maxTime) { maxTime = t; dominantZone = z; }
    }

    // Populate report
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText('report-score', score);
    setText('report-rt', avgRT + 'ms');
    setText('report-accuracy', accuracy + '%');
    setText('report-zone', dominantZone);

    // Tip based on performance
    const tipEl = document.getElementById('report-tip');
    if (tipEl) {
      if (avgRT < 300 && accuracy > 70) {
        tipEl.textContent = '🎯 Excellent performance! You stayed in the flow zone with fast reactions. The NDS engine increased difficulty to match your skill.';
      } else if (avgRT > 400) {
        tipEl.textContent = '💤 Your reactions were slower than average. The NDS engine detected this and reduced difficulty — providing a gentler experience.';
      } else if (accuracy < 50) {
        tipEl.textContent = '😰 Low accuracy detected! The NDS engine noticed your stress signals and adjusted enemy behavior to be more forgiving.';
      } else {
        tipEl.textContent = '✅ Good session! The NDS engine adapted difficulty based on your real-time performance signals throughout the game.';
      }
    }

    // Show modal
    const modal = document.getElementById('report-modal');
    if (modal) modal.classList.add('active');
  }

  /* ── Public API ── */
  window.Game = {
    start: startGame,
    reset: resetGame,
    end: endGame,
    isRunning: () => gameRunning,
  };
})();
