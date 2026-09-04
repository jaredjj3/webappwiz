import { ConsoleLogger } from "webappwiz/log";
import { Documents } from "../documents";
import { bundled, type ProjectOptions, SKILLS } from "./skill";

/**
 * Refreshes the skills a project already has. Which skills those are is the
 * project's business, so this never adds one: a skill someone chose not to
 * install should not arrive by way of an update.
 */
export async function update(opts: ProjectOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const documents = new Documents(opts.skills ?? bundled, SKILLS, opts);
	const refreshed = await documents.update(opts.dir);
	if (refreshed.length === 0) {
		log.info(`no webappwiz skills in ${opts.dir}: add one with \`skills add\``);
	}
}
