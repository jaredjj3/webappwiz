import { dirname } from "node:path";
import { ConsoleLogger } from "webappwiz/log";
import { Markdown } from "webappwiz/md";
import { NodeFs } from "webappwiz/system";
import { Documents } from "../documents";
import { bundled, type ProjectOptions, retired, SKILLS } from "./skill";

/**
 * Refreshes the skills a project already has. Which skills those are is the
 * project's business, so this never adds one: a skill someone chose not to
 * install should not arrive by way of an update. The one exception is a skill
 * that was renamed, which the project did choose: our copy under the old name
 * is removed and the new one installed in its place.
 */
export async function update(opts: ProjectOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const documents = new Documents(opts.skills ?? bundled, SKILLS, {
		log,
		fs,
	});
	const { names } = await documents.update(opts.dir);
	// after the refresh, so a skill installed in place of a retired one is
	// written once
	let renamed = 0;
	for (const [old, { now, description, migrate }] of Object.entries(
		opts.retired ?? retired,
	)) {
		const path = documents.path(opts.dir, old);
		const text = await fs.read(path).catch((): null => null); // not installed
		const shipped = Markdown.parse(text ?? "").fields.description ?? "";
		if (text === null || !description.test(shipped)) {
			continue;
		}
		await fs.rm(dirname(path), { recursive: true, force: true });
		log.info(`removed ${dirname(path)}: ${old} is now ${now}`);
		await documents.add(now, opts.dir);
		if (migrate !== undefined) {
			log.info(`${old} is now ${now}: ${migrate}`);
		}
		renamed++;
	}
	if (names.length + renamed === 0) {
		log.info(`no webappwiz skills in ${opts.dir}: add one with \`skills add\``);
	}
}
