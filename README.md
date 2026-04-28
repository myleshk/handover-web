# Handover Web

Frontend for Handover — a minimal WebSocket chat app that pairs exactly two users for one-on-one chat sessions. Built with Vue 3 and Centrifuge.

## Features

- Instant pairing: Two users are matched automatically
- Real-time messaging over WebSocket (SSE fallback)
- Responsive simple UI
- GitHub Pages deployment (free!)

## Project structure

```
├── src/
│   ├── App.vue             — Main chat component
│   ├── main.js             — Vue entry point
│   └── style.css           — Global styles
├── index.html              — HTML entry point
├── vite.config.js          — Vite config
├── package.json            — Dependencies
└── .github/workflows/deploy.yml — GitHub Pages CI/CD
```

## Development

```bash
# Install dependencies
npm install

# Start dev server (runs on http://localhost:3000)
npm run dev
```

The dev server proxies `/centrifuge` requests to `http://localhost:8080` (your backend).

Make sure the backend is running:

```bash
cd /path/to/handover-server
docker compose up -d   # starts Redis
REDIS_ADDR=localhost:6379 go run .
```

## GitHub Pages Deployment

### Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under "Source" select "GitHub Actions"
3. Push changes to `main` branch — the deploy workflow runs automatically!

### Manual build

```bash
npm run build
# Output in ./dist directory
```

## Tech Stack

- Vue 3 (Composition API)
- Vite
- Centrifuge JS

## License

[GNU](LICENSE)
