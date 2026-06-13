/**
 * enemies.js — Enemy AI Parameter Mapping System
 * 
 * Neuroadaptive Difficulty Scaling (NDS)
 * 
 * Maps cognitive zones and difficulty levels to enemy archetypes and stats.
 * Depends on: window.NDS (from simulation.js)
 * Exposes:    window.EnemyAI
 */

(function () {
    'use strict';

    // =========================================================================
    // ARCHETYPE DEFINITIONS
    // =========================================================================
    // Base stat multipliers at difficulty 0.5 (neutral midpoint).
    // Each archetype serves a specific neuroadaptive purpose:
    //
    //   SCOUT     — Fast, fragile. Re-engages bored players with speed pressure.
    //   GRUNT     — Balanced baseline. Maintains flow without distortion.
    //   TANK      — Slow, durable. Tests sustained focus during flow state.
    //   BERSERKER — Fast, aggressive, glass-cannon. Challenges skilled players.
    //   GUARDIAN  — Slow, very tanky, gentle. Mercy enemy for frustrated players.
    // =========================================================================

    var ARCHETYPES = {
        SCOUT: {
            speed:     1.4,
            hp:        0.6,
            damage:    0.5,
            aggression: 0.7,
            spawnRate: 1.2,
            color:     '#00d4ff',
            description: 'Fast, low HP, low damage — pressures bored players with speed'
        },
        GRUNT: {
            speed:     1.0,
            hp:        1.0,
            damage:    1.0,
            aggression: 0.5,
            spawnRate: 1.0,
            color:     '#94a3b8',
            description: 'Balanced, medium everything — standard enemy'
        },
        TANK: {
            speed:     0.6,
            hp:        1.8,
            damage:    0.8,
            aggression: 0.3,
            spawnRate: 0.7,
            color:     '#7c3aed',
            description: 'Slow, high HP, moderate damage — tests sustained focus'
        },
        BERSERKER: {
            speed:     1.6,
            hp:        0.5,
            damage:    1.4,
            aggression: 0.9,
            spawnRate: 0.9,
            color:     '#ef4444',
            description: 'Fast, aggressive, low HP — challenges skilled players'
        },
        GUARDIAN: {
            speed:     0.4,
            hp:        2.5,
            damage:    0.3,
            aggression: 0.2,
            spawnRate: 0.5,
            color:     '#10b981',
            description: 'Slow, very high HP, low damage — mercy enemy for frustrated players'
        }
    };

    // =========================================================================
    // ZONE → ARCHETYPE MAPPING
    // =========================================================================
    // Each cognitive zone maps to the archetype(s) best suited to guide the
    // player back toward flow state.
    // =========================================================================

    var ZONE_ARCHETYPE_MAP = {
        BORED:      'SCOUT',      // Fast enemies to wake them up
        FLOW:       'GRUNT',      // Balanced challenge (TANK mixed in below)
        ANXIOUS:    'BERSERKER',  // Test their skills at the edge
        FRUSTRATED: 'GUARDIAN'    // Mercy mode — easy to defeat
    };

    // =========================================================================
    // DIFFICULTY → PARAMETER SCALING
    // =========================================================================
    // Linear mappings from difficulty ∈ [0, 1] to multiplied stat ranges.
    //
    //   speedMult  = 0.5 + difficulty * 1.0   →  [0.5x .. 1.5x]
    //   aggression = 0.2 + difficulty * 0.6   →  [0.2  .. 0.8 ]
    //   hpMult     = 0.7 + difficulty * 0.8   →  [0.7x .. 1.5x]
    //   damageMult = 0.5 + difficulty * 1.0   →  [0.5x .. 1.5x]
    //   spawnRate  = 0.8 + difficulty * 0.8   →  [0.8x .. 1.6x]
    // =========================================================================

    /**
     * Compute global enemy parameters from a difficulty value.
     * @param {number} difficulty — Normalised difficulty in [0, 1].
     * @returns {{ speedMult: number, aggression: number, hpMult: number, damageMult: number, spawnRate: number }}
     */
    function getParams(difficulty) {
        // Clamp to valid range
        var d = Math.max(0, Math.min(1, difficulty));

        return {
            speedMult:  0.5 + d * 1.0,   // 0.5x → 1.5x
            aggression: 0.2 + d * 0.6,   // 0.2  → 0.8
            hpMult:     0.7 + d * 0.8,   // 0.7x → 1.5x
            damageMult: 0.5 + d * 1.0,   // 0.5x → 1.5x
            spawnRate:  0.8 + d * 0.8    // 0.8x → 1.6x
        };
    }

    // =========================================================================
    // ZONE → ARCHETYPE SELECTION
    // =========================================================================

    /**
     * Select the recommended archetype for a cognitive zone.
     * FLOW zone has a 30% chance of returning TANK instead of GRUNT
     * to test sustained focus without over-stressing the player.
     *
     * @param {string} zone — One of 'BORED', 'FLOW', 'ANXIOUS', 'FRUSTRATED'.
     * @returns {string} Archetype name.
     */
    function getArchetype(zone) {
        var upperZone = (zone || 'FLOW').toUpperCase();

        // FLOW has a weighted mix: 70% GRUNT, 30% TANK
        if (upperZone === 'FLOW') {
            return Math.random() < 0.3 ? 'TANK' : 'GRUNT';
        }

        return ZONE_ARCHETYPE_MAP[upperZone] || 'GRUNT';
    }

    // =========================================================================
    // ARCHETYPE STAT CALCULATION
    // =========================================================================

    /**
     * Compute the fully-scaled stats for a named archetype at a given difficulty.
     * Final stat = archetype base value × difficulty multiplier.
     *
     * @param {string} name       — Archetype name (e.g. 'SCOUT').
     * @param {number} difficulty — Normalised difficulty in [0, 1].
     * @returns {{ speed: number, hp: number, maxHp: number, damage: number, aggression: number, spawnRate: number, color: string }}
     */
    function getArchetypeStats(name, difficulty) {
        var archetype = ARCHETYPES[name] || ARCHETYPES.GRUNT;
        var params    = getParams(difficulty);

        var finalHp = archetype.hp * params.hpMult;

        return {
            speed:      archetype.speed     * params.speedMult,
            hp:         finalHp,
            maxHp:      finalHp,
            damage:     archetype.damage    * params.damageMult,
            aggression: archetype.aggression * (params.aggression / 0.5), // scale relative to neutral 0.5
            spawnRate:  archetype.spawnRate  * params.spawnRate,
            color:      archetype.color
        };
    }

    // =========================================================================
    // SPAWN MANAGER
    // =========================================================================
    // Manages spawn timing and produces fully-configured enemy objects.
    //
    // Usage:
    //   var spawner = new EnemyAI.SpawnManager(800, 600);
    //   // In game loop:
    //   spawner.update(difficulty, zone);
    //   if (spawner.shouldSpawn()) {
    //       var enemy = spawner.getNextEnemy();
    //       // ... add to game world
    //   }
    // =========================================================================

    /**
     * @constructor
     * @param {number} canvasWidth  — Width of the play area in pixels.
     * @param {number} canvasHeight — Height of the play area in pixels.
     */
    function SpawnManager(canvasWidth, canvasHeight) {
        this.canvasWidth  = canvasWidth  || 800;
        this.canvasHeight = canvasHeight || 600;

        // Internal state
        this.difficulty    = 0.5;
        this.zone          = 'FLOW';
        this.spawnTimer    = 0;
        this.spawnInterval = 2000; // ms between spawns (recalculated on update)
        this.lastUpdate    = Date.now();
    }

    /**
     * Update internal state with current difficulty and cognitive zone.
     * Call once per frame or tick before checking shouldSpawn().
     *
     * @param {number} difficulty — Current difficulty in [0, 1].
     * @param {string} zone      — Current cognitive zone.
     */
    SpawnManager.prototype.update = function (difficulty, zone) {
        var now     = Date.now();
        var deltaMs = now - this.lastUpdate;
        this.lastUpdate = now;

        this.difficulty = Math.max(0, Math.min(1, difficulty));
        this.zone       = (zone || 'FLOW').toUpperCase();

        // Recalculate spawn interval based on difficulty-scaled spawn rate.
        // Higher spawnRate → shorter interval → more enemies.
        // Base interval 2000ms divided by the effective spawn rate.
        var params = getParams(this.difficulty);
        this.spawnInterval = 2000 / params.spawnRate;

        // Advance the timer
        this.spawnTimer += deltaMs;
    };

    /**
     * Check whether enough time has elapsed to spawn a new enemy.
     * Consumes the timer on success (resets the accumulated time).
     *
     * @returns {boolean} True if an enemy should be spawned this tick.
     */
    SpawnManager.prototype.shouldSpawn = function () {
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer -= this.spawnInterval;
            return true;
        }
        return false;
    };

    /**
     * Generate a random spawn position along a random edge of the canvas.
     * Enemies always enter from off-screen edges.
     *
     * @returns {{ x: number, y: number }}
     */
    SpawnManager.prototype._randomEdgePosition = function () {
        // Pick a random edge: 0=top, 1=right, 2=bottom, 3=left
        var edge = Math.floor(Math.random() * 4);
        var x, y;

        switch (edge) {
            case 0: // Top
                x = Math.random() * this.canvasWidth;
                y = 0;
                break;
            case 1: // Right
                x = this.canvasWidth;
                y = Math.random() * this.canvasHeight;
                break;
            case 2: // Bottom
                x = Math.random() * this.canvasWidth;
                y = this.canvasHeight;
                break;
            case 3: // Left
                x = 0;
                y = Math.random() * this.canvasHeight;
                break;
            default:
                x = 0;
                y = 0;
        }

        return { x: x, y: y };
    };

    /**
     * Produce a fully-configured enemy object ready for the game world.
     * Archetype is selected based on the current cognitive zone.
     *
     * @returns {{ archetype: string, x: number, y: number, speed: number,
     *             hp: number, maxHp: number, damage: number, aggression: number,
     *             radius: number, color: string }}
     */
    SpawnManager.prototype.getNextEnemy = function () {
        var archetype = getArchetype(this.zone);
        var stats     = getArchetypeStats(archetype, this.difficulty);
        var pos       = this._randomEdgePosition();

        // Radius scales with HP — tankier enemies appear visually larger.
        // Base radius 10px, scaled by square-root of HP for perceptual balance.
        var radius = Math.max(6, Math.min(30, 10 * Math.sqrt(stats.hp)));

        return {
            archetype:  archetype,
            x:          pos.x,
            y:          pos.y,
            speed:      stats.speed,
            hp:         stats.hp,
            maxHp:      stats.maxHp,
            damage:     stats.damage,
            aggression: stats.aggression,
            radius:     radius,
            color:      stats.color
        };
    };

    // =========================================================================
    // PUBLIC API
    // =========================================================================

    window.EnemyAI = {
        /** Archetype base definitions (read-only reference) */
        ARCHETYPES: ARCHETYPES,

        /** Get difficulty-scaled global enemy parameters */
        getParams: getParams,

        /** Get recommended archetype name for a cognitive zone */
        getArchetype: getArchetype,

        /** Get fully-scaled stats for a specific archetype at a given difficulty */
        getArchetypeStats: getArchetypeStats,

        /** SpawnManager constructor */
        SpawnManager: SpawnManager
    };

    console.log('[EnemyAI] Enemy AI parameter mapping system loaded — 5 archetypes ready');

})();
