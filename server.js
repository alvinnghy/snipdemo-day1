import { realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve, relative, sep } from "node:path";

const links = new Map();
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function makeCode() {
  let code = "";
  const bytes = new Uint8Array(16);

  while (code.length < 6) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < 248) code += alphabet[byte % alphabet.length];
      if (code.length === 6) break;
    }
  }

  return code;
}

function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const port = Number(process.env.PORT ?? 3000);
const baseUrl = (
  process.env.BASE_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${port}`)
).replace(/\/+$/, "");
const publicDir = process.env.PUBLIC_DIR
  ? resolve(process.env.PUBLIC_DIR)
  : null;

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "POST" && url.pathname === "/api/links") {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "Request body must be valid JSON." }, 400);
      }

      if (
        typeof body?.url !== "string" ||
        !["http:", "https:"].includes(parseUrlProtocol(body.url))
      ) {
        return jsonResponse(
          { error: "url must be a valid HTTP or HTTPS URL." },
          400,
        );
      }

      let code;
      do {
        code = makeCode();
      } while (links.has(code));

      const link = {
        code,
        url: body.url,
        shortUrl: `${baseUrl}/${code}`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, link);
      return jsonResponse(link, 201);
    }

    if (request.method === "GET" && url.pathname === "/api/links") {
      return jsonResponse([...links.values()]);
    }

    if (request.method === "GET" && publicDir) {
      const file = await findPublicFile(url.pathname);
      if (file) return new Response(Bun.file(file), { headers: corsHeaders });
    }

    if (request.method === "GET" && url.pathname.length > 1) {
      const code = url.pathname.slice(1);
      if (!code.includes("/")) {
        const link = links.get(code);
        if (link) {
          link.hits += 1;
          return new Response(null, {
            status: 302,
            headers: {
              ...corsHeaders,
              Location: link.url,
            },
          });
        }
      }
    }

    return jsonResponse({ error: "Not found." }, 404);
  },
});

function parseUrlProtocol(value) {
  try {
    return new URL(value).protocol;
  } catch {
    return "";
  }
}

async function findPublicFile(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }

  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = resolve(publicDir, `.${requestedPath}`);
  const fromRoot = relative(publicDir, filePath);

  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    return null;
  }

  try {
    const [rootPath, actualPath, info] = await Promise.all([
      realpath(publicDir),
      realpath(filePath),
      stat(filePath),
    ]);
    const fromRoot = relative(rootPath, actualPath);
    if (
      !info.isFile() ||
      fromRoot === ".." ||
      fromRoot.startsWith(`..${sep}`) ||
      isAbsolute(fromRoot)
    ) {
      return null;
    }

    return actualPath;
  } catch (error) {
    if (
      error.code === "ENOENT" ||
      error.code === "ENOTDIR" ||
      error.code === "ELOOP"
    ) {
      return null;
    }
    throw error;
  }
}
