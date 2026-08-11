import { resolve } from "node:path";
import type { Logger } from "@webappwiz/log";
import {
	checkGuide,
	compile,
	type Diagnostic,
	type Rule,
} from "@webappwiz/style";
import type { Fs, Ps } from "@webappwiz/sys";
import type { Clock } from "@webappwiz/time";
import { Analyzer, agentCommand, count } from "./analyze";
import { type GuideLoader, ModuleGuideLoader } from "./guide-loader";
import { finished, summary } from "./report";
import { table } from "./table";

export class StyleCommands {
	constructor(
		private log: Logger,
		private fs: Fs,
		private ps: Ps,
		private clock: Clock,
		private loader: GuideLoader = new ModuleGuideLoader(),
	) {}

	/** Is the guide sound enough to analyze with? Exits 1 when it is not. */
	async check(opts: { rules: string; strict: boolean }): Promise<void> {
		const { rules, diagnostics } = await this.compile(opts.rules);
		this.report(rules.length, diagnostics, opts.strict);
	}

	/** Lists a guide's rules, one row each, ids first for citing. */
	async ls(opts: { rules: string }): Promise<void> {
		const { rules, diagnostics } = await this.compile(opts.rules);
		if (diagnostics.some((d) => d.severity === "error")) {
			this.report(rules.length, diagnostics, false);
		}
		const rows = [["ID", "RULE", "LEVEL", "FILES", "GOOD", "BAD", "PATH"]];
		for (const r of rules) {
			rows.push([
				r.id,
				r.name,
				r.level,
				r.files,
				String(r.good.length),
				String(r.bad.length),
				r.path,
			]);
		}
		this.log.info(table(rows).join("\n"));
	}

	/**
	 * Prints one rule in full: what it covers, and the document an analysis
	 * agent is given, verbatim. Take the id from `style ls` or from a finding.
	 */
	async show(opts: { id: string; rules: string }): Promise<void> {
		const { rules, diagnostics } = await this.compile(opts.rules);
		if (diagnostics.some((d) => d.severity === "error")) {
			this.report(rules.length, diagnostics, false);
		}
		const rule = rules.find((r) => r.id === opts.id);
		if (!rule) {
			throw new Error(
				`no rule "${opts.id}" in ${opts.rules}. Known ids: ${rules.map((r) => r.id).join(", ")}`,
			);
		}
		this.log.info(
			table([
				["ID", rule.id],
				["RULE", rule.name],
				["LEVEL", rule.level],
				["FILES", rule.files],
				["PATH", rule.path],
			]).join("\n"),
		);
		this.log.info("");
		this.log.info(rule.text.trim());
	}

	/**
	 * Runs the guide over a directory with an agent. Exits 1 on any error.
	 * Under `prompt` it spawns nothing and prints the prompts instead, for an
	 * agent that would rather hand them to subagents of its own.
	 */
	async analyze(opts: {
		rules: string;
		dir: string;
		agent?: string;
		exec?: string;
		prompt?: boolean;
		chunk: number;
	}): Promise<void> {
		const { rules, diagnostics } = await this.compile(opts.rules);
		if (diagnostics.some((d) => d.severity === "error")) {
			this.report(rules.length, diagnostics, false);
		}
		const dir = opts.dir.replace(/\/+$/, "") || "/";
		const analyzer = new Analyzer(this.log, this.fs, this.ps, this.clock);
		if (opts.prompt) {
			for (const task of await analyzer.plan(rules, dir, opts.chunk)) {
				this.log.info(
					`=== ${task.rule.id} ${task.rule.name} (${count(task.files.length, "file")}) ===`,
				);
				this.log.info(task.prompt);
			}
			return;
		}
		const started = this.clock.now();
		const violations = await analyzer.analyze(
			rules,
			dir,
			opts.chunk,
			agentCommand(opts),
			(task) => {
				for (const line of finished(task)) {
					this.log.info(line);
				}
			},
		);
		this.log.info("");
		this.log.info(summary(violations, this.clock.now().subtract(started)));
		const errors = violations.filter((v) => v.level === "error").length;
		if (errors > 0) {
			throw new Error(count(errors, "style error"));
		}
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
