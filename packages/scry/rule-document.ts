import { Markdown } from "webappwiz/md";
import { z } from "zod";
import { RuleError } from "./rule-error";

/** How loudly a violation reports. */
export type Level = "error" | "warning";
export const LEVELS = ["error", "warning"] as const;

/** Where a document came from, for the errors it can raise. */
export interface ParseOptions {
	/** How errors name the document; `RULE.md` when not given. */
	path?: string;
	/** The directory the document sits in, which its `name` must match. */
	id?: string;
}

const FRONTMATTER = z.object({
	name: z.string(),
	description: z.string(),
	files: z.optional(z.string()),
	level: z.optional(
		z.enum(LEVELS, { error: `expected one of ${LEVELS.join(", ")}` }),
	),
	// frontmatter arrives as strings, so the two spellings of a boolean are an
	// enum here rather than z.boolean()
	recommended: z.optional(
		z.enum(["true", "false"], { error: "expected one of true, false" }),
	),
	threshold: z.optional(
		z
			.string()
			.transform(Number)
			.refine((value) => value >= 0 && value <= 1, {
				error: "expected a number from 0 to 1",
			}),
	),
	version: z.optional(z.string()),
});

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * A rule's `RULE.md`, parsed: what the rule expects and which files it reads,
 * for a listing and a report, and the prose a person or agent reads before
 * fixing what it found. The check itself is the rule's `rule.ts`.
 *
 * Only `parse` makes one, so holding a `RuleDocument` means the frontmatter
 * passed: it has a name matching its directory and a description. The body
 * is the rule author's, the way a skill's is, and nothing here reads it.
 */
export class RuleDocument {
	private constructor(
		/** Kebab case; what a report cites. */
		readonly id: string,
		/** One line for a listing, and for planning who reads the rule. */
		readonly description: string,
		/** Glob choosing which files this rule applies to. */
		readonly files: string,
		/** How loudly it reports; `error` when the frontmatter does not say. */
		readonly level: Level,
		/**
		 * How sure a check has to be that a file breaks the rule before it is
		 * reported, from 0 to 1; 0.7 when the frontmatter does not say. A
		 * finding code decides is sure, so only a decider's are ever under it.
		 */
		readonly threshold: number,
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
	static parse(text: string, opts: ParseOptions = {}): RuleDocument {
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
		if (opts.id !== undefined && opts.id !== front.name) {
			throw fail(
				lineOf(text, "name"),
				`name: "${front.name}" does not match its directory "${opts.id}"`,
			);
		}
		return new RuleDocument(
			front.name,
			front.description,
			front.files ?? "**/*",
			front.level ?? "error",
			front.threshold ?? 0.7,
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
