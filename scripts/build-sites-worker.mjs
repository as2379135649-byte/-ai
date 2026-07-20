import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const distDirectory = path.resolve('dist');
const outputDirectory = path.resolve('dist/server');
const outputFile = path.join(outputDirectory, 'index.js');

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
};

async function collectFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = {};

  for (const entry of entries) {
    if (entry.name === 'server' || entry.name === '.openai') continue;
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      Object.assign(files, await collectFiles(absolutePath, relativePath));
      continue;
    }

    const contents = await readFile(absolutePath);
    files[`/${relativePath}`] = {
      body: contents.toString('base64'),
      contentType: mimeTypes[path.extname(entry.name).toLowerCase()] || 'application/octet-stream',
    };
  }

  return files;
}

const embeddedFiles = await collectFiles(distDirectory);

const workerSource = `const API_PREFIX = "/api/";
const FILES = ${JSON.stringify(embeddedFiles)};

function jsonResponse(body, status = 404) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function fileResponse(file, pathname) {
  const cacheControl = pathname === "/index.html"
    ? "no-cache"
    : "public, max-age=31536000, immutable";
  return new Response(decodeBase64(file.body), {
    status: 200,
    headers: {
      "content-type": file.contentType,
      "cache-control": cacheControl,
    },
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith(API_PREFIX)) {
      return jsonResponse({
        error: "此发布版本不使用发布电脑上的 API；请在页面中连接使用者自己的接口。",
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const requestedFile = FILES[url.pathname];
    const file = requestedFile || FILES["/index.html"];
    if (!file) return new Response("Not Found", { status: 404 });

    if (request.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: { "content-type": file.contentType },
      });
    }

    return fileResponse(file, requestedFile ? url.pathname : "/index.html");
  },
};
`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, workerSource, 'utf8');
