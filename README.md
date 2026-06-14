# 🧠 NDS — Neuroadaptive Difficulty Scaling System

> *"The best difficulty system is one the player never notices — they just feel like the game was made for them."*

An interactive web demo of **bio-behavioural signal-driven dynamic difficulty adjustment** for games. Built for the **NeuronEx Hackathon 2026**.

🔗 **Live Demo:** [neuroadaptive-difficulty-scaling.vercel.app](https://neuroadaptive-difficulty-scaling.vercel.app)

---

## 📖 Overview

NDS (Neuroadaptive Difficulty Scaling) dynamically adjusts enemy behaviour in real time by reading three bio-behavioural signals from the player — reaction time, movement patterns, and stress indicators. Grounded in **Csikszentmihalyi's Flow Theory** and the **Yerkes-Dodson arousal curve**, the system keeps players in an optimal challenge zone without them ever touching a difficulty slider.

---

## ✨ Features

- **Real-Time Signal Fusion** — Three weighted bio-behavioural pillars combine into a single difficulty score, updated at 60 Hz.
- **Flow Channel Visualisation** — Interactive slider lets you simulate different player states (Bored → Flow → Anxious → Frustrated).
- **Live Dashboard** — Gauge rings, difficulty timeline chart, enemy parameter readouts, and a hysteresis buffer visualiser all update live.
- **Playable Demo** — A 60-second click-target session where the NDS engine reads *your actual* signals and adapts enemy behaviour in real time.
- **Session Report** — End-of-session modal with final score, average reaction time, accuracy, and dominant flow zone.
- **Rescue Mode** — Automatically activates when stress exceeds 0.85 for over 90 seconds, pulling the player back from frustration.

---

## 🔬 The Science

### Three Signal Pillars

| Pillar | What It Measures | Weight |
|---|---|---|
| ⏱ **Reaction Time Analysis** | Rolling median of click latencies (10-sample window). Maps to a 0–1 skill score relative to a 250 ms baseline. | 0.40 |
| 🖱 **Movement Pattern Analysis** | Path efficiency ratio + velocity variance at 60 Hz. Smooth cursor paths → high skill; jittery paths → struggle. | 0.35 |
| 💓 **Stress Signal Detection** | Click-mashing frequency and input burstiness as a stress proxy, with exponential decay (rate = 0.95) for responsiveness. | 0.25 |

### Difficulty Zones

| Zone | Condition | System Response |
|---|---|---|
| 😴 Bored | Challenge too low | ↑ Enemy speed & aggression |
| 🎯 Flow | Optimal challenge | ✓ Balanced — no change |
| 😰 Anxious | Challenge rising | ↓ Spawn rate |
| 😤 Frustrated | Challenge too high | ⚠ Rescue Mode activated |

Zone transitions use a **hysteresis buffer** to prevent rapid oscillation — the system must be confident a zone change is warranted before committing.

### Enemy Parameters Driven by NDS

- Speed Multiplier
- Aggression Score
- HP Multiplier
- Damage Multiplier
- Enemy Archetype (e.g. GRUNT → ELITE)

---

## 🗂 Project Structure

```
neuroadaptive-difficulty-scaling/
├── index.html                        # Single-page app entry point
├── css/
│   └── style.css                     # All styles (dark-themed, responsive)
├── js/
│   ├── simulation.js                 # NDS signal fusion & difficulty engine
│   ├── enemies.js                    # Enemy parameter mapping
│   ├── visualizer.js                 # Dashboard charts & gauge rendering
│   ├── game.js                       # Playable demo game loop
│   └── app.js                        # Glue code & UI event handling
├── NDS_Gaming_Concept_Report.docx    # Full concept report
├── Neuromorphic Gaming AI System.pdf # System design document
├── render.yaml                       # Render.com deployment config
└── .gitignore
```

---

## 🚀 Getting Started

No build step required — the project is pure HTML/CSS/JS.

### Run Locally

```bash
git clone https://github.com/SrishtiRai03/neuroadaptive-difficulty-scaling.git
cd neuroadaptive-difficulty-scaling
# Open index.html in your browser, or serve with any static file server:
npx serve .
```

### Deploy

The repo includes a `render.yaml` for one-click deployment to [Render](https://render.com). It is also deployed on Vercel at the link above.

---

## 🛠 Tech Stack

- **Vanilla JS** (no frameworks) — `simulation.js`, `enemies.js`, `game.js`, `visualizer.js`, `app.js`
- **HTML5 Canvas** — particle background, playable game, gauge rings
- **[Chart.js 4.4.3](https://www.chartjs.org/)** — difficulty timeline and Yerkes-Dodson curve
- **CSS Custom Properties** — theming and zone colour tokens
- **Google Fonts** — Outfit + JetBrains Mono

---

## 👥 Contributors

- [SrishtiRai03](https://github.com/SrishtiRai03)
- [dhhairya](https://github.com/dhhairya)

---

## 📜 License

This project was created for the **NeuronEx Hackathon 2026**. See the repository for licensing details.
