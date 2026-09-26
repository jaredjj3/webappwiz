import { Rules } from "@webappwiz/scry";
import { ConsoleLogger, color } from "webappwiz/log";
import { table } from "../table";
import { type RulesProjectOptions, shipped } from "./rule-set";

/**
 * Every rule there is: the project's own, validated, and the shipped ones it
 * could add, one row each. A rule the project holds a copy of shows the
 * version it came from beside the one that ships, so a stale copy is visible.
 */
export async function list(opts: RulesProjectOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	// Loading validates: a rule in the project that would not check is an
	// error here, not a row.
	const local = await Rules.load(opts.dir, { fs: opts.fs });
	const offer = shipped(opts);
	const ids = new Set([...local.all.map((rule) => rule.id), ...offer.keys()]);
	const rows = [
		[
			"rule",
			"level",
			"effort",
			"recommended",
			"files",
			"ships",
			"installed",
			"description",
		].map(color.dim),
	];
	let stale = 0;
	for (const id of [...ids].toSorted()) {
		const rule = local.get(id) ?? offer.get(id);
		if (!rule) {
			continue;
		}
		const ships = offer.get(id)?.version ?? null;
		const installed = local.get(id)
			? (local.get(id)?.version ?? "local")
			: null;
		if (ships !== null && installed !== null && ships !== installed) {
			stale++;
		}
		rows.push([
			id,
			rule.level,
			rule.effort,
			// what the catalog says, since that is what --recommended reads: a
			// rule the project wrote is nobody's recommendation
			offer.get(id)?.recommended ? "yes" : "-",
			rule.files,
			ships ?? "-",
			installed ?? "-",
			rule.description,
		]);
	}
	const lines = table(rows);
	if (stale > 0) {
		lines.push("", `${stale} out of date: run \`scry update\``);
	}
	log.info(lines.join("\n"));
}
