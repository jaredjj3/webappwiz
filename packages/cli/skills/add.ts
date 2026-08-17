import { ConsoleLogger } from "webappwiz/log";
import { NodeFs } from "webappwiz/system";
import { available, bundled, copy, type ProjectOptions } from "./skill";

export interface AddOptions extends ProjectOptions {
	/** The skill to install, as `skills ls` names it. */
	skill: string;
}

/** Adds a skill a project does not have yet. */
export async function add(opts: AddOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const skills = opts.skills ?? bundled;
	const doc = skills[opts.skill];
	if (doc === undefined) {
		const have = available(skills).map(([name]) => name);
		throw new Error(`no such skill: ${opts.skill} (have ${have.join(", ")})`);
	}
	await copy(opts.skill, doc, opts.dir, { log, fs });
}
