import type { Effort } from "@webappwiz/scry";

/**
 * A System One model (SOM), which answers a yes-or-no question with the
 * probability of yes, writing no text, by the name its provider gives it:
 * `clef` or `clef-flash` on Cloudflare Workers AI, which read
 * `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, or a Jev on TypeSafe,
 * like `jev-latest`, which reads `TYPESAFE_API_KEY`.
 */
export type SomModel = "clef" | "clef-flash" | `jev-${string}`;

/**
 * A large language model (LLM), which reasons in text before it answers,
 * by the name Anthropic gives it, like `claude-sonnet-5-5`, which reads
 * `ANTHROPIC_API_KEY`.
 */
export type LlmModel = `claude-${string}`;

/**
 * A model for each effort a rule can ask a question at, and the default's
 * for a question that names none, or names one left out.
 */
export type ByEffort<M> = { default: M } & { [effort in Effort]?: M };

/** The models a check asks: each role's, for each effort. */
export interface Models {
	/** The System One models a rule's `som` asks. */
	som: ByEffort<SomModel>;
	/** The large language models a rule's `llm` asks. */
	llm: ByEffort<LlmModel>;
}

/**
 * Models as a config names them, over the ones under them effort by
 * effort: a bare name asks it at every effort, and an effort left out keeps
 * the model under it.
 */
export interface ModelsConfig {
	/** The System One models a rule's `som` asks, like `"jev-latest"` or `{ low: "clef-flash" }`. */
	som?: SomModel | Partial<ByEffort<SomModel>>;
	/** The large language models a rule's `llm` asks, like `{ high: "claude-opus-5-5" }`. */
	llm?: LlmModel | Partial<ByEffort<LlmModel>>;
}

/**
 * The roles a model plays for a rule, each with a budget of its own: `som`,
 * a System One model, and `llm`, a large language model.
 */
export type Role = keyof Models;
export const ROLES = ["som", "llm"] as const;

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
	/** Input tokens the System One models may spend. */
	som?: Spend;
	/** Input tokens the large language models may spend. */
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
	 *   { som: "unlimited", llm: 2_000_000, per: "month" },
	 *   { llm: 300_000, within: "7d" },
	 * ]
	 * ```
	 */
	budgets?: "nothing" | "unlimited" | Budget[];
	/**
	 * The models a check asks, over the defaults: `clef` for the som,
	 * `clef-flash` at low effort, and `claude-sonnet-5-5` for the llm,
	 * `claude-haiku-4-5` at low and `claude-opus-5-5` at high. It lays each
	 * model it names over the one under it, so an effort it leaves out keeps
	 * its model, and a bare name replaces the role's at every effort.
	 *
	 * ```ts
	 * models: {
	 *   som: "jev-latest",
	 *   llm: { default: "claude-sonnet-5-5", high: "claude-fable-5-1" },
	 * }
	 * ```
	 */
	models?: ModelsConfig;
	/**
	 * Other models to check with, by name, which `--profile <name>` picks for
	 * one run: each lays the models it names over `models` the same way, like
	 * `{ "double-check": { som: "jev-latest" } }`. A config naming one
	 * the last named lays its models over that one's.
	 */
	profiles?: Record<string, ModelsConfig>;
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
