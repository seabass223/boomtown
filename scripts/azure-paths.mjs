const defaultContainer = "summer-into-ai";
const defaultVirtualDir = "boomtown";

export function getAzureDeployConfig(env = process.env) {
  const container = trimSlashes(env.AZURE_STORAGE_CONTAINER ?? defaultContainer);
  const virtualDir = trimSlashes(env.VIRTUAL_DIR ?? defaultVirtualDir);
  const basePath = normalizeBasePath(
    env.VITE_BASE_PATH ?? [container, virtualDir].filter(Boolean).join("/"),
  );

  return {
    container,
    virtualDir,
    basePath,
  };
}

function trimSlashes(value) {
  return value.replace(/^\/+|\/+$/g, "");
}

function normalizeBasePath(value) {
  if (!value) return "/";

  const trimmed = trimSlashes(value);
  return trimmed ? `/${trimmed}/` : "/";
}
