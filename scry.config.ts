import type { ScryConfig } from "@webappwiz/scry/config";

// the skills under .agents are vendored, not this repository's to fix
export default {
	exclude: [".agents/**"],
	budgets: [{ som: 5_000_000, llm: "nothing", per: "day" }],
} satisfies ScryConfig;
