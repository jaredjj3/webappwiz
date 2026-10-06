/**
 * A decision model, by the name its provider gives it: `clef` or
 * `clef-flash` on Cloudflare Workers AI, which read `CLOUDFLARE_ACCOUNT_ID`
 * and `CLOUDFLARE_API_TOKEN`, or a Jev on TypeSafe, like `jev-latest`, which
 * reads `TYPESAFE_API_KEY`.
 */
export type Model = "clef" | "clef-flash" | `jev-${string}`;

/**
 * A language model, by the name Anthropic gives it, like
 * `claude-sonnet-5-5`, which reads `ANTHROPIC_API_KEY`.
 */
export type LlmModel = `claude-${string}`;

/** How much a check spends to be right, which picks the models it asks. */
export type Effort = "low" | "medium" | "high";
export const EFFORTS = ["low", "medium", "high"] as const;

/** The models a check at one effort asks. */
export interface Models {
	/** What a rule's `decider` asks. */
	decider: Model;
	/** What a rule's `llm` asks. */
	llm: LlmModel;
}

/** The roles a model plays for a rule, each with a budget of its own. */
export type Role = keyof Models;
export const ROLES = ["decider", "llm"] as const;

/**
 * What a role may spend: input tokens, `"nothing"`, which asks it no
 * question, or `"unlimited"`.
 */
export type Spend = number | "nothing" | "unlimited";

/**
 * A calendar day, week (from Monday) or month in local time, or a single
 * run of a check or an eval.
 */
export type Period = "check" | "day" | "week" | "month";

/** One limit on what scry spends, over one window. */
export interface Budget {
	decider?: Spend;
	llm?: Spend;
	/** The calendar window the limit holds over. A number needs it or `within`. */
	per?: Period;
	/** A rolling window ending now, in hours, days or weeks, like `"7d"`. */
	within?: `${number}${"h" | "d" | "w"}`;
}

/** How `wiz scry` runs. */
export interface ScryConfig {
	/**
	 * What a check or an eval may spend, which every one needs declared. `"nothing"`
	 * asks no model, `"unlimited"` caps neither; a list holds every limit in
	 * it at once, and a role no entry names spends nothing. The last config
	 * that sets it wins whole. Spending is kept per user on the device.
	 *
	 * ```ts
	 * budgets: [
	 *   { decider: "unlimited", llm: 2_000_000, per: "month" },
	 *   { llm: 300_000, within: "7d" },
	 * ]
	 * ```
	 */
	budgets?: "nothing" | "unlimited" | Budget[];
	/** Which of `models` a check asks. `medium` when not set. */
	effort?: Effort;
	/**
	 * The models each effort asks, over the defaults: `clef-flash` and
	 * `claude-haiku-4-5` at low, `clef` and `claude-sonnet-5-5` at medium,
	 * `clef` and `claude-opus-5-5` at high. A layer sets only what it names,
	 * so `{ high: { llm: "claude-fable-5-1" } }` keeps the rest.
	 */
	models?: { [effort in Effort]?: Partial<Models> };
	/** How many requests to the model are out at once. 8 when not set. */
	jobs?: number;
	/**
	 * Globs, from the project root, of files no rule checks, like
	 * `vendor/**` for code the project copied in but does not own. The
	 * user's config adds to the project's.
	 */
	exclude?: string[];
}

/** Which credentials a project keeps, and where. */
export interface CredentialsConfig {
	/**
	 * What the operating system's store keeps the project's under, as
	 * `webappwiz:<project>`. The repository's directory name when not set,
	 * which every git worktree of it shares. The user's config wins over the
	 * project's.
	 */
	project?: string;
	/**
	 * The credentials the project's own code needs, by environment variable
	 * name, with what each is for, so `creds list` shows one even before
	 * anyone keeps it. Optional: `creds add` takes any name, and what the
	 * stores keep is listed anyway. The ones wiz uses itself are always there.
	 */
	names?: Record<string, string>;
}

/** What `.wiz/config.ts` and the user's own config file hold. */
export interface Config {
	scry?: ScryConfig;
	credentials?: CredentialsConfig;
}

/**
 * Identity, for the types. `export default defineConfig({ ... })` in
 * `.wiz/config.ts` gets its keys checked and completed. A config somewhere
 * `@webappwiz/cli` is not installed, like the one in your home directory,
 * exports the same object without it.
 */
export function defineConfig(config: Config): Config {
	return config;
}
