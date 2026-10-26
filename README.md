<img src="public/assets/icon.svg" width="64" height="64" alt="">

# Warehouse Run · KitFlow

A dashboard-style warehouse strategy game for desktop and mobile browsers,
built with React, React Three Fiber and three.js.

You run one shift (06:00–14:00, 5 minutes real time) at the Riverside Hub:
detrash inbound kits (cut straps → peel wrap → lift cardboard → pull dunnage,
without touching the parts), keep the workcentres fed while they build machines,
book outbound trucks and ship before the due time.

Every shift rolls a random seed and two **shift modifiers** (Heatwave, Carrier
Strike, Holiday Rush, Supplier Sale…) shown on the briefing before you clock in;
see `src/game/modifiers.ts`. **Daily challenge** uses the date as the seed, so
everyone gets the same orders and conditions that day.

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
```

Dev-only: `?demo=60` fast-forwards a shift by 60s with an autopilot (seed 1, or
`&seed=N`), and `&kit=1` also opens the detrash view.

Layout: `src/game` (pure-TS simulation + tuning), `src/scene` (3D yard),
`src/detrash` (close-up mini-game), `src/ui` (dashboard panels), `src/audio`
(synthesized SFX + generative music). The previous single-file arcade prototype
is kept in `legacy/arcade.html`.
