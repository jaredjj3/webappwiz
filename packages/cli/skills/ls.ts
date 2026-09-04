import { ConsoleLogger, color } from "webappwiz/log";
import { Documents, versionOf } from "../documents";
import { table } from "../table";
import { bundled, type ProjectOptions, SKILLS } from "./skill";

/**
 * What there is to install, and what the project has of it. The version a
 * project holds is the only thing `add` and `update` cannot tell it, so that
 * is what this is for.
 */
export async function ls(opts: ProjectOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const documents = new Documents(opts.skills ?? bundled, SKILLS, opts);
	const rows = [["skill", "ships", "installed"].map(color.dim)];
	let stale = 0;
	for (const [name, doc] of documents.available()) {
		const ships = versionOf(doc) ?? "?";
		const installed = await documents.installedVersion(opts.dir, name);
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
