import { Markdown } from "webappwiz/md";
import { z } from "zod";

/** How loudly a violation reports. */
export type Level = "error" | "warning";
export const LEVELS = ["error", "warning"] as const;

/**
 * How much judgment the rule takes, which picks the agent that checks it:
 * `none` when its scripts decide it alone and no agent runs, `low` for a grep
 * or a count, `high` for design judgment across a file, `medium` between.
 */
export type Effort = "none" | "low" | "medium" | "high";
export const EFFORTS = ["none", "low", "medium", "high"] as const;

/** A `RULE.md` that does not have the shape a rule needs: `path:line: why`. */
export class RuleError extends Error {}

/** Where a document came from, for the errors it can raise. */
export interface ParseOptions {
	/** How errors name the document; `RULE.md` when not given. */
	path?: string;
	/** The directory the document sits in, which its `name` must match. */
	id?: string;
	/** Its scripts, by path from the project root. */
	scripts?: string[];
}

const FRONTMATTER = z.object({
	name: z.string(),
	description: z.string(),
	files: z.optional(z.string()),
	level: z.optional(
		z.enum(LEVELS, { error: `expected one of ${LEVELS.join(", ")}` }),
	),
	effort: z.optional(
		z.enum(EFFORTS, { error: `expected one of ${EFFORTS.join(", ")}` }),
	),
	// frontmatter arrives as strings, so the two spellings of a boolean are an
	// enum here rather than z.boolean()
	recommended: z.optional(
		z.enum(["true", "false"], { error: "expected one of true, false" }),
	),
	version: z.optional(z.string()),
});

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * One rule, parsed out of its `RULE.md`: the frontmatter a listing reads, and
 * the document an agent reads for itself.
 *
 * Only `parse` makes one, so holding a `Rule` means the frontmatter passed:
 * it has a name matching its directory and a description. The body is the
 * rule author's, the way a skill's is, and nothing here reads it.
 */
export class Rule {
	private constructor(
		/** Kebab case; what a report cites. */
		readonly id: string,
		/** One line for a listing, and for planning who reads the rule. */
		readonly description: string,
		/** Glob choosing which files this rule applies to. */
		readonly files: string,
		/** How loudly it reports; `error` when the frontmatter does not say. */
		readonly level: Level,
		/** Which agent checks it; `medium` when the frontmatter does not say. */
		readonly effort: Effort,
		/** Its scripts, by path from the project root, in name order. */
		readonly scripts: readonly string[],
		/**
		 * Whether a catalog offers this rule as one to start with, which is what
		 * `scry add --recommended` copies in. A project's own rule says nothing
		 * by saying nothing: it is already installed.
		 */
		readonly recommended: boolean,
		/** The release it shipped in; null for a rule written locally. */
		readonly version: string | null,
		/** The whole file, verbatim. */
		readonly document: string,
	) {}

	/** Parses a `RULE.md`, or throws a `RuleError` saying what is wrong. */
	static parse(text: string, opts: ParseOptions = {}): Rule {
		const path = opts.path ?? "RULE.md";
		const fail = (line: number, reason: string): RuleError =>
			new RuleError(`${path}:${line}: ${reason}`);
		const md = Markdown.parse(text);
		if (Object.keys(md.fields).length === 0) {
			throw fail(1, "no frontmatter: a rule opens with a --- block");
		}
		const parsed = FRONTMATTER.safeParse(md.fields);
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			const key = String(issue?.path[0] ?? "frontmatter");
			throw fail(
				lineOf(text, key),
				`${key}: ${issue?.message ?? "invalid frontmatter"}`,
			);
		}
		const front = parsed.data;
		if (!NAME.test(front.name)) {
			throw fail(
				lineOf(text, "name"),
				`name: "${front.name}" is not kebab case`,
			);
		}
		const effort = front.effort ?? "medium";
		const scripts = (opts.scripts ?? []).toSorted();
		if (effort === "none" && scripts.length === 0) {
			throw fail(
				lineOf(text, "effort"),
				"effort: none means its scripts decide it, and it has no scripts/",
			);
		}
		if (opts.id !== undefined && opts.id !== front.name) {
			throw fail(
				lineOf(text, "name"),
				`name: "${front.name}" does not match its directory "${opts.id}"`,
			);
		}
		return new Rule(
			front.name,
			front.description,
			front.files ?? "**/*",
			front.level ?? "error",
			effort,
			scripts,
			front.recommended === "true",
			front.version ?? null,
			text,
		);
	}
}

/**
 * The 1-based line `key:` sits on in the frontmatter, so an error points at
 * it. Line 1, the opening fence, when the key is not there.
 */
function lineOf(text: string, key: string): number {
	for (const [index, line] of text.split("\n").entries()) {
		if (line.startsWith(`${key}:`)) {
			return index + 1;
		}
		if (index > 0 && line === "---") {
			break;
		}
	}
	return 1;
}
