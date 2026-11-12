# Snip frontend

Angular 19 client for the Snip URL shortener. It validates HTTP(S) URLs, creates short links, and lists links with hit counts.

## Run locally

Start the backend on port 3000, then run:

```bash
npm install
npx ng serve
```

Open `http://localhost:4200`. The development app calls the API at `http://localhost:3000`; production builds use the same origin as the serving backend.

## Verify

```bash
npx ng build
npx ng test --watch=false --browsers=ChromeHeadless
```

The production browser app is emitted to `dist/snip-frontend/browser`.
