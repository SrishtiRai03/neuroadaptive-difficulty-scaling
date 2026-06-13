/* ============================================================
   NDS — Visualizer Module
   Chart.js graphs, gauge rendering, and real-time dashboard updates
   ============================================================ */
(function () {
  'use strict';

  /* ── Colour tokens (matching CSS variables) ── */
  const COLORS = {
    primary:    '#818cf8',
    secondary:  '#c084fc',
    accent:     '#34d399',
    warning:    '#fbbf24',
    danger:     '#f87171',
    textMuted:  '#6b7db8',
    bgTertiary: '#1c1c32',
    zoneBored:      '#fbbf24',
    zoneFlow:       '#34d399',
    zoneAnxious:    '#fb923c',
    zoneFrustrated: '#f87171',
  };

  const ZONE_COLORS = {
    BORED:      COLORS.zoneBored,
    FLOW:       COLORS.zoneFlow,
    ANXIOUS:    COLORS.zoneAnxious,
    FRUSTRATED: COLORS.zoneFrustrated,
  };

  /* ── Utility ── */
  function zoneClass(zone) {
    return 'zone-' + zone.toLowerCase();
  }

  /* ================================================================
     GAUGE RENDERER
     Draws a circular arc gauge on a small canvas
     ================================================================ */
  class GaugeRenderer {
    constructor(canvasId, color) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      this.color = color;
      this.value = 0;
      this._animValue = 0;
    }

    draw(value) {
      if (!this.canvas) return;
      this.value = value;
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(cx, cy) - 10;
      const lineWidth = 10;
      const startAngle = 0.75 * Math.PI;
      const endAngle = 2.25 * Math.PI;
      const sweep = endAngle - startAngle;

      // Smooth animation towards target
      this._animValue += (value - this._animValue) * 0.15;
      const v = this._animValue;

      ctx.clearRect(0, 0, w, h);

      // Background track
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Filled arc
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sweep * v);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Center text
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 22px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(2), cx, cy);
    }
  }

  /* ================================================================
     DIFFICULTY CHART  (Chart.js Line Chart)
     ================================================================ */
  let difficultyChart = null;
  let gameDifficultyChart = null;

  function initDifficultyChart() {
    const canvas = document.getElementById('difficulty-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    difficultyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array(60).fill(''),
        datasets: [
          {
            label: 'Difficulty',
            data: Array(60).fill(0.35),
            borderColor: COLORS.primary,
            backgroundColor: 'rgba(0, 212, 255, 0.08)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: 'RT Score',
            data: Array(60).fill(0.5),
            borderColor: COLORS.secondary,
            borderDash: [4, 4],
            pointRadius: 0,
            borderWidth: 1.5,
            fill: false,
            tension: 0.3,
          },
          {
            label: 'Stress',
            data: Array(60).fill(0.2),
            borderColor: COLORS.danger,
            borderDash: [2, 2],
            pointRadius: 0,
            borderWidth: 1,
            fill: false,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
          x: { display: false },
          y: {
            min: 0, max: 1,
            ticks: {
              color: COLORS.textMuted,
              font: { family: '"JetBrains Mono"', size: 10 },
              stepSize: 0.25,
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
        },
        plugins: {
          legend: {
            labels: {
              color: COLORS.textMuted,
              font: { family: '"Inter"', size: 11 },
              boxWidth: 12,
              padding: 16,
            },
          },
        },
      },
    });
  }

  function initGameDifficultyChart() {
    const canvas = document.getElementById('game-difficulty-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    gameDifficultyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Array(30).fill(''),
        datasets: [{
          label: 'Difficulty',
          data: Array(30).fill(null),
          borderColor: COLORS.primary,
          backgroundColor: 'rgba(0, 212, 255, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        scales: {
          x: { display: false },
          y: {
            min: 0, max: 1,
            ticks: {
              color: COLORS.textMuted,
              font: { family: '"JetBrains Mono"', size: 9 },
              stepSize: 0.5,
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
          },
        },
        plugins: { legend: { display: false } },
      },
    });
  }

  function pushDifficultyData(difficulty, rtScore, stressIndex) {
    if (!difficultyChart) return;
    const ds = difficultyChart.data.datasets;
    ds[0].data.push(difficulty);
    ds[0].data.shift();
    ds[1].data.push(rtScore);
    ds[1].data.shift();
    ds[2].data.push(stressIndex);
    ds[2].data.shift();
    difficultyChart.update();
  }

  function pushGameDifficultyData(difficulty) {
    if (!gameDifficultyChart) return;
    gameDifficultyChart.data.datasets[0].data.push(difficulty);
    gameDifficultyChart.data.datasets[0].data.shift();
    gameDifficultyChart.update();
  }

  /* ================================================================
     YERKES-DODSON CHART  (Static illustration)
     ================================================================ */
  function initYerkesDodsonChart() {
    const canvas = document.getElementById('yerkes-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Generate bell-like curve data
    const points = 50;
    const labels = [];
    const data = [];
    for (let i = 0; i < points; i++) {
      const x = i / (points - 1);
      labels.push('');
      // Skewed bell curve (Yerkes-Dodson)
      const y = Math.exp(-Math.pow((x - 0.45) / 0.22, 2));
      data.push(y);
    }

    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data,
          borderColor: COLORS.accent,
          backgroundColor: function(context) {
            const chart = context.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return 'rgba(16, 185, 129, 0.1)';
            const gradient = c.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
            gradient.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
            gradient.addColorStop(0.35, 'rgba(16, 185, 129, 0.25)');
            gradient.addColorStop(0.55, 'rgba(16, 185, 129, 0.25)');
            gradient.addColorStop(0.75, 'rgba(249, 115, 22, 0.15)');
            gradient.addColorStop(1, 'rgba(239, 68, 68, 0.15)');
            return gradient;
          },
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          borderWidth: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: {
              display: true,
              color: COLORS.textMuted,
              font: { size: 10 },
              callback: function(val, index) {
                if (index === 0) return 'Low Arousal';
                if (index === 24) return 'Optimal';
                if (index === 49) return 'High Arousal';
                return '';
              },
              maxRotation: 0,
            },
            grid: { display: false },
          },
          y: {
            ticks: {
              display: true,
              color: COLORS.textMuted,
              font: { size: 10 },
              callback: function(val) {
                if (val === 0) return 'Low';
                if (val === 0.5) return '';
                if (val === 1) return 'Peak';
                return '';
              },
            },
            grid: { color: 'rgba(255,255,255,0.04)' },
            title: {
              display: true,
              text: 'Performance',
              color: COLORS.textMuted,
              font: { size: 11 },
            },
          },
        },
        plugins: { legend: { display: false } },
      },
    });
  }

  /* ================================================================
     HYSTERESIS BARS
     ================================================================ */
  function renderHysteresisBars(history) {
    const container = document.getElementById('hysteresis-bars');
    if (!container) return;

    // Use last 30 difficulty values
    const data = (history || []).slice(-30);
    // Pad to 30 if needed
    while (data.length < 30) data.unshift(0.35);

    let html = '';
    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      const height = Math.max(4, val * 80);
      const color = val < 0.25 ? COLORS.zoneBored
                  : val < 0.50 ? COLORS.zoneFlow
                  : val < 0.75 ? COLORS.zoneAnxious
                  : COLORS.zoneFrustrated;
      html += `<div class="hysteresis-bar filled" style="height:${height}px; background:${color};"></div>`;
    }
    container.innerHTML = html;
  }

  /* ================================================================
     DASHBOARD UPDATER
     ================================================================ */
  const gaugeRT       = new GaugeRenderer('gauge-rt', COLORS.primary);
  const gaugeMovement = new GaugeRenderer('gauge-movement', COLORS.secondary);
  const gaugeStress   = new GaugeRenderer('gauge-stress', COLORS.danger);

  function updateDashboard(state) {
    if (!state) return;

    // Gauges
    gaugeRT.draw(state.rtScore);
    gaugeMovement.draw(state.movementScore);
    gaugeStress.draw(state.stressIndex);

    // Gauge numeric values
    const elRT = document.getElementById('gauge-rt-val');
    const elMv = document.getElementById('gauge-movement-val');
    const elSt = document.getElementById('gauge-stress-val');
    if (elRT) elRT.textContent = state.rtScore.toFixed(2);
    if (elMv) elMv.textContent = state.movementScore.toFixed(2);
    if (elSt) elSt.textContent = state.stressIndex.toFixed(2);

    // Zone
    const zoneLabel = document.getElementById('zone-label');
    if (zoneLabel) {
      zoneLabel.textContent = state.zone;
      zoneLabel.className = 'zone-name ' + zoneClass(state.zone);
    }

    // Zone bar
    const zoneBar = document.getElementById('zone-bar');
    if (zoneBar) {
      const pct = state.difficulty * 100;
      zoneBar.style.width = pct + '%';
      zoneBar.style.background = ZONE_COLORS[state.zone] || COLORS.accent;
    }

    // Rescue mode
    const rescue = document.getElementById('rescue-indicator');
    if (rescue) {
      if (state.rescueMode) {
        rescue.classList.add('active');
      } else {
        rescue.classList.remove('active');
      }
    }

    // Enemy params
    if (window.EnemyAI) {
      const params = window.EnemyAI.getParams(state.difficulty);
      const arch = window.EnemyAI.getArchetype(state.zone);
      setText('param-speed', params.speedMult.toFixed(2) + '×');
      setText('param-aggression', params.aggression.toFixed(2));
      setText('param-hp', params.hpMult.toFixed(2) + '×');
      setText('param-damage', params.damageMult.toFixed(2) + '×');
      setText('param-archetype', arch);
    }

    // Charts
    pushDifficultyData(state.difficulty, state.rtScore, state.stressIndex);

    // Hysteresis bars
    renderHysteresisBars(state.history);
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  /* ================================================================
     PUBLIC API
     ================================================================ */
  window.Visualizer = {
    initDifficultyChart,
    initGameDifficultyChart,
    initYerkesDodsonChart,
    updateDashboard,
    pushGameDifficultyData,
    GaugeRenderer,
    renderHysteresisBars,
    COLORS,
    ZONE_COLORS,
  };
})();
