import { defineConfig } from "@webappwiz/scry/config";

// the skills under .agents are vendored, not this repository's to fix
export default defineConfig({ exclude: [".agents/**"], budgets: "unlimited" });
