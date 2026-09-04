import { Documents } from "../documents";
import { bundled, type ProjectOptions, SKILLS } from "./skill";

export interface AddOptions extends ProjectOptions {
	/** The skill to install, as `skills list` names it. */
	skill: string;
}

/** Adds a skill a project does not have yet. */
export async function add(opts: AddOptions): Promise<void> {
	const documents = new Documents(opts.skills ?? bundled, SKILLS, opts);
	await documents.add(opts.skill, opts.dir);
}
