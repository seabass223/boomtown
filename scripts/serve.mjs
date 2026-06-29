import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { getAzureDeployConfig } from "./azure-paths.mjs";

const root = normalize(new URL("../dist/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const port = Number(process.argv[2]) || 8000;
const { basePath } = getAzureDeployConfig();
const mountPath = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
const mimeTypes = {
  ".css": "text/css",
  ".glb": "model/gltf-binary",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

createServer((request, response) => {
  const requestedPath = decodeURIComponent((request.url ?? "/").split("?")[0]);

  if (requestedPath === "/") {
    response.writeHead(302, { Location: `${mountPath}/` }).end();
    return;
  }

  if (!requestedPath.startsWith(`${mountPath}/`)) {
    response.writeHead(404).end("Not found");
    return;
  }

  const relativePath = requestedPath === `${mountPath}/` ? "index.html" : requestedPath.slice(mountPath.length + 1);
  const filePath = normalize(join(root, relativePath));

  if (!filePath.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    if (!statSync(filePath).isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Boomtown build running at http://127.0.0.1:${port}${mountPath}/`);
});
