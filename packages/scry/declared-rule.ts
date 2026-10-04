import { z } from "zod";
import { CHECK_FILE } from "./layout";
import {
	LEVELS,
	type Level,
	type Rule,
	type RuleClass,
	type Tools,
} from "./rule";
import { RuleError } from "./rule-error";

/** Where a rule's class came from, for the errors it can raise. */
export interface DeclareOptions {
	/** How errors name the class's file; `rule.ts` when not given. */
	path?: string;
}

const SETTINGS = z.object({
	description: z
		.string({
			error: (issue) =>
				issue.input === undefined
					? "missing: one line saying what the rule expects"
					: "expected a string",
		})
		.min(1, { error: "expected a line saying what the rule expects" }),
	files: z.optional(z.string({ error: "expected a glob" })),
	level: z.optional(
		z.enum(LEVELS, { error: `expected one of ${LEVELS.join(", ")}` }),
	),
	threshold: z.optional(
		z
			.number({ error: "expected a number from 0 to 1" })
			.min(0, { error: "expected a number from 0 to 1" })
			.max(1, { error: "expected a number from 0 to 1" }),
	),
	recommended: z.optional(z.boolean({ error: "expected true or false" })),
});

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * A rule as its class declares it: its id, the settings its static members
 * say, with the defaults filled in, and the class that checks.
 *
 * Only `of` makes one, so holding a `DeclaredRule` means the class passed:
 * its id is kebab case, it says what it expects, and every setting it gives
 * is one a check can use.
 */
export class DeclaredRule {
	private constructor(
		/** Kebab case, its directory's name; what a report cites. */
		readonly id: string,
		/** One line for a listing, and for planning who reads the rule. */
		readonly description: string,
		/** Glob choosing which files this rule applies to. */
		readonly files: string,
		/** How loudly it reports. */
		readonly level: Level,
		/** How sure a finding has to be to be reported, from 0 to 1. */
		readonly threshold: number,
		/** Whether a catalog offers it as one to start with. */
		readonly recommended: boolean,
		private type: RuleClass,
	) {}

	/**
	 * The rule `exported` declares, `exported` being what its `rule.ts`
	 * default-exports; or throws a `RuleError` saying what is wrong.
	 */
	static of(
		id: string,
		exported: unknown,
		opts: DeclareOptions = {},
	): DeclaredRule {
		const path = opts.path ?? CHECK_FILE;
		if (!ID.test(id)) {
			throw new RuleError(`${path}: "${id}" is not kebab case`);
		}
		if (typeof exported !== "function") {
			throw new RuleError(`${path}: does not default-export the rule's class`);
		}
		const type = exported as RuleClass;
		const parsed = SETTINGS.safeParse({
			description: type.description,
			files: type.files,
			level: type.level,
			threshold: type.threshold,
			recommended: type.recommended,
		});
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			throw new RuleError(
				`${path}: static ${String(issue?.path[0] ?? "settings")}: ${issue?.message ?? "invalid"}`,
			);
		}
		const settings = parsed.data;
		return new DeclaredRule(
			id,
			settings.description,
			settings.files ?? "**/*",
			settings.level ?? "error",
			settings.threshold ?? 0.7,
			settings.recommended ?? false,
			type,
		);
	}

	/** The rule's check, built with the tools. */
	build(tools: Tools): Rule {
		return new this.type(tools);
	}
}
