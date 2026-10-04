import { Rules } from "@webappwiz/scry";
import { ConsoleLogger, color } from "webappwiz/log";
import { NodeFs } from "webappwiz/system";
import { type Bundle, Documents, versionOf } from "../documents";
import { table } from "../table";
import { offered, RULES, type RulesProjectOptions, shipped } from "./rule-set";

/**
 * Every rule there is: the project's own, validated, and the shipped ones it
 * could add, one row each, described by its class. A rule the project holds a
 * copy of shows the version its `RULE.md` came from beside the one that
 * ships, so a stale copy is visible.
 */
export async function list(opts: RulesProjectOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	// Loading validates: a rule in the project that would not check is an
	// error here, not a row.
	const local = await Rules.load(opts.dir, { fs });
	const offer = shipped(opts);
	const bundles = offered(opts);
	const documents = new Documents(bundles, RULES, opts);
	const ids = new Set([...local.all.map((rule) => rule.id), ...offer.keys()]);
	const rows = [
		[
			"rule",
			"level",
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
		const ships = shippedVersion(bundles[id]);
		const installed = local.get(id)
			? ((await documents.installedVersion(opts.dir, id)) ?? "local")
			: null;
		if (ships !== null && installed !== null && ships !== installed) {
			stale++;
		}
		rows.push([
			id,
			rule.level,
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

/** The version a shipped rule's `RULE.md` is stamped with; null when not shipped. */
function shippedVersion(bundle: Bundle | undefined): string | null {
	const doc = bundle?.[RULES.file];
	return doc === undefined ? null : versionOf(doc);
}
