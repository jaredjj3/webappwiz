import { ConsoleLogger } from "webappwiz/log";
import { NodeFs } from "webappwiz/system";
import { RULES, type RulesProjectOptions } from "./rule-set";

export interface RemoveOptions extends RulesProjectOptions {
	/** The rule to delete, as `scry list` names it. */
	rule: string;
}

/** Deletes a rule from the project: its directory, scripts and all. */
export async function remove(opts: RemoveOptions): Promise<void> {
	const fs = opts.fs ?? new NodeFs();
	const dir = `${RULES.root}/${opts.rule}`;
	if (!(await fs.exists(`${opts.dir}/${dir}/${RULES.file}`))) {
		throw new Error(`no rule ${opts.rule} in ${opts.dir}/${RULES.root}`);
	}
	await fs.rm(`${opts.dir}/${dir}`, { recursive: true, force: true });
	(opts.log ?? new ConsoleLogger()).info(`removed ${dir}`);
}
