import type { ScryConfig } from "@webappwiz/scry/config";

// the skills under .agents are vendored, not this repository's to fix
export default {
	exclude: [".agents/**"],
	// llm is left out of budgets, so it spends nothing
	budgets: [{ som: 5_000_000, per: "day" }],
} satisfies ScryConfig;
