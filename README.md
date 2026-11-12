# Snip CLI

Requires Node.js 20 or later. Run `node cli.js help`, or use the `snip`,
`snip.cmd`, or `snip.ps1` wrapper for your shell.

- `snip add <url>` creates a short link for an HTTP(S) URL.
- `snip ls` lists codes, hit counts, and destination URLs.
- `snip open <code>` resolves a code and opens its destination.

Set `SNIP_API` to the backend HTTP(S) origin; it defaults to
`http://localhost:3000`. Requests time out after 10 seconds. Errors are written
to stderr and return exit code 1. Opening a code counts one backend hit.

Run `npm test` for mock API and browser-launch tests.
