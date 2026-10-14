import type { ScryConfig } from "@webappwiz/scry/config";

// the skills under .agents are vendored, not this repository's to fix
export default {
	exclude: [".agents/**"],
	budgets: "unlimited",
} satisfies ScryConfig;
