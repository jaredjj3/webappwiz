import { Markdown } from "webappwiz/md";
import type { Glob } from "webappwiz/system";
import { t } from "webappwiz/t";

/** How loudly a violation reports. */
export type Level = "error" | "warning";
export const LEVELS = ["error", "warning"] as const;

/**
 * How hard the rule is to judge, so the parent agent can pick a model for the
 * subagent: `low` when a grep or a count settles it, `high` when it takes
 * design judgment across a file, `medium` in between.
 */
export type Complexity = "low" | "medium" | "high";
export const COMPLEXITIES = ["low", "medium", "high"] as const;

/** A `RULE.md` that does not have the shape a rule needs: `path:line: why`. */
export class RuleError extends Error {}

/** Where a document came from, for the errors it can raise. */
export interface ParseOptions {
	/** How errors name the document; `RULE.md` when not given. */
	path?: string;
	/** The directory the document sits in, which its `name` must match. */
	id?: string;
}

const FRONTMATTER = t.object({
	name: t.string(),
	description: t.string(),
	files: t.optional(t.string()),
	level: t.enum(LEVELS),
	complexity: t.enum(COMPLEXITIES),
	// frontmatter arrives as strings, so the two spellings of a boolean are an
	// enum here rather than t.boolean()
	recommended: t.optional(t.enum(["true", "false"])),
	version: t.optional(t.string()),
});

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * One rule, parsed out of its `RULE.md`: the frontmatter a listing and a plan
 * read, and the document a subagent is told to read for itself.
 *
 * Only `parse` makes one, so holding a `Rule` means the frontmatter passed:
 * every field a plan needs is there. The body is the rule author's, the way a
 * skill's is, and nothing here reads it.
 */
export class Rule {
	private constructor(
		/** Kebab case; what a report cites and what a block is headed with. */
		readonly id: string,
		/** One line for a listing; a subagent reads the document instead. */
		readonly description: string,
		/** Glob choosing which files this rule applies to. */
		readonly files: string,
		readonly level: Level,
		readonly complexity: Complexity,
		/**
		 * Whether a catalog offers this rule as one to start with, which is what
		 * `rules add --recommended` copies in. A project's own rule says nothing
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
			const key = parsed.error.path[0] ?? "frontmatter";
			throw fail(lineOf(text, key), `${key}: ${parsed.error.reason}`);
		}
		const front = parsed.data;
		if (!NAME.test(front.name)) {
			throw fail(
				lineOf(text, "name"),
				`name: "${front.name}" is not kebab case`,
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
			front.level,
			front.complexity,
			front.recommended === "true",
			front.version ?? null,
			text,
		);
	}

	/** Whether this rule applies to a file, by the path a glob is written for. */
	matches(path: string, glob: Glob): boolean {
		return glob.matches(this.files, path);
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
