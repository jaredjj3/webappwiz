import { color } from "webappwiz/log";
import { table } from "../table";
import { type ProjectOptions, project } from "./skill";

/**
 * What there is to install, and what the project has of it. The release a
 * project's copy came from is the only thing `add` and `update` cannot tell
 * it, so that is what this is for. A copy linked to one kept by hand is
 * marked so, and never counted out of date, since no update touches it.
 */
export async function list(opts: ProjectOptions): Promise<void> {
	const { skills, log, version, shipped } = project(opts);
	const rows = [["skill", "ships", "installed"].map(color.dim)];
	let stale = 0;
	for (const name of shipped.toSorted()) {
		const installed = await skills.version(name);
		const linked = await skills.linked(name);
		if (installed !== null && installed !== version && !linked) {
			stale++;
		}
		rows.push([
			name,
			version,
			`${installed ?? "-"}${linked ? " (linked)" : ""}`,
		]);
	}

	const lines = table(rows);
	if (stale > 0) {
		lines.push("", `${stale} out of date: run \`skills update\``);
	}
	log.info(lines.join("\n"));
}
