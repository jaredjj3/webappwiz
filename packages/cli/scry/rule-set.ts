import { DeclaredRule } from "@webappwiz/scry";
import { catalog, type ShippedRule } from "@webappwiz/scry/catalog";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { type Fs, NodeFs } from "webappwiz/system";
import type { Bundle, Layout } from "../documents";

/**
 * Where a project keeps its rules: one directory per rule, holding `RULE.md`,
 * whose frontmatter carries the version a copy came from, beside `rule.ts`.
 */
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
	/** The rules on offer, id to class and files; the catalog by default. */
	rules?: Record<string, ShippedRule>;
}

/** The files of every rule on offer, id to bundle: what a command copies. */
export const offered = (opts: RulesProjectOptions): Record<string, Bundle> =>
	Object.fromEntries(
		Object.entries(opts.rules ?? catalog).map(([id, { files }]) => [id, files]),
	);

/** Every rule on offer, as its class declares it, in id order. */
export const shipped = (opts: RulesProjectOptions): Map<string, DeclaredRule> =>
	new Map(
		Object.entries(opts.rules ?? catalog)
			.toSorted(([left], [right]) => left.localeCompare(right))
			.map(([id, { rule }]) => [id, DeclaredRule.of(id, rule)]),
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

/**
 * Says so when the project at `dir` does not depend on `@webappwiz/scry`: a
 * rule's tests import it, and a project that only has the CLI resolves it,
 * if at all, through whatever its package manager happened to hoist.
 */
export async function warnOfTests(
	dir: string,
	opts: RulesProjectOptions,
): Promise<void> {
	const fs = opts.fs ?? new NodeFs();
	const path = `${dir}/package.json`;
	if (!(await fs.exists(path))) {
		return;
	}
	const manifest = JSON.parse(await fs.read(path)) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
	if (
		manifest.dependencies?.["@webappwiz/scry"] === undefined &&
		manifest.devDependencies?.["@webappwiz/scry"] === undefined
	) {
		(opts.log ?? new ConsoleLogger()).info(
			"⚠️ a rule's tests import @webappwiz/scry, which package.json does not list: add it as a devDependency",
		);
	}
}
