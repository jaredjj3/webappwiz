import { catalog } from "@webappwiz/rules/catalog";
import type { Logger } from "webappwiz/log";
import type { Fs } from "webappwiz/system";
import type { Layout } from "../documents";

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
	/** The rules on offer, id to `RULE.md`; the catalog by default. */
	rules?: Record<string, string>;
}

/** The rules a command offers: what it was handed, else the catalog. */
export const offered = (opts: RulesProjectOptions): Record<string, string> =>
	opts.rules ?? catalog;
