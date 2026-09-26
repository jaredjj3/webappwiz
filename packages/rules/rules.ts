import { type Fs, NodeFs } from "webappwiz/system";
import { RULE_FILE, RULES_ROOT } from "./layout";
import { Rule, RuleError } from "./rule";

/** What `load` reads through; the real filesystem by default. */
export interface LoadOptions {
	fs?: Fs;
}

/**
 * The rules a project has: every `RULE.md` under `.wiz/rules`, validated, in
 * id order.
 */
export class Rules {
	private constructor(readonly all: readonly Rule[]) {}

	/**
	 * Every rule under `<dir>/.wiz/rules`. A directory there without a
	 * `RULE.md`, or one whose document fails to parse, is an error, and every
	 * such problem is reported at once rather than the first one found.
	 */
	static async load(dir: string, opts: LoadOptions = {}): Promise<Rules> {
		const fs = opts.fs ?? new NodeFs();
		// no such directory is just "no rules", and the message for that
		// belongs to the caller, who knows what it was about to do with them
		const ids = await fs
			.readdir(`${dir}/${RULES_ROOT}`)
			.catch((): string[] => []);
		const rules: Rule[] = [];
		const problems: string[] = [];
		for (const id of ids.toSorted()) {
			if (id.startsWith(".")) {
				continue;
			}
			const path = `${RULES_ROOT}/${id}/${RULE_FILE}`;
			const text = await fs.read(`${dir}/${path}`).catch((): null => null);
			if (text === null) {
				problems.push(`${path}: missing`);
				continue;
			}
			try {
				rules.push(Rule.parse(text, { path, id }));
			} catch (error) {
				problems.push(error instanceof RuleError ? error.message : `${error}`);
			}
		}
		if (problems.length > 0) {
			throw new RuleError(problems.join("\n"));
		}
		return new Rules(rules);
	}

	get(id: string): Rule | undefined {
		return this.all.find((rule) => rule.id === id);
	}
}
