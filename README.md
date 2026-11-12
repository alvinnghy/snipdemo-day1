# Snip

Snip is a tiny URL shortener with one backend and two clients: an Angular web
app and a Node.js CLI. The backend stores links in memory, so they are cleared
when the server restarts.

## Repository layout

| Path | Branch | Contents |
| --- | --- | --- |
| `backend/` | `backend` | Bun API server |
| `frontend/` | `frontend` | Angular 19 web app |
| `cli/` | `cli` | CommonJS Node.js CLI |

Each component is a submodule of this repository, pinned to a specific commit.
Clone with `--recurse-submodules`; a plain clone leaves those directories empty.

```sh
git clone --recurse-submodules https://github.com/alvinnghy/snipdemo-day1.git
cd snipdemo-day1
```

## API contract

| Method | Path | Result |
| --- | --- | --- |
| `POST` | `/api/links` | Accepts `{ "url": "https://…" }`; returns `201` with `{ code, url, shortUrl, hits, createdAt }`, or `400` for invalid input |
| `GET` | `/api/links` | Returns `200` with all links |
| `GET` | `/:code` | Returns `302` to the original URL and increments hits, or `404` when unknown |

## Run locally

Start the backend in one terminal:

```sh
cd backend
bun start
```

Start the frontend in another terminal:

```sh
cd frontend
npm install
npx ng serve
```

Use the CLI from a third terminal:

```sh
cd cli
node cli.js help
node cli.js add https://example.com
node cli.js ls
node cli.js open <code>
```

The CLI uses `http://localhost:3000` by default; set `SNIP_API` to use another
backend URL.

## Updating a component

Make and push component changes from inside its submodule, then update the
superproject pointer:

```sh
cd backend
git add -A
git commit -m "Describe backend change"
git push
cd ..
git submodule update --remote backend
git add backend
git commit -m "Bump backend submodule"
git push
```

Repeat with `frontend` or `cli` as appropriate. The submodule commit and the
superproject pointer update are separate commits; the pointer records the exact
component revision used by this checkout.
