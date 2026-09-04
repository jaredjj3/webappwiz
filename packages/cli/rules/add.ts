import { Documents } from "../documents";
import { offered, RULES, type RulesProjectOptions } from "./rule-set";

export interface AddOptions extends RulesProjectOptions {
	/** The rule to install, as `rules ls` names it. */
	rule: string;
}

/** Copies a shipped rule into the project, where it runs and can be edited. */
export async function add(opts: AddOptions): Promise<void> {
	const documents = new Documents(offered(opts), RULES, opts);
	await documents.add(opts.rule, opts.dir);
}
