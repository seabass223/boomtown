import { defineConfig } from "vite";

export default defineConfig(() => ({
  base: normalizeBasePath(process.env.VITE_BASE_PATH),
}));

function normalizeBasePath(value?: string): string {
  if (!value) return "/";

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}
