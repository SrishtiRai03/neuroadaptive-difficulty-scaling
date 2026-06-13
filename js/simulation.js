/**
 * ============================================================================
 *  simulation.js — Neuroadaptive Difficulty Scaling (NDS) Engine
 * ============================================================================
 *
 *  Self-contained simulation pipeline that fuses three real-time player
 *  signals (reaction time, movement quality, stress proxy) into a single
 *  smoothed difficulty value.  Exposed globally via `window.NDS`.
 *
 *  Signal flow:
 *
 *    ReactionTimeAnalyser ─┐
 *    MovementAnalyser ──────┼──▶ DifficultyEngine ──▶ difficulty (0..1)
 *    StressDetector ────────┘
 *
 * ============================================================================
 */

(function () {
  'use strict';

  // ──────────────────────────────────────────────────────────────────────────
  //  CONSTANTS (from the research paper)
  // ──────────────────────────────────────────────────────────────────────────

  var RT_BASELINE        = 250;   // ms — typical human reaction time
  var RT_SLOW_THRESHOLD  = 400;   // ms — player is struggling
  var RT_FAST_THRESHOLD  = 150;   // ms — player is very skilled / alert
  var RT_WINDOW_SIZE     = 10;    // rolling window length

  var MOVEMENT_SAMPLE_RATE = 60;  // Hz — expected input rate

  var STRESS_DECAY         = 0.95;
  var DIFFICULTY_SMOOTHING = 0.15; // EMA alpha
  var HYSTERESIS_BUFFER    = 0.08;
  var RESCUE_THRESHOLD     = 0.85;
  var RESCUE_DURATION      = 90;   // seconds

  var MIN_DIFFICULTY = 0.1;
  var MAX_DIFFICULTY = 1.0;

  var WEIGHT_RT       = 0.40;
  var WEIGHT_MOVEMENT = 0.35;
  var WEIGHT_STRESS   = 0.25;

  // Zone boundaries (difficulty → zone name)
  var ZONES = [
    { ceiling: 0.25, name: 'BORED'      },
    { ceiling: 0.50, name: 'FLOW'       },  // ideal zone
    { ceiling: 0.75, name: 'ANXIOUS'    },
    { ceiling: 1.00, name: 'FRUSTRATED' }
  ];

  // ──────────────────────────────────────────────────────────────────────────
  //  UTILITY HELPERS
  // ──────────────────────────────────────────────────────────────────────────

  /** Clamp `v` into [lo, hi]. */
  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  /** Return the median of a numeric array (non-destructive). */
  function median(arr) {
    if (arr.length === 0) return 0;
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /** Euclidean distance between two 2-D points. */
  function dist(x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Variance of a numeric array. */
  function variance(arr) {
    if (arr.length < 2) return 0;
    var mean = 0;
    for (var i = 0; i < arr.length; i++) mean += arr[i];
    mean /= arr.length;
    var sumSq = 0;
    for (var j = 0; j < arr.length; j++) {
      var d = arr[j] - mean;
      sumSq += d * d;
    }
    return sumSq / arr.length;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  1. ReactionTimeAnalyser
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Maintains a rolling window of recent reaction-time samples and derives
   * a 0..1 "skill / alertness" score from the median value.
   */
   function ReactionTimeAnalyser() {
    this._window = [];           // last RT_WINDOW_SIZE samples (ms)
  }

  /**
   * Add a new reaction-time measurement.
   * @param {number} ms — reaction time in milliseconds
   */
  ReactionTimeAnalyser.prototype.addRT = function (ms) {
    this._window.push(ms);
    if (this._window.length > RT_WINDOW_SIZE) {
      this._window.shift();
    }
  };

  /**
   * Return the current median RT in milliseconds.
   * Falls back to RT_BASELINE if no data is available.
   */
  ReactionTimeAnalyser.prototype.getMedianRT = function () {
    if (this._window.length === 0) return RT_BASELINE;
    return median(this._window);
  };

  /**
   * Return a 0..1 score derived from the median RT.
   *   - RT <= RT_FAST_THRESHOLD  → 1.0  (very skilled / alert)
   *   - RT >= RT_SLOW_THRESHOLD  → 0.0  (struggling)
   *   - In between: linear interpolation
   */
  ReactionTimeAnalyser.prototype.getScore = function () {
    var m = this.getMedianRT();
    if (m <= RT_FAST_THRESHOLD) return 1.0;
    if (m >= RT_SLOW_THRESHOLD) return 0.0;
    // Linear interpolation:  fast→1, slow→0
    return 1.0 - (m - RT_FAST_THRESHOLD) / (RT_SLOW_THRESHOLD - RT_FAST_THRESHOLD);
  };

  /**
   * Compare the first half of the window to the second half and return
   * a qualitative trend label.
   *
   * @returns {'improving'|'stable'|'declining'}
   */
  ReactionTimeAnalyser.prototype.getTrend = function () {
    var w = this._window;
    if (w.length < 4) return 'stable';              // not enough data

    var half = Math.floor(w.length / 2);
    var firstHalf  = w.slice(0, half);
    var secondHalf = w.slice(half);

    var medFirst  = median(firstHalf);
    var medSecond = median(secondHalf);

    // Lower RT in the second half = improving
    var delta = medFirst - medSecond;
    var threshold = 20;   // ms — minimum change to count as a trend
    if (delta > threshold)  return 'improving';
    if (delta < -threshold) return 'declining';
    return 'stable';
  };

  /** Reset the analyser to its initial state. */
  ReactionTimeAnalyser.prototype.reset = function () {
    this._window = [];
  };

  // ──────────────────────────────────────────────────────────────────────────
  //  2. MovementAnalyser
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Tracks cursor / pointer movement and scores the player's motor
   * control quality on a 0..1 scale.
   *
   * Score = 0.6 × pathEfficiency + 0.4 × velocityConsistency
   *
   *   pathEfficiency     — straight-line / actual-path distance
   *   velocityConsistency — 1 − normalised velocity variance
   */
  function MovementAnalyser() {
    this._positions = [];   // { x, y, t }
    this._maxSamples = MOVEMENT_SAMPLE_RATE * 2;  // keep ~2 s of data
  }

  /**
   * Record a position sample.
   * @param {number} x         — horizontal position (px)
   * @param {number} y         — vertical position (px)
   * @param {number} timestamp — time of sample (ms, e.g. performance.now())
   */
  MovementAnalyser.prototype.addPosition = function (x, y, timestamp) {
    this._positions.push({ x: x, y: y, t: timestamp });
    if (this._positions.length > this._maxSamples) {
      this._positions.shift();
    }
  };

  /**
   * Compute the path-efficiency ratio (straight-line / total-path).
   * Returns 1.0 when perfectly direct, approaches 0.0 for aimless wandering.
   * @private
   */
  MovementAnalyser.prototype._pathEfficiency = function () {
    var p = this._positions;
    if (p.length < 2) return 1.0;

    var straightLine = dist(p[0].x, p[0].y, p[p.length - 1].x, p[p.length - 1].y);
    var totalPath    = 0;
    for (var i = 1; i < p.length; i++) {
      totalPath += dist(p[i - 1].x, p[i - 1].y, p[i].x, p[i].y);
    }

    if (totalPath === 0) return 1.0;       // stationary cursor
    return clamp(straightLine / totalPath, 0, 1);
  };

  /**
   * Compute velocity consistency (1 = uniform speed, 0 = extremely erratic).
   * Normalises the variance against the squared mean velocity so the metric
   * is scale-independent.
   * @private
   */
  MovementAnalyser.prototype._velocityConsistency = function () {
    var p = this._positions;
    if (p.length < 3) return 1.0;

    var velocities = [];
    for (var i = 1; i < p.length; i++) {
      var dt = (p[i].t - p[i - 1].t) / 1000;  // seconds
      if (dt <= 0) continue;
      var d = dist(p[i - 1].x, p[i - 1].y, p[i].x, p[i].y);
      velocities.push(d / dt);                 // px/s
    }

    if (velocities.length < 2) return 1.0;

    var v = variance(velocities);
    // Normalise: coefficient of variation squared
    var meanV = 0;
    for (var j = 0; j < velocities.length; j++) meanV += velocities[j];
    meanV /= velocities.length;
    if (meanV === 0) return 1.0;

    var cv = Math.sqrt(v) / meanV;   // coefficient of variation
    // Map cv → consistency:  cv=0 → 1, cv≥2 → 0
    return clamp(1.0 - cv / 2, 0, 1);
  };

  /**
   * Overall movement quality score (0..1).
   *   1.0 = smooth, efficient, direct movements (skilled)
   *   0.0 = erratic, jittery, aimless (struggling)
   */
  MovementAnalyser.prototype.getScore = function () {
    var pe = this._pathEfficiency();
    var vc = this._velocityConsistency();
    return 0.6 * pe + 0.4 * vc;
  };

  /** Reset the analyser. */
  MovementAnalyser.prototype.reset = function () {
    this._positions = [];
  };

  // ──────────────────────────────────────────────────────────────────────────
  //  3. StressDetector
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Proxy-based stress detector.  Without real biometrics we infer stress
   * from input cadence: rapid, uniform mashing of clicks/keys signals high
   * stress; calm, varied timing signals low stress.
   */
  function StressDetector() {
    this._clicks      = [];    // timestamps of recent click events
    this._keys        = [];    // timestamps of recent key events
    this._stressIndex = 0;     // exponentially smoothed stress level
    this._highSince   = null;  // timestamp when stress first exceeded RESCUE_THRESHOLD
    this._maxEvents   = 120;   // keep ~2 s at high input rates
  }

  /**
   * Record a click event.
   * @param {number} timestamp — event time in ms
   */
  StressDetector.prototype.addClickEvent = function (timestamp) {
    this._clicks.push(timestamp);
    if (this._clicks.length > this._maxEvents) this._clicks.shift();
  };

  /**
   * Record a key event.
   * @param {number} timestamp — event time in ms
   */
  StressDetector.prototype.addKeyEvent = function (timestamp) {
    this._keys.push(timestamp);
    if (this._keys.length > this._maxEvents) this._keys.shift();
  };

  /**
   * Compute a raw 0..1 stress sample from the most recent input events.
   *
   * High frequency + low inter-event variance = stress (mashing).
   * Low frequency  + high variance             = calm.
   * @private
   */
  StressDetector.prototype._rawSample = function () {
    // Merge both event streams and sort chronologically
    var events = this._clicks.concat(this._keys).sort(function (a, b) { return a - b; });

    if (events.length < 3) return 0;   // not enough data

    // --- Frequency component ---
    var windowMs  = events[events.length - 1] - events[0];
    if (windowMs <= 0) return 0;
    var frequency = (events.length / windowMs) * 1000;  // events per second

    // Normalise: 0 eps → 0, ≥15 eps → 1
    var freqScore = clamp(frequency / 15, 0, 1);

    // --- Burstiness component ---
    var intervals = [];
    for (var i = 1; i < events.length; i++) {
      intervals.push(events[i] - events[i - 1]);
    }
    var iv = variance(intervals);
    // High variance = calm (score 0), low variance = mashing (score 1)
    // Normalise against a reference variance (10 000 ms²)
    var burstScore = clamp(1.0 - Math.sqrt(iv) / 100, 0, 1);

    // Combine: both axes contribute equally
    return 0.5 * freqScore + 0.5 * burstScore;
  };

  /**
   * Return the current smoothed stress index (0..1).
   * The index is updated lazily each time this method is called.
   */
  StressDetector.prototype.getStressIndex = function () {
    var raw = this._rawSample();
    // Exponential smoothing
    this._stressIndex = this._stressIndex * STRESS_DECAY + raw * (1 - STRESS_DECAY);
    return this._stressIndex;
  };

  /**
   * Returns `true` if the stress level has remained above RESCUE_THRESHOLD
   * for longer than RESCUE_DURATION seconds.
   */
  StressDetector.prototype.isRescueNeeded = function () {
    var now = Date.now();

    if (this._stressIndex > RESCUE_THRESHOLD) {
      if (this._highSince === null) {
        this._highSince = now;
      }
      return (now - this._highSince) / 1000 > RESCUE_DURATION;
    }

    // Stress dropped below threshold — reset the timer
    this._highSince = null;
    return false;
  };

  /** Reset the detector. */
  StressDetector.prototype.reset = function () {
    this._clicks      = [];
    this._keys        = [];
    this._stressIndex = 0;
    this._highSince   = null;
  };

  // ──────────────────────────────────────────────────────────────────────────
  //  4. DifficultyEngine
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Fuses the three signal scores into a single smoothed difficulty value,
   * applying EMA smoothing and hysteresis to prevent jitter.
   */
  function DifficultyEngine() {
    this._difficulty  = 0.5;   // current smoothed difficulty
    this._rawValue    = 0.5;   // last raw fused value (before smoothing)
    this._zone        = 'FLOW';
    this._history     = [];    // last 60 difficulty snapshots
    this._historyMax  = 60;
  }

  /**
   * Determine the zone name for a given difficulty value.
   * @param {number} d — difficulty in [0, 1]
   * @returns {string}
   * @private
   */
  DifficultyEngine.prototype._zoneFor = function (d) {
    for (var i = 0; i < ZONES.length; i++) {
      if (d <= ZONES[i].ceiling) return ZONES[i].name;
    }
    return ZONES[ZONES.length - 1].name;
  };

  /**
   * Run one update tick.
   *
   * @param {number} rtScore       — 0..1 from ReactionTimeAnalyser
   * @param {number} movementScore — 0..1 from MovementAnalyser
   * @param {number} stressIndex   — 0..1 from StressDetector
   */
  DifficultyEngine.prototype.update = function (rtScore, movementScore, stressIndex) {
    // --- Fuse signals ---
    var raw = WEIGHT_RT * rtScore
            + WEIGHT_MOVEMENT * movementScore
            - WEIGHT_STRESS * stressIndex;

    raw = clamp(raw, MIN_DIFFICULTY, MAX_DIFFICULTY);
    this._rawValue = raw;

    // --- EMA smoothing ---
    this._difficulty = this._difficulty * (1 - DIFFICULTY_SMOOTHING)
                     + raw * DIFFICULTY_SMOOTHING;

    this._difficulty = clamp(this._difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY);

    // --- Hysteresis: only change zone if the delta exceeds the buffer ---
    var candidateZone = this._zoneFor(this._difficulty);
    if (candidateZone !== this._zone) {
      // Check if we've moved far enough from the current zone boundary
      var currentCeiling = 1.0;
      for (var i = 0; i < ZONES.length; i++) {
        if (ZONES[i].name === this._zone) {
          currentCeiling = ZONES[i].ceiling;
          break;
        }
      }
      var distFromBoundary = Math.abs(this._difficulty - currentCeiling);
      if (distFromBoundary > HYSTERESIS_BUFFER) {
        this._zone = candidateZone;
      }
    }

    // --- History ---
    this._history.push(this._difficulty);
    if (this._history.length > this._historyMax) {
      this._history.shift();
    }
  };

  /** Current smoothed difficulty (0..1). */
  DifficultyEngine.prototype.getDifficulty = function () {
    return this._difficulty;
  };

  /** Current zone name: 'BORED' | 'FLOW' | 'ANXIOUS' | 'FRUSTRATED'. */
  DifficultyEngine.prototype.getZone = function () {
    return this._zone;
  };

  /** Array of the last 60 difficulty values (for charting). */
  DifficultyEngine.prototype.getHistory = function () {
    return this._history.slice();  // defensive copy
  };

  /** Last raw (un-smoothed) fused value. */
  DifficultyEngine.prototype.getRaw = function () {
    return this._rawValue;
  };

  /** Reset the engine. */
  DifficultyEngine.prototype.reset = function () {
    this._difficulty = 0.5;
    this._rawValue   = 0.5;
    this._zone       = 'FLOW';
    this._history    = [];
  };

  // ──────────────────────────────────────────────────────────────────────────
  //  NDS Controller — Main Interface
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Top-level controller that wires the three signal processors into the
   * DifficultyEngine and provides a convenient public API.
   */
  var NDS = {
    /** @type {ReactionTimeAnalyser} */
    rt: new ReactionTimeAnalyser(),

    /** @type {MovementAnalyser} */
    movement: new MovementAnalyser(),

    /** @type {StressDetector} */
    stress: new StressDetector(),

    /** @type {DifficultyEngine} */
    engine: new DifficultyEngine(),

    // ── Lifecycle ──────────────────────────────────────────────────────

    /** Reset every module to its initial state. */
    reset: function () {
      this.rt.reset();
      this.movement.reset();
      this.stress.reset();
      this.engine.reset();
    },

    /**
     * Perform one simulation step: read all analyser scores and feed them
     * into the DifficultyEngine.
     */
    tick: function () {
      var rtScore       = this.rt.getScore();
      var movementScore = this.movement.getScore();
      var stressIndex   = this.stress.getStressIndex();

      this.engine.update(rtScore, movementScore, stressIndex);
    },

    // ── Queries ────────────────────────────────────────────────────────

    /**
     * Return a full snapshot of the current simulation state.
     * @returns {{
     *   rtScore: number,
     *   movementScore: number,
     *   stressIndex: number,
     *   difficulty: number,
     *   zone: string,
     *   rescueMode: boolean,
     *   history: number[]
     * }}
     */
    getState: function () {
      return {
        rtScore:       this.rt.getScore(),
        movementScore: this.movement.getScore(),
        stressIndex:   this.stress.getStressIndex(),
        difficulty:    this.engine.getDifficulty(),
        zone:          this.engine.getZone(),
        rescueMode:    this.stress.isRescueNeeded(),
        history:       this.engine.getHistory()
      };
    },

    // ── Synthetic Player Simulation ────────────────────────────────────

    /**
     * Feed one tick of synthetic data that mimics a particular player
     * archetype.  Useful for demos and testing.
     *
     * @param {'bored'|'flow'|'stressed'|'fatigued'} type
     */
    simulatePlayer: function (type) {
      var now = performance.now();

      switch (type) {
        // ── BORED: slow RT, smooth cursor, very low stress ──
        case 'bored':
          this.rt.addRT(_rand(350, 400));
          this._simSmoothMovement(now);
          this._simLowStress(now);
          break;

        // ── FLOW: optimal RT, very smooth cursor, low stress ──
        case 'flow':
          this.rt.addRT(_rand(200, 250));
          this._simVerySmoothMovement(now);
          this._simLowStress(now);
          break;

        // ── STRESSED: fast RT, erratic cursor, high click rate ──
        case 'stressed':
          this.rt.addRT(_rand(150, 180));
          this._simErraticMovement(now);
          this._simHighStress(now);
          break;

        // ── FATIGUED: very slow RT, sluggish cursor, low input ──
        case 'fatigued':
          this.rt.addRT(_rand(380, 500));
          this._simSluggishMovement(now);
          // No stress events — fatigued players have low input frequency
          break;

        default:
          console.warn('[NDS] Unknown player type: ' + type);
          return;
      }

      // After injecting data, run a tick
      this.tick();
    },

    // ── Private simulation helpers ─────────────────────────────────────

    /** @private — counter for movement sim x-position */
    _simX: 400,
    /** @private — counter for movement sim y-position */
    _simY: 300,

    /** @private — smooth, directed movement (bored player) */
    _simSmoothMovement: function (now) {
      // Steady rightward drift with minor jitter
      this._simX += _rand(3, 6);
      this._simY += _rand(-1, 1);
      this.movement.addPosition(this._simX, this._simY, now);
    },

    /** @private — very smooth, efficient movement (flow player) */
    _simVerySmoothMovement: function (now) {
      this._simX += _rand(4, 7);
      this._simY += _rand(0, 1);
      this.movement.addPosition(this._simX, this._simY, now);
    },

    /** @private — erratic, jittery movement (stressed player) */
    _simErraticMovement: function (now) {
      this._simX += _rand(-15, 15);
      this._simY += _rand(-15, 15);
      this.movement.addPosition(this._simX, this._simY, now);
    },

    /** @private — slow, sluggish movement (fatigued player) */
    _simSluggishMovement: function (now) {
      this._simX += _rand(0, 2);
      this._simY += _rand(0, 1);
      this.movement.addPosition(this._simX, this._simY, now);
    },

    /** @private — low stress: rare, spaced-out inputs */
    _simLowStress: function (now) {
      // Only add an event ~20 % of ticks
      if (Math.random() < 0.2) {
        this.stress.addClickEvent(now);
      }
    },

    /** @private — high stress: rapid, burst-like inputs */
    _simHighStress: function (now) {
      // Multiple rapid events per tick
      for (var i = 0; i < _randInt(3, 6); i++) {
        this.stress.addClickEvent(now + i * _rand(10, 30));
        this.stress.addKeyEvent(now + i * _rand(5, 20));
      }
    }
  };

  // ── Tiny random helpers (internal) ────────────────────────────────────

  /** Random float in [min, max). */
  function _rand(min, max) {
    return min + Math.random() * (max - min);
  }

  /** Random integer in [min, max] (inclusive). */
  function _randInt(min, max) {
    return Math.floor(_rand(min, max + 1));
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  EXPOSE GLOBALLY
  // ──────────────────────────────────────────────────────────────────────────

  window.NDS = NDS;

})();
