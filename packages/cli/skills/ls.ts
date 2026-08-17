import { ConsoleLogger, color } from "webappwiz/log";
import { NodeFs } from "webappwiz/system";
import { table } from "../table";
import { available, bundled, type ProjectOptions, versionOf } from "./skill";

/**
 * What there is to install, and what the project has of it. The version a
 * project holds is the only thing `add` and `update` cannot tell it, so that
 * is what this is for.
 */
export async function ls(opts: ProjectOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const skills = opts.skills ?? bundled;
	const rows = [["skill", "ships", "installed"].map(color.dim)];
	let stale = 0;
	for (const [name, doc] of available(skills)) {
		const ships = versionOf(doc) ?? "?";
		const installed = await fs
			.read(`${opts.dir}/.agents/skills/${name}/SKILL.md`)
			.then(versionOf)
			.catch((): null => null); // not installed, or not readable: same answer here
		if (installed !== null && installed !== ships) {
			stale++;
		}
		rows.push([name, ships, installed ?? "-"]);
	}

	const lines = table(rows);
	if (stale > 0) {
		lines.push("", `${stale} out of date: run \`skills update\``);
	}
	log.info(lines.join("\n"));
}
