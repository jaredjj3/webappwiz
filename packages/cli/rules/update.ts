import { ConsoleLogger } from "webappwiz/log";
import { Documents } from "../documents";
import { offered, RULES, type RulesProjectOptions } from "./rule-set";

/**
 * Refreshes the shipped rules a project has copies of, and leaves the rules
 * it wrote itself alone. Never adds one: a rule someone chose not to install
 * should not arrive by way of an update.
 */
export async function update(opts: RulesProjectOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const documents = new Documents(offered(opts), RULES, opts);
	const refreshed = await documents.update(opts.dir);
	if (refreshed.length === 0) {
		log.info(`no webappwiz rules in ${opts.dir}: add one with \`rules add\``);
	}
}
