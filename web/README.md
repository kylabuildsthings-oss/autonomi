# Autonomi Web

Static **landing** and **app** UI for [Autonomi](https://github.com/kylabuildsthings-oss/autonomi). No build step.

For full setup (contracts, backend, env), see the [root README](../README.md).

## Run locally

```bash
python3 -m http.server 8080 --directory web
# Or: npx serve web -p 8080
```

Open http://localhost:8080. For **live dashboard data**, run the backend (`cd backend && npm run dev`) so the dashboard can call `GET http://localhost:3000/api/dashboard`.

## Design

- **Sandy Pixel–DeFi**: 16-bit pixel aesthetic, warm desert palette
- **Tokens**: `design-tokens.css` (colors, spacing, type scale)
- **Base**: `styles.css` (cards, buttons, nav), `app.css` (app pages), `landing.css` (landing), `dashboard.css` (position card, LTV gauge), `responsive.css` (breakpoints, touch targets)

## Pages

| File            | Purpose                          |
|-----------------|----------------------------------|
| `index.html`    | Landing (hero, features, stats)  |
| `dashboard.html`| Dashboard with live position/API |
| `activity.html` | Agent activity log               |
| `alerts.html`   | SMS & notifications              |
| `profile.html`  | User settings                    |
| `strategy.html` | Strategy & roadmap               |
| `docs.html`     | Documentation (protocol, API)    |

`dashboard.js` fetches `/api/dashboard` and renders USYC price and position.

## Breakpoints

- **Mobile**: single column, bottom nav, 44px touch targets
- **Tablet (768px+)**: top tab bar, 2-column stats
- **Desktop (1024px+)**: full nav, 1400px container, 4-column stats
