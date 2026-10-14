import { Markdown } from "webappwiz/md";
import { type ProjectOptions, project, retired as RETIRED } from "./skill";

/**
 * Refreshes the skills a project already has, from the release's tag through
 * `bunx skills add`. Which skills those are is the project's business, so
 * this never adds one: a skill someone chose not to install should not arrive
 * by way of an update. The one exception is a skill that was renamed, which
 * the project did choose: our copy under the old name is removed and the new
 * one installed in its place.
 */
export async function update(opts: ProjectOptions): Promise<void> {
	const { skills, log, fs, version, shipped } = project(opts);
	const installed = await skills.installed();
	const wanted = shipped.filter((name) => installed.includes(name));
	for (const [old, { now, description }] of Object.entries(
		opts.retired ?? RETIRED,
	)) {
		const dir = `${opts.dir}/${skills.path(old)}`;
		const text = await fs.read(`${dir}/SKILL.md`).catch((): null => null); // not installed
		const said = Markdown.parse(text ?? "").fields.description ?? "";
		if (text === null || !description.test(said)) {
			continue;
		}
		await fs.rm(dir, { recursive: true, force: true });
		log.info(`removed ${dir}: ${old} is now ${now}`);
		if (!wanted.includes(now)) {
			wanted.push(now);
		}
	}
	if (wanted.length === 0) {
		log.info(`no webappwiz skills in ${opts.dir}: add one with \`skills add\``);
		return;
	}
	await skills.add(wanted, version);
}
