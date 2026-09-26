import { ConsoleLogger } from "webappwiz/log";
import { Documents } from "../documents";
import {
	offered,
	RULES,
	type RulesProjectOptions,
	shipped,
	warnOfScripts,
} from "./rule-set";

export interface AddOptions extends RulesProjectOptions {
	/** The rule to install, as `scry list` names it; empty with `recommended`. */
	rule: string;
	/** Install every rule on offer that recommends itself, instead of one. */
	recommended?: boolean;
}

/**
 * Copies shipped rules into the project, where they run and can be edited:
 * the one named, or every recommended one.
 *
 * With `--recommended` there is no rule id to sit in the first positional, so
 * a lone positional there is the directory: `scry add ./project
 * --recommended`. The flag goes last, as `webappwiz/cmd` asks, since a bare
 * flag before an argument takes it as its value.
 */
export async function add(opts: AddOptions): Promise<void> {
	const rules = offered(opts);
	const documents = new Documents(rules, RULES, opts);
	if (!opts.recommended) {
		if (opts.rule === "") {
			throw new Error("scry add needs a rule id, or --recommended");
		}
		warnOfScripts(await documents.add(opts.rule, opts.dir), opts);
		return;
	}
	if (rules[opts.rule] !== undefined) {
		throw new Error(
			`scry add takes a rule id or --recommended, not both: drop ${opts.rule}`,
		);
	}
	const dir = opts.rule === "" ? opts.dir : opts.rule;
	const ids = [...shipped(opts).values()]
		.filter((rule) => rule.recommended)
		.map((rule) => rule.id);
	for (const id of ids) {
		warnOfScripts(await documents.add(id, dir), opts);
	}
	if (ids.length === 0) {
		(opts.log ?? new ConsoleLogger()).info("no rules recommend themselves");
	}
}
