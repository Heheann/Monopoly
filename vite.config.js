import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
function normalizeBasePath(input) {
    var trimmed = input.trim();
    if (!trimmed)
        return "/";
    var withLeadingSlash = trimmed.charAt(0) === "/" ? trimmed : "/".concat(trimmed);
    return withLeadingSlash.slice(-1) === "/" ? withLeadingSlash : "".concat(withLeadingSlash, "/");
}
export default defineConfig(function (_a) {
    var command = _a.command, mode = _a.mode;
    var env = loadEnv(mode, ".", "");
    var base = env.VITE_BASE_PATH
        ? normalizeBasePath(env.VITE_BASE_PATH)
        : command === "build"
            ? "/Monopoly/"
            : "/";
    return {
        plugins: [react()],
        base: base
    };
});
