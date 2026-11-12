#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");

const USAGE = `Usage:
  snip add <url>    Shorten an HTTP(S) URL
  snip ls           List links and hit counts
  snip open <code>  Open a short link's destination
  snip help         Show this help

SNIP_API sets the API origin (default http://localhost:3000).`;
const TIMEOUT_MS = 10000;

function httpUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTP(S) URL`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${label} must be a valid HTTP(S) URL`);
  }
  return url;
}

function apiOrigin() {
  const url = httpUrl(process.env.SNIP_API || "http://localhost:3000", "SNIP_API");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("SNIP_API must be an HTTP(S) origin without a path or credentials");
  }
  return url.origin;
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiOrigin()}${path}`, {
      ...options,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new Error("API request timed out");
    }
    throw new Error(`API request failed: ${error.message}`);
  }
  return response;
}

async function jsonResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Invalid JSON response from API (HTTP ${response.status})`);
  }
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `API error (HTTP ${response.status})`);
  }
  return body;
}

function browserCommand(platform, url) {
  if (platform === "win32") {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-Command", "Start-Process -FilePath $env:SNIP_OPEN_URL -ErrorAction Stop"],
      env: { ...process.env, SNIP_OPEN_URL: url },
    };
  }
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "linux") return { command: "xdg-open", args: [url] };
  throw new Error(`Browser launching is not supported on ${platform}`);
}

function launchBrowser(url, platform = process.platform, spawnProcess = spawn) {
  const { command, args, env } = browserCommand(platform, url);
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, { env: env || process.env, stdio: "ignore" });
    child.once("error", (error) => reject(new Error(`Could not launch browser: ${error.message}`)));
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Could not launch browser (exit ${code})`));
    });
  });
}

async function main(args) {
  const [command, ...values] = args;
  if ((command === undefined || ["help", "-h", "--help"].includes(command)) && values.length === 0) {
    console.log(USAGE);
    return;
  }
  if (command === "add" && values.length === 1) {
    httpUrl(values[0], "URL");
    const response = await request("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: values[0] }),
    });
    const link = await jsonResponse(response);
    if (response.status !== 201 || typeof link?.shortUrl !== "string") {
      throw new Error("Unexpected response from API");
    }
    httpUrl(link.shortUrl, "API shortUrl");
    console.log(link.shortUrl);
    return;
  }
  if (command === "ls" && values.length === 0) {
    const links = await jsonResponse(await request("/api/links"));
    if (!Array.isArray(links) || links.some((link) =>
      typeof link?.code !== "string" || !Number.isInteger(link.hits) || typeof link.url !== "string")) {
      throw new Error("Unexpected response from API");
    }
    if (links.length === 0) {
      console.log("No links yet.");
      return;
    }
    const width = Math.max(4, ...links.map((link) => link.code.length));
    const hitsWidth = Math.max(4, ...links.map((link) => String(link.hits).length));
    console.log(`${"CODE".padEnd(width)}  ${"HITS".padStart(hitsWidth)}  URL`);
    for (const link of links) {
      console.log(`${link.code.padEnd(width)}  ${String(link.hits).padStart(hitsWidth)}  ${link.url}`);
    }
    return;
  }
  if (command === "open" && values.length === 1) {
    if (!/^[a-zA-Z0-9]{6}$/.test(values[0])) throw new Error("Code must be six base62 characters");
    const response = await request(`/${values[0]}`, { redirect: "manual" });
    if (response.status === 404) throw new Error(`Unknown short code: ${values[0]}`);
    const location = response.headers.get("location");
    if (response.status !== 302 || !location) throw new Error(`Unexpected redirect response (HTTP ${response.status})`);
    const target = httpUrl(location, "Redirect location").href;
    await launchBrowser(target);
    console.log(`Opening ${target}`);
    return;
  }
  throw new Error(`Invalid command or arguments.\n${USAGE}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { main, browserCommand, launchBrowser };
