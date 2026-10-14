import { type ProjectOptions, project } from "./skill";

export interface AddOptions extends ProjectOptions {
	/** The skill to install, as `skills list` names it. */
	skill: string;
}

/**
 * Adds a skill a project does not have yet, from the release's tag through
 * `bunx skills add`, or throws naming what there is.
 */
export async function add(opts: AddOptions): Promise<void> {
	const { skills, version, shipped } = project(opts);
	if (!shipped.includes(opts.skill)) {
		throw new Error(
			`no such skill: ${opts.skill} (have ${shipped.toSorted().join(", ")})`,
		);
	}
	await skills.add([opts.skill], version);
}
