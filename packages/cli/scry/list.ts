import { CHECK_FILE, RULES_ROOT, Rules } from "@webappwiz/scry";
import { ConsoleLogger, color } from "webappwiz/log";
import { NodeFs } from "webappwiz/system";
import { table } from "../table";
import { offered, type RulesProjectOptions, shipped } from "./rule-set";

/**
 * Every rule there is: the project's own, validated, and the shipped ones it
 * could add, one row each. A rule the project holds a copy of shows the
 * version it came from beside the one that ships, so a stale copy is visible,
 * and a rule with no `rule.ts` yet says so, since it checks nothing.
 */
export async function list(opts: RulesProjectOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	// Loading validates: a rule in the project that would not check is an
	// error here, not a row.
	const local = await Rules.load(opts.dir, { fs });
	const offer = shipped(opts);
	const bundles = offered(opts);
	const ids = new Set([...local.all.map((rule) => rule.id), ...offer.keys()]);
	const rows = [
		[
			"rule",
			"level",
			"recommended",
			"check",
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
		// the copy the project runs, when it has one; else what would be copied
		const checked = local.get(id)
			? await fs.exists(`${opts.dir}/${RULES_ROOT}/${id}/${CHECK_FILE}`)
			: bundles[id]?.[CHECK_FILE] !== undefined;
		rows.push([
			id,
			rule.level,
			// what the catalog says, since that is what --recommended reads: a
			// rule the project wrote is nobody's recommendation
			offer.get(id)?.recommended ? "yes" : "-",
			checked ? "yes" : "no check yet",
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
