import { Lang, parse, type SgNode } from "@ast-grep/napi";
import { ROLES } from "@webappwiz/scry/config";
import type { Logger } from "webappwiz/log";
import type { Fs } from "webappwiz/system";

/**
 * Rewrites a scry config's `budgets` from the old list of windows, each
 * naming what the models may spend in it, to what each model may spend,
 * meaning the same: a model any entry gave `"nothing"` spends nothing, one
 * with numbers keeps a limit for each, one named only `"unlimited"` stays
 * so, and one no entry named, which spent nothing, now says `"nothing"`.
 * Rewrites only a list of object literals holding literal values, saying
 * to do it by hand otherwise; comments inside the list are dropped.
 */
export async function reshapeBudgets(
	path: string,
	{ fs, log }: { fs: Fs; log: Logger },
): Promise<void> {
	if (!(await fs.exists(path))) {
		return;
	}
	const text = await fs.read(path);
	const root = parse(Lang.TypeScript, text).root();
	const pair = root
		.findAll({ rule: { kind: "pair" } })
		.find(
			(node) =>
				/^["']?budgets["']?$/.test(node.field("key")?.text() ?? "") &&
				node.field("value")?.kind() === "array",
		);
	const list = pair?.field("value");
	if (pair === undefined || list === null || list === undefined) {
		return;
	}
	const entries = list
		.children()
		.filter((node) => node.isNamed() && node.kind() !== "comment");
	const windows = entries.map(literals);
	if (windows.some((window) => window === undefined)) {
		log.info(
			`${path} sets scry.budgets as a list: give each model what it may spend by hand, like { som: { tokens: 5_000_000, per: "day" }, llm: "nothing" }`,
		);
		return;
	}
	const indent = indentOf(text, pair);
	const lines = ROLES.map((role) => {
		const spends = (windows as Record<string, string>[]).filter(
			(window) => window[role] !== undefined,
		);
		const limits = spends
			.filter((window) => /^[\d_.]+$/.test(window[role] ?? ""))
			.map((window) => {
				const span =
					window.within === undefined
						? `per: ${window.per ?? '"check"'}`
						: `within: ${window.within}`;
				return `{ tokens: ${window[role]}, ${span} }`;
			});
		if (
			spends.length === 0 ||
			spends.some((window) => unquote(window[role]) === "nothing")
		) {
			return `${role}: "nothing",`;
		}
		if (limits.length === 0) {
			return `${role}: "unlimited",`;
		}
		if (limits.length === 1) {
			return `${role}: ${limits[0]},`;
		}
		return [`${role}: [`, ...limits.map((limit) => `\t${limit},`), "],"].join(
			`\n${indent}\t`,
		);
	});
	await fs.write(
		path,
		root.commitEdits([
			list.replace(
				["{", ...lines.map((line) => `\t${line}`), "}"].join(`\n${indent}`),
			),
		]),
	);
	log.info(
		list.find({ rule: { kind: "comment" } }) === null
			? `gave each model its own budget in ${path}`
			: `gave each model its own budget in ${path}, dropping the comments in the old list`,
	);
}

/**
 * An object literal's keys and their values as written, when every value
 * is a number or a string; undefined when any is anything else.
 */
function literals(node: SgNode): Record<string, string> | undefined {
	if (node.kind() !== "object") {
		return undefined;
	}
	const found: Record<string, string> = {};
	for (const child of node
		.children()
		.filter((each) => each.isNamed() && each.kind() !== "comment")) {
		const key = child
			.field("key")
			?.text()
			.replace(/^["']|["']$/g, "");
		const value = child.field("value");
		if (
			child.kind() !== "pair" ||
			key === undefined ||
			!(value?.kind() === "number" || value?.kind() === "string")
		) {
			return undefined;
		}
		found[key] = value.text();
	}
	return found;
}

function unquote(text: string | undefined): string | undefined {
	return text?.replace(/^["']|["']$/g, "");
}

/** The whitespace `node`'s line starts with. */
function indentOf(text: string, node: SgNode): string {
	const start = node.range().start.index;
	const line = text.slice(text.lastIndexOf("\n", start - 1) + 1, start);
	return /^\s*$/.test(line) ? line : "";
}
