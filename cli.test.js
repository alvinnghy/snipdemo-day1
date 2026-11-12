"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { execFile } = require("node:child_process");
const { EventEmitter } = require("node:events");
const { promisify } = require("node:util");
const path = require("node:path");
const { browserCommand, launchBrowser } = require("./cli");

const execFileAsync = promisify(execFile);
const cli = path.join(__dirname, "cli.js");

async function run(args, origin) {
  try {
    const result = await execFileAsync(process.execPath, [cli, ...args], {
      env: { ...process.env, SNIP_API: origin },
    });
    return { ...result, code: 0 };
  } catch (error) {
    return { stdout: error.stdout, stderr: error.stderr, code: error.code };
  }
}

test("argument handling and API responses", async (t) => {
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    if (req.method === "POST") {
      let data = "";
      req.on("data", (chunk) => { data += chunk; });
      req.on("end", () => {
        assert.deepEqual(JSON.parse(data), { url: "https://example.com/" });
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ shortUrl: "http://localhost:3000/Ab1234" }));
      });
    } else if (req.url === "/api/links") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([{ code: "Ab1234", hits: 3, url: "https://example.com/" }]));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const help = await run(["help"], origin);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /snip add/);
  for (const args of [["add", "file:///tmp/x"], ["ls", "extra"], ["open", "../x"], ["unknown"]]) {
    const result = await run(args, origin);
    assert.equal(result.code, 1);
    assert.notEqual(result.stderr, "");
  }
  assert.equal(calls.length, 0);
  const created = await run(["add", "https://example.com/"], origin);
  assert.equal(created.code, 0);
  assert.equal(created.stdout.trim(), "http://localhost:3000/Ab1234");
  const list = await run(["ls"], origin);
  assert.equal(list.code, 0);
  assert.match(list.stdout, /Ab1234\s+3\s+https:\/\/example.com\//);
  const missing = await run(["open", "Ab1234"], origin);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /Unknown short code/);
  assert.deepEqual(calls, ["POST /api/links", "GET /api/links", "GET /Ab1234"]);
});

test("empty lists, API failures and offline backend", async (t) => {
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "GET") res.end("[]");
    else { res.writeHead(400); res.end('{"error":"Rejected"}'); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await run(["ls"], origin)).stdout.trim(), "No links yet.");
  const rejected = await run(["add", "https://example.com"], origin);
  assert.equal(rejected.code, 1);
  assert.match(rejected.stderr, /Rejected/);
  await new Promise((resolve) => server.close(resolve));
  const offline = await run(["ls"], origin);
  assert.equal(offline.code, 1);
  assert.match(offline.stderr, /API request failed/);
});

test("manual redirects are not followed and invalid locations are rejected", async (t) => {
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push(req.url);
    res.writeHead(302, { location: "ftp://example.com/file" });
    res.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const result = await run(["open", "Ab1234"], `http://127.0.0.1:${server.address().port}`);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Redirect location must be a valid HTTP/);
  assert.deepEqual(calls, ["/Ab1234"]);
});

test("unresponsive backend times out", async (t) => {
  const server = http.createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const start = Date.now();
  const result = await run(["ls"], `http://127.0.0.1:${server.address().port}`);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /timed out/);
  assert.ok(Date.now() - start >= 9000);
});

test("browser commands preserve URL arguments without shell interpolation", async () => {
  const url = "https://example.com/?a=1&b=2";
  assert.deepEqual(browserCommand("darwin", url), { command: "open", args: [url] });
  assert.deepEqual(browserCommand("linux", url), { command: "xdg-open", args: [url] });
  const windows = browserCommand("win32", url);
  assert.equal(windows.command, "powershell.exe");
  assert.equal(windows.env.SNIP_OPEN_URL, url);
  assert(!windows.args.some((arg) => arg.includes(url)));
  assert.throws(() => browserCommand("unsupported", url), /not supported/);

  const fakeSpawn = (command, args, options) => {
    assert.equal(command, "xdg-open");
    assert.deepEqual(args, [url]);
    assert.equal(options.stdio, "ignore");
    const child = new EventEmitter();
    process.nextTick(() => child.emit("close", 0));
    return child;
  };
  await launchBrowser(url, "linux", fakeSpawn);
  await assert.rejects(launchBrowser(url, "linux", () => {
    const child = new EventEmitter();
    process.nextTick(() => child.emit("error", new Error("not found")));
    return child;
  }), /Could not launch browser/);
});
