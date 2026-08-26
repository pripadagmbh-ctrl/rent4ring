# Rent4Ring — Home Circuit

A browser-based Nürburgring Nordschleife racing game built for Rent4Ring's fleet of hire cars.

Drive from the Rent4Ring base at Burgstraße 1, Nürburg, up onto the Nordschleife itself — traced from real
OpenStreetMap survey data at 20.832 km, all 43 named sections, and a slope-limited elevation profile from
Breidscheid (320 m) to the Hohe Acht (617 m). Herr Müller, the shop's mascot, rides along in the HUD and hands
out a trophy — plus a 0–10% discount code, staffed to your lap time — at the flag.

## Stack

- Vite + React + TypeScript
- three.js for the 3D circuit, cars, and garage showroom
- A from-scratch single-track tyre model (`src/game/physics.ts`) — friction-ellipse combined slip, load
  transfer, banking, ABS/TC as assists rather than magic grip

## Running locally

```bash
npm install
npm run dev
```

## Track and approach data

`src/data/nordschleife.json` and `src/data/approach.json` are generated from OpenStreetMap (relation 38566,
plus the local road network around Nürburg) by the scripts in `scripts/`. Re-run them with:

```bash
node scripts/build-track.mjs
node scripts/build-approach.mjs
```

## Attribution

Circuit geometry derived from OpenStreetMap relation 38566 (ODbL) — © OpenStreetMap contributors. This is an
unofficial fan project with no affiliation to Nürburgring 1927 GmbH & Co. KG or the vehicle manufacturers
referenced in the fleet list.
