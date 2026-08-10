import { resolve } from "node:path";
import type { Logger } from "@webappwiz/log";
import {
	checkGuide,
	compile,
	type Diagnostic,
	type Rule,
} from "@webappwiz/style";
import type { Fs } from "@webappwiz/sys";
import { count, Planner } from "./analyze";
import { type GuideLoader, ModuleGuideLoader } from "./guide-loader";
import { table } from "./table";

export class StyleCommands {
	constructor(
		private log: Logger,
		private fs: Fs,
		private loader: GuideLoader = new ModuleGuideLoader(),
	) {}

	/** Is the guide sound enough to analyze with? Exits 1 when it is not. */
	async check(opts: { rules: string; strict: boolean }): Promise<void> {
		const { rules, diagnostics } = await this.compile(opts.rules);
		this.report(rules.length, diagnostics, opts.strict);
	}

	async show(opts: { rules: string }): Promise<void> {
		const { rules, diagnostics } = await this.compile(opts.rules);
		if (diagnostics.some((d) => d.severity === "error")) {
			this.report(rules.length, diagnostics, false);
		}
		const rows = [["RULE", "FILES", "GOOD", "BAD", "PATH"]];
		for (const r of rules) {
			rows.push([
				r.name,
				r.files,
				String(r.good.length),
				String(r.bad.length),
				r.path,
			]);
		}
		this.log.info(table(rows).join("\n"));
	}

	/** Prints the analysis plan for the calling agent to execute. */
	async analyze(opts: {
		rules: string;
		dir: string;
		json: boolean;
		chunk: number;
	}): Promise<void> {
		const { rules, diagnostics } = await this.compile(opts.rules);
		if (diagnostics.some((d) => d.severity === "error")) {
			this.report(rules.length, diagnostics, false);
		}
		const dir = opts.dir.replace(/\/+$/, "") || "/";
		const planner = new Planner(this.log, this.fs);
		const tasks = await planner.plan(rules, dir, opts.chunk);
		this.log.info(
			opts.json
				? JSON.stringify(
						{ dir, rules: rules.map((r) => r.name), tasks },
						null,
						2,
					)
				: planner.render(tasks, rules.length),
		);
	}

	private async compile(
		path: string,
	): Promise<{ rules: Rule[]; diagnostics: Diagnostic[] }> {
		const { guide, dir } = await this.loader.load(path);
		const rules: Rule[] = [];
		const diagnostics: Diagnostic[] = [];
		for (const ref of guide.rules) {
			let text: string;
			try {
				text = await this.fs.read(resolve(dir, ref.path));
			} catch {
				diagnostics.push({
					path: ref.path,
					severity: "error",
					message: "cannot read rule file",
				});
				continue;
			}
			// diagnostics name the path as the guide wrote it, which stays short
			const out = compile(text, ref.path);
			diagnostics.push(...out.diagnostics);
			if (out.rule) {
				rules.push(out.rule);
			}
		}
		diagnostics.push(...checkGuide(rules));
		return { rules, diagnostics };
	}

	private report(
		rules: number,
		diagnostics: Diagnostic[],
		strict: boolean,
	): void {
		const rows = diagnostics.map((d) => [
			d.line === undefined ? d.path : `${d.path}:${d.line}`,
			d.severity,
			d.message,
		]);
		for (const line of table(rows)) {
			this.log.info(line);
		}
		const errors = diagnostics.filter((d) => d.severity === "error").length;
		const summary = `${count(errors, "error")}, ${count(diagnostics.length - errors, "warning")}`;
		if (errors > 0 || (strict && diagnostics.length > errors)) {
			throw new Error(summary);
		}
		this.log.info(`sound: ${count(rules, "rule")}, ${summary}`);
	}
}
