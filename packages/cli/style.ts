import { dirname, resolve } from "node:path";
import type { Logger } from "@webappwiz/log";
import {
	checkGuide,
	compile,
	type Diagnostic,
	isStyleGuide,
	type Rule,
	type StyleGuide,
} from "@webappwiz/style";
import type { Fs } from "@webappwiz/sys";

/**
 * Imports a guide module — Bun runs the user's TypeScript directly. The type
 * system cannot vouch for a module loaded at runtime, so the export is checked
 * again here.
 */
export async function loadGuide(
	path: string,
): Promise<{ guide: StyleGuide; dir: string }> {
	const abs = resolve(path);
	const module = await import(abs);
	if (!isStyleGuide(module.default)) {
		throw new Error(`${path} must default-export defineStyleGuide([...])`);
	}
	return { guide: module.default, dir: dirname(abs) };
}

/** Reads and compiles every rule the guide points at. Rule paths are relative
 * to the guide module, and diagnostics report them that way — short. */
export async function compileGuide(
	guide: StyleGuide,
	dir: string,
	fs: Fs,
): Promise<{ rules: Rule[]; diagnostics: Diagnostic[] }> {
	const rules: Rule[] = [];
	const diagnostics: Diagnostic[] = [];
	for (const ref of guide.rules) {
		let text: string;
		try {
			text = await fs.read(resolve(dir, ref.path));
		} catch {
			diagnostics.push({
				path: ref.path,
				severity: "error",
				message: "cannot read rule file",
			});
			continue;
		}
		const out = compile(text, ref.path);
		diagnostics.push(...out.diagnostics);
		if (out.rule) {
			rules.push(out.rule);
		}
	}
	diagnostics.push(...checkGuide(rules));
	return { rules, diagnostics };
}

export const count = (n: number, word: string) =>
	`${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Prints diagnostics compiler-style and summarizes. Throws when the guide is
 * not sound — errors always, warnings too under `strict` — so the cli exits 1.
 */
export function report(
	rules: number,
	diagnostics: Diagnostic[],
	strict: boolean,
	log: Logger,
): void {
	const rows = diagnostics.map(
		(d) =>
			[
				d.line === undefined ? d.path : `${d.path}:${d.line}`,
				d.severity,
				d.message,
			] as const,
	);
	const pad = Math.max(0, ...rows.map(([where]) => where.length));
	for (const [where, severity, message] of rows) {
		log.info(`${where.padEnd(pad)}  ${severity.padEnd(7)}  ${message}`);
	}
	const errors = diagnostics.filter((d) => d.severity === "error").length;
	const summary = `${count(errors, "error")}, ${count(diagnostics.length - errors, "warning")}`;
	if (errors > 0 || (strict && diagnostics.length > errors)) {
		throw new Error(summary);
	}
	log.info(`sound: ${count(rules, "rule")}, ${summary}`);
}

/** `style check <rules>` — is the guide sound enough to analyze with? */
export async function check(
	opts: { rules: string; strict: boolean },
	log: Logger,
	fs: Fs,
	load = loadGuide, // the import seam, so tests can hand a guide in
): Promise<void> {
	const { guide, dir } = await load(opts.rules);
	const { rules, diagnostics } = await compileGuide(guide, dir, fs);
	report(rules.length, diagnostics, opts.strict, log);
}
