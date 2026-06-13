/* ============================================================
   NDS — App Controller
   Navigation, particle background, flow diagram interaction,
   scroll animations, dashboard simulation loop, and initialization
   ============================================================ */
(function () {
  'use strict';

  /* ================================================================
     GEOMETRIC MESH BACKGROUND (Hero Section)
     Dark polygon facets with glowing neon edges — pink/purple/blue
     Matches the Voronoi/Delaunay crystal reference
     ================================================================ */
  class GeometricMesh {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.points = [];
      this.triangles = [];
      this.animId = null;
      this.isVisible = true;
      this.time = 0;
      this.mouse = { x: -1000, y: -1000 };
      this.resize();

      let resizeTimer;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => this.resize(), 200);
      });
      this.canvas.addEventListener('mousemove', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - rect.left;
        this.mouse.y = e.clientY - rect.top;
      });
      this.canvas.addEventListener('mouseleave', () => {
        this.mouse.x = -1000;
        this.mouse.y = -1000;
      });

      // Pause when hero is offscreen
      const heroObs = new IntersectionObserver((entries) => {
        this.isVisible = entries[0].isIntersecting;
      }, { threshold: 0.05 });
      heroObs.observe(this.canvas.parentElement);
    }

    resize() {
      this.canvas.width = this.canvas.offsetWidth;
      this.canvas.height = this.canvas.offsetHeight;
      this.generateMesh();
    }

    generateMesh() {
      const w = this.canvas.width;
      const h = this.canvas.height;
      const spacing = 80;
      this.points = [];

      // Generate jittered grid points
      for (let x = -spacing; x <= w + spacing; x += spacing) {
        for (let y = -spacing; y <= h + spacing; y += spacing) {
          this.points.push({
            x: x + (Math.random() - 0.5) * spacing * 0.8,
            y: y + (Math.random() - 0.5) * spacing * 0.8,
            ox: x + (Math.random() - 0.5) * spacing * 0.8,  // original
            oy: y + (Math.random() - 0.5) * spacing * 0.8,
            vx: (Math.random() - 0.5) * 0.15,
            vy: (Math.random() - 0.5) * 0.15,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }

      this.triangulate();
    }

    // Simple Delaunay via ear-clipping / Bowyer-Watson
    triangulate() {
      const pts = this.points;
      // Super-triangle
      const w = this.canvas.width;
      const h = this.canvas.height;
      const stA = { x: -w * 2, y: h * 3, ox: -w * 2, oy: h * 3, vx: 0, vy: 0, phase: 0 };
      const stB = { x: w * 3, y: h * 3, ox: w * 3, oy: h * 3, vx: 0, vy: 0, phase: 0 };
      const stC = { x: w / 2, y: -h * 2, ox: w / 2, oy: -h * 2, vx: 0, vy: 0, phase: 0 };

      let triangles = [{ a: stA, b: stB, c: stC }];

      for (const p of pts) {
        const bad = [];
        const poly = [];

        for (const t of triangles) {
          if (this._inCircumcircle(p, t)) {
            bad.push(t);
          }
        }

        for (const t of bad) {
          const edges = [
            [t.a, t.b], [t.b, t.c], [t.c, t.a]
          ];
          for (const [ea, eb] of edges) {
            let shared = false;
            for (const other of bad) {
              if (other === t) continue;
              const oEdges = [[other.a, other.b], [other.b, other.c], [other.c, other.a]];
              for (const [oa, ob] of oEdges) {
                if ((ea === oa && eb === ob) || (ea === ob && eb === oa)) {
                  shared = true; break;
                }
              }
              if (shared) break;
            }
            if (!shared) poly.push([ea, eb]);
          }
        }

        triangles = triangles.filter(t => !bad.includes(t));
        for (const [ea, eb] of poly) {
          triangles.push({ a: ea, b: eb, c: p });
        }
      }

      // Remove triangles that share a vertex with super-triangle
      this.triangles = triangles.filter(t => {
        return t.a !== stA && t.a !== stB && t.a !== stC &&
               t.b !== stA && t.b !== stB && t.b !== stC &&
               t.c !== stA && t.c !== stB && t.c !== stC;
      });
    }

    _inCircumcircle(p, t) {
      const ax = t.a.x - p.x;
      const ay = t.a.y - p.y;
      const bx = t.b.x - p.x;
      const by = t.b.y - p.y;
      const cx = t.c.x - p.x;
      const cy = t.c.y - p.y;
      const det = (ax * ax + ay * ay) * (bx * cy - cx * by)
                - (bx * bx + by * by) * (ax * cy - cx * ay)
                + (cx * cx + cy * cy) * (ax * by - bx * ay);
      return det > 0;
    }

    draw() {
      this.animId = requestAnimationFrame(() => this.draw());
      if (!this.isVisible) return;

      this.time += 0.008;
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Animate points with subtle drift
      for (const p of this.points) {
        p.x = p.ox + Math.sin(this.time + p.phase) * 6;
        p.y = p.oy + Math.cos(this.time * 0.7 + p.phase) * 6;
      }

      // Gradient colors for edges: pink → purple → blue
      const edgeColors = [
        [255, 40, 120],   // hot pink
        [180, 60, 255],   // purple
        [100, 80, 255],   // blue-purple
        [200, 50, 200],   // magenta
      ];

      // Mouse proximity radius
      const mouseRadius = 200;

      // Draw filled triangles (dark facets)
      for (const t of this.triangles) {
        const cx = (t.a.x + t.b.x + t.c.x) / 3;
        const cy = (t.a.y + t.b.y + t.c.y) / 3;

        // Distance to mouse
        const md = Math.hypot(cx - this.mouse.x, cy - this.mouse.y);
        const mouseInfluence = Math.max(0, 1 - md / mouseRadius);

        // Base darkness with slight variation
        const noise = Math.sin(cx * 0.01 + cy * 0.01 + this.time) * 0.5 + 0.5;
        const base = 18 + noise * 12 + mouseInfluence * 15;

        ctx.beginPath();
        ctx.moveTo(t.a.x, t.a.y);
        ctx.lineTo(t.b.x, t.b.y);
        ctx.lineTo(t.c.x, t.c.y);
        ctx.closePath();
        ctx.fillStyle = `rgb(${Math.round(base)}, ${Math.round(base * 0.85)}, ${Math.round(base * 1.1)})`;
        ctx.fill();
      }

      // Draw glowing edges
      const drawnEdges = new Set();
      for (const t of this.triangles) {
        const edges = [[t.a, t.b], [t.b, t.c], [t.c, t.a]];
        for (const [a, b] of edges) {
          // Deduplicate edges
          const key = a.ox < b.ox || (a.ox === b.ox && a.oy < b.oy)
            ? `${a.ox},${a.oy}-${b.ox},${b.oy}`
            : `${b.ox},${b.oy}-${a.ox},${a.oy}`;
          if (drawnEdges.has(key)) continue;
          drawnEdges.add(key);

          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;

          // Distance to mouse
          const md = Math.hypot(mx - this.mouse.x, my - this.mouse.y);
          const mouseInfluence = Math.max(0, 1 - md / mouseRadius);

          // Animated glow intensity
          const intensity = Math.sin(this.time * 1.5 + mx * 0.005 + my * 0.008) * 0.5 + 0.5;
          const glow = intensity * 0.35 + mouseInfluence * 0.6;

          if (glow < 0.08) {
            // Very dim edge — just draw thin dark line
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = 'rgba(60, 50, 80, 0.3)';
            ctx.lineWidth = 0.5;
            ctx.stroke();
            continue;
          }

          // Pick color based on position
          const colorIdx = Math.floor((mx + my + this.time * 30) * 0.01) % edgeColors.length;
          const nextIdx = (colorIdx + 1) % edgeColors.length;
          const blend = ((mx + my + this.time * 30) * 0.01) % 1;
          const c = edgeColors[Math.abs(colorIdx)];
          const n = edgeColors[Math.abs(nextIdx)];
          const r = Math.round(c[0] + (n[0] - c[0]) * blend);
          const g = Math.round(c[1] + (n[1] - c[1]) * blend);
          const bv = Math.round(c[2] + (n[2] - c[2]) * blend);

          // Draw glow (wider, semi-transparent)
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${bv}, ${glow * 0.3})`;
          ctx.lineWidth = 4;
          ctx.stroke();

          // Draw core edge
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${bv}, ${glow})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
    }

    start() { this.draw(); }
    stop() { if (this.animId) cancelAnimationFrame(this.animId); }
  }

  /* ================================================================
     NAVIGATION
     ================================================================ */
  let _programmaticScroll = false;

  function initNavigation() {
    const nav = document.getElementById('main-nav');
    const toggle = document.getElementById('nav-toggle');
    const links = document.getElementById('nav-links');
    const navLinks = document.querySelectorAll('.nav-link');

    // Scroll → add .scrolled class
    let scrollTicking = false;
    window.addEventListener('scroll', () => {
      if (!scrollTicking) {
        requestAnimationFrame(() => {
          if (window.scrollY > 50) {
            nav.classList.add('scrolled');
          } else {
            nav.classList.remove('scrolled');
          }
          scrollTicking = false;
        });
        scrollTicking = true;
      }
    });

    // Mobile toggle
    if (toggle) {
      toggle.addEventListener('click', () => {
        links.classList.toggle('open');
      });
    }

    // Active link tracking via IntersectionObserver
    const sections = document.querySelectorAll('section');
    const observer = new IntersectionObserver((entries) => {
      // Skip updates during programmatic scrolls to prevent feedback loops
      if (_programmaticScroll) return;
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.forEach(link => link.classList.remove('active'));
          const activeLink = document.querySelector(`.nav-link[data-section="${entry.target.id}"]`);
          if (activeLink) activeLink.classList.add('active');
        }
      });
    }, { threshold: 0.3 });

    sections.forEach(s => observer.observe(s));

    // Prevent default anchor behaviour to stop auto-scrolling.
    // Use explicit scrollIntoView with a programmatic-scroll guard.
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        links.classList.remove('open');

        const targetId = link.getAttribute('data-section');
        const target = document.getElementById(targetId);
        if (!target) return;

        _programmaticScroll = true;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Re-enable observer after scroll settles
        setTimeout(() => { _programmaticScroll = false; }, 1000);

        // Manually set active state
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      });
    });

    // Intercept ALL in-page anchor links (CTA buttons, etc.)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      // Skip nav links already handled above
      if (anchor.classList.contains('nav-link')) return;
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const hash = anchor.getAttribute('href');
        if (!hash || hash === '#') return;
        const target = document.getElementById(hash.substring(1));
        if (!target) return;

        _programmaticScroll = true;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => { _programmaticScroll = false; }, 1000);
      });
    });
  }

  /* ================================================================
     SCROLL ANIMATIONS (animate-in class)
     ================================================================ */
  function initScrollAnimations() {
    const elements = document.querySelectorAll('.animate-in');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    elements.forEach(el => observer.observe(el));
  }

  /* ================================================================
     FLOW CHANNEL SLIDER
     ================================================================ */
  function initFlowSlider() {
    const slider = document.getElementById('flow-slider');
    const marker = document.getElementById('flow-marker');
    const zones = document.querySelectorAll('.flow-zone');

    if (!slider || !marker) return;

    slider.addEventListener('input', () => {
      const val = parseInt(slider.value);
      // Map 0-100 to marker position
      marker.style.left = val + '%';

      // Highlight active zone
      let activeZone = '';
      if (val < 25) activeZone = 'bored';
      else if (val < 50) activeZone = 'flow';
      else if (val < 75) activeZone = 'anxious';
      else activeZone = 'frustrated';

      zones.forEach(z => {
        z.classList.remove('active-zone');
        if (z.dataset.zone === activeZone) z.classList.add('active-zone');
      });
    });
  }

  /* ================================================================
     DASHBOARD SIMULATION LOOP
     Runs every 500ms, feeds data through NDS → Visualizer
     ================================================================ */
  let simInterval = null;
  let currentSimMode = 'flow'; // 'bored' | 'flow' | 'stressed' | 'fatigued' | 'manual'
  let manualValues = { rt: 250, movement: 0.7, stress: 0.2 };

  function initDashboardSimulation() {
    // Initialize charts
    if (window.Visualizer) {
      Visualizer.initDifficultyChart();
      Visualizer.initYerkesDodsonChart();
    }

    // Start the sim loop
    simInterval = setInterval(dashboardTick, 500);

    // Wire up sim buttons
    document.querySelectorAll('.sim-btn[data-sim]').forEach(btn => {
      btn.addEventListener('click', () => {
        currentSimMode = btn.dataset.sim;
        document.querySelectorAll('.sim-btn[data-sim]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Wire up manual sliders
    const sliderRT = document.getElementById('slider-rt');
    const sliderMov = document.getElementById('slider-movement');
    const sliderStr = document.getElementById('slider-stress');

    if (sliderRT) {
      sliderRT.addEventListener('input', () => {
        manualValues.rt = parseInt(sliderRT.value);
        currentSimMode = 'manual';
        document.querySelectorAll('.sim-btn[data-sim]').forEach(b => b.classList.remove('active'));
        document.getElementById('slider-rt-val').textContent = sliderRT.value + 'ms';
      });
    }
    if (sliderMov) {
      sliderMov.addEventListener('input', () => {
        manualValues.movement = parseInt(sliderMov.value) / 100;
        currentSimMode = 'manual';
        document.querySelectorAll('.sim-btn[data-sim]').forEach(b => b.classList.remove('active'));
        document.getElementById('slider-move-val').textContent = (parseInt(sliderMov.value) / 100).toFixed(2);
      });
    }
    if (sliderStr) {
      sliderStr.addEventListener('input', () => {
        manualValues.stress = parseInt(sliderStr.value) / 100;
        currentSimMode = 'manual';
        document.querySelectorAll('.sim-btn[data-sim]').forEach(b => b.classList.remove('active'));
        document.getElementById('slider-stress-val').textContent = (parseInt(sliderStr.value) / 100).toFixed(2);
      });
    }
  }

  function dashboardTick() {
    if (!window.NDS) return;

    if (currentSimMode === 'manual') {
      // Manual mode: directly set values
      window.NDS.rt.addRT(manualValues.rt + (Math.random() - 0.5) * 30);
      // We simulate movement score by feeding positions that produce the desired score
      // For simplicity we directly update the engine with manual values
      window.NDS.engine.update(
        scoreFromRT(manualValues.rt),
        manualValues.movement,
        manualValues.stress
      );
    } else {
      // Preset simulation mode
      window.NDS.simulatePlayer(currentSimMode);
      window.NDS.tick();
    }

    const state = window.NDS.getState();

    // Update sliders to reflect current state (only in auto mode)
    if (currentSimMode !== 'manual') {
      updateSliderDisplay('slider-rt', 'slider-rt-val', Math.round(window.NDS.rt.getMedianRT()), 'ms');
      updateSliderDisplay('slider-movement', 'slider-move-val', state.movementScore, '', true);
      updateSliderDisplay('slider-stress', 'slider-stress-val', state.stressIndex, '', true);
    }

    // Push to visualizer
    if (window.Visualizer) {
      Visualizer.updateDashboard(state);
    }
  }

  function scoreFromRT(rt) {
    const RT_FAST = 150, RT_SLOW = 400;
    if (rt <= RT_FAST) return 1.0;
    if (rt >= RT_SLOW) return 0.0;
    return 1 - (rt - RT_FAST) / (RT_SLOW - RT_FAST);
  }

  function updateSliderDisplay(sliderId, valId, value, suffix, isNormalized) {
    const slider = document.getElementById(sliderId);
    const valEl = document.getElementById(valId);
    if (!slider || !valEl) return;

    if (isNormalized) {
      slider.value = Math.round(value * 100);
      valEl.textContent = value.toFixed(2);
    } else {
      slider.value = value;
      valEl.textContent = value + (suffix || '');
    }
  }

  /* ================================================================
     GAME SECTION WIRING
     ================================================================ */
  function initGameControls() {
    const startBtn = document.getElementById('game-start');
    const resetBtn = document.getElementById('game-reset');
    const closeBtn = document.getElementById('report-close');
    const modal = document.getElementById('report-modal');

    if (startBtn && window.Game) {
      startBtn.addEventListener('click', (e) => {
        e.preventDefault();
        startBtn.blur(); // prevent focus-scroll
        window.Game.start();
      });
    }
    if (resetBtn && window.Game) {
      resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        resetBtn.blur(); // prevent focus-scroll
        window.Game.reset();
      });
    }
    if (closeBtn && modal) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeBtn.blur();
        modal.classList.remove('active');
      });
    }
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }
  }

  /* ================================================================
     INIT — run when DOM is ready
     ================================================================ */
  function init() {
    // Particle background
    const particleCanvas = document.getElementById('particle-canvas');
    if (particleCanvas) {
      const mesh = new GeometricMesh(particleCanvas);
      mesh.start();
    }

    // Navigation
    initNavigation();

    // Scroll animations
    initScrollAnimations();

    // Flow slider
    initFlowSlider();

    // Dashboard simulation
    initDashboardSimulation();

    // Game controls
    initGameControls();

    console.log('%c[NDS] Neuroadaptive Difficulty Scaling System — Initialized', 'color: #00d4ff; font-weight: bold;');
  }

  // DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
