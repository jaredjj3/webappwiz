import { catalog } from "@webappwiz/rules/catalog";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import type { Fs } from "webappwiz/system";
import type { Bundle, Layout } from "../documents";

/** Where a project keeps its rules: one directory per rule, holding `RULE.md`. */
export const RULES: Layout = {
	root: ".wiz/rules",
	file: "RULE.md",
	noun: "rule",
};

/** The project a rules command works on. */
export interface RulesProjectOptions {
	/** Its root: the directory holding `.wiz/rules`. */
	dir: string;
	log?: Logger;
	fs?: Fs;
	/** The rules on offer, id to bundle; the catalog by default. */
	rules?: Record<string, Bundle>;
}

/** The rules a command offers: what it was handed, else the catalog. */
export const offered = (opts: RulesProjectOptions): Record<string, Bundle> =>
	opts.rules ?? catalog;

/**
 * Says which of the files a command just changed are scripts, since a review
 * runs them: they deserve the same reading before they run as any code an
 * agent is about to execute. `changed` is under the project root.
 */
export function warnOfScripts(
	opts: RulesProjectOptions,
	changed: string[],
): void {
	const log = opts.log ?? new ConsoleLogger();
	const scripts = changed.filter(
		(path) => path.slice(RULES.root.length + 1).split("/")[1] === "scripts",
	);
	for (const path of scripts) {
		log.info(
			`⚠️ ${path} is a script that runs whenever scry reviews against its rule: read it before the next review`,
		);
	}
}
