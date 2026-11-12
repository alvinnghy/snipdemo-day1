# Snip backend

A dependency-free Bun URL shortener API. Links are stored in memory and are
cleared when the server restarts.

## Run

```sh
bun start
```

The server listens on port `3000` by default. Set `PORT` to change it, `BASE_URL`
to set the origin used in generated short links, or `RAILWAY_PUBLIC_DOMAIN` to
derive that origin as `https://<domain>`. When `PUBLIC_DIR` is set, the server
also serves static files from that directory.

## API

- `POST /api/links` with `{ "url": "https://example.com" }` creates a short link.
- `GET /api/links` lists links.
- `GET /:code` redirects to the original URL and increments its hit count.
