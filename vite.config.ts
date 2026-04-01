import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function normalizeBasePath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "/";
  const withLeadingSlash = trimmed.charAt(0) === "/" ? trimmed : `/${trimmed}`;
  return withLeadingSlash.slice(-1) === "/" ? withLeadingSlash : `${withLeadingSlash}/`;
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, ".", "");
  const base = env.VITE_BASE_PATH
    ? normalizeBasePath(env.VITE_BASE_PATH)
    : command === "build"
      ? "/Monopoly/"
      : "/";

  return {
    plugins: [react()],
    base
  };
});
