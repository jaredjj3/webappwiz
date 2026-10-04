import { RuleDocument } from "@webappwiz/scry";
import { catalog } from "@webappwiz/scry/catalog";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import type { Fs } from "webappwiz/system";
import type { Bundle, Layout } from "../documents";

/** Where a project keeps its rules: one directory per rule, holding `RULE.md`. */
export const RULES: Layout = {
	root: ".wiz/scry",
	file: "RULE.md",
	noun: "rule",
};

/** The project a rules command works on. */
export interface RulesProjectOptions {
	/** Its root: the directory holding `.wiz/scry`. */
	dir: string;
	log?: Logger;
	fs?: Fs;
	/** The rules on offer, id to bundle; the catalog by default. */
	rules?: Record<string, Bundle>;
}

/** The rules a command offers: what it was handed, else the catalog. */
export const offered = (opts: RulesProjectOptions): Record<string, Bundle> =>
	opts.rules ?? catalog;

/** Every rule on offer, its `RULE.md` parsed, in id order. */
export const shipped = (opts: RulesProjectOptions): Map<string, RuleDocument> =>
	new Map(
		Object.entries(offered(opts))
			.toSorted(([left], [right]) => left.localeCompare(right))
			.map(([id, bundle]) => [
				id,
				RuleDocument.parse(bundle[RULES.file] ?? "", { id }),
			]),
	);

/**
 * Says which of the files a command just changed are code a check runs: a
 * rule's `rule.ts` and what it imports run on every `wiz scry`, so they
 * deserve the same reading before they run as any code an agent is about to
 * execute. `changed` is under the project root.
 */
export function warnOfCode(changed: string[], opts: RulesProjectOptions): void {
	const log = opts.log ?? new ConsoleLogger();
	const code = changed.filter((path) => {
		const [, ...inside] = path.slice(RULES.root.length + 1).split("/");
		return (
			/\.[cm]?[jt]sx?$/.test(path) &&
			!/\.test\.[cm]?[jt]sx?$/.test(path) &&
			inside[0] !== "evals" &&
			inside[0] !== "fixtures"
		);
	});
	for (const path of code) {
		log.info(
			`⚠️ ${path} is code that runs on every \`wiz scry\`: read it before the next one`,
		);
	}
}
