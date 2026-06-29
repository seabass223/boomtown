import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAzureDeployConfig } from "./azure-paths.mjs";

const appName = "Boomtown";
const { basePath, container, virtualDir } = getAzureDeployConfig();
const nodeCli = process.execPath;

await run({
  command: nodeCli,
  args: ["./node_modules/typescript/bin/tsc"],
});

await run({
  command: nodeCli,
  args: ["./node_modules/vite/bin/vite.js", "build"],
  env: {
    ...process.env,
    VITE_BASE_PATH: basePath,
  },
});

await writeFile(
  new URL("../dist/build-info.json", import.meta.url),
  JSON.stringify(
    {
      name: appName,
      builtAt: new Date().toISOString(),
      output: "dist",
      basePath,
      container,
      virtualDir,
    },
    null,
    2,
  ),
);

console.log(`${appName} production build written to ${join(process.cwd(), "dist")} with base path ${basePath}`);

function run({ command, args, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}
