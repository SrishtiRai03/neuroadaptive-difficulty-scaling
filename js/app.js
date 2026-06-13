/* ============================================================
   NDS — App Controller
   Navigation, particle background, flow diagram interaction,
   scroll animations, dashboard simulation loop, and initialization
   ============================================================ */
(function () {
  'use strict';

  /* ================================================================
     PARTICLE BACKGROUND (Hero Section)
     Neural-network-style animated particles with connecting lines
     ================================================================ */
  class ParticleNetwork {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.particles = [];
      this.mouse = { x: null, y: null };
      this.animId = null;
      this.resize();

      window.addEventListener('resize', () => this.resize());
      this.canvas.addEventListener('mousemove', (e) => {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - rect.left;
        this.mouse.y = e.clientY - rect.top;
      });
      this.canvas.addEventListener('mouseleave', () => {
        this.mouse.x = null;
        this.mouse.y = null;
      });
    }

    resize() {
      this.canvas.width = this.canvas.offsetWidth;
      this.canvas.height = this.canvas.offsetHeight;
      this.initParticles();
    }

    initParticles() {
      const count = Math.min(80, Math.floor((this.canvas.width * this.canvas.height) / 12000));
      this.particles = [];
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * this.canvas.width,
          y: Math.random() * this.canvas.height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          radius: 1.5 + Math.random() * 2,
          opacity: 0.2 + Math.random() * 0.5,
          color: Math.random() > 0.6 ? '#7c3aed' : '#00d4ff',
        });
      }
    }

    draw() {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      ctx.clearRect(0, 0, w, h);

      const connectionDist = 150;

      // Draw connections
      for (let i = 0; i < this.particles.length; i++) {
        for (let j = i + 1; j < this.particles.length; j++) {
          const dx = this.particles[i].x - this.particles[j].x;
          const dy = this.particles[i].y - this.particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connectionDist) {
            ctx.beginPath();
            ctx.moveTo(this.particles[i].x, this.particles[i].y);
            ctx.lineTo(this.particles[j].x, this.particles[j].y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.08 * (1 - dist / connectionDist)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }

        // Mouse interaction
        if (this.mouse.x !== null) {
          const dx = this.particles[i].x - this.mouse.x;
          const dy = this.particles[i].y - this.mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 200) {
            ctx.beginPath();
            ctx.moveTo(this.particles[i].x, this.particles[i].y);
            ctx.lineTo(this.mouse.x, this.mouse.y);
            ctx.strokeStyle = `rgba(124, 58, 237, ${0.15 * (1 - dist / 200)})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      // Draw & update particles
      for (const p of this.particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
      }

      this.animId = requestAnimationFrame(() => this.draw());
    }

    start() { this.draw(); }
    stop() { if (this.animId) cancelAnimationFrame(this.animId); }
  }

  /* ================================================================
     NAVIGATION
     ================================================================ */
  function initNavigation() {
    const nav = document.getElementById('main-nav');
    const toggle = document.getElementById('nav-toggle');
    const links = document.getElementById('nav-links');
    const navLinks = document.querySelectorAll('.nav-link');

    // Scroll → add .scrolled class
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        nav.classList.add('scrolled');
      } else {
        nav.classList.remove('scrolled');
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
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.forEach(link => link.classList.remove('active'));
          const activeLink = document.querySelector(`.nav-link[data-section="${entry.target.id}"]`);
          if (activeLink) activeLink.classList.add('active');
        }
      });
    }, { threshold: 0.3 });

    sections.forEach(s => observer.observe(s));

    // Close mobile menu on link click
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        links.classList.remove('open');
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
      startBtn.addEventListener('click', () => window.Game.start());
    }
    if (resetBtn && window.Game) {
      resetBtn.addEventListener('click', () => window.Game.reset());
    }
    if (closeBtn && modal) {
      closeBtn.addEventListener('click', () => modal.classList.remove('active'));
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
      const network = new ParticleNetwork(particleCanvas);
      network.start();
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
