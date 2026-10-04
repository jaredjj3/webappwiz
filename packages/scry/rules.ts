import { resolve } from "node:path";
import { type Fs, type Glob, NodeFs, NodeGlob } from "webappwiz/system";
import { ignored } from "./ignores";
import { CHECK_FILE, RULE_FILE, RULES_ROOT } from "./layout";
import type { Finding, Rule, RuleClass, Tools } from "./rule";
import { type Level, RuleDocument, RuleError } from "./rule-document";
import { SourceFile } from "./source-file";

/** What reading a project's rules reads through. */
export interface LoadOptions {
	fs?: Fs;
}

/** A finding, where it is and which rule found it. */
export interface Problem extends Finding {
	/** From the project root. */
	path: string;
	rule: string;
	level: Level;
}

/** Something a check could not look at, and why. */
export interface Unchecked {
	/** What was not checked: a rule, or a rule on one file. */
	subject: string;
	reason: string;
}

/** What a check found, and what it could not look at. */
export interface Report {
	/** By path, then line. */
	problems: Problem[];
	unchecked: Unchecked[];
	/** Rules with a `RULE.md` and no `rule.ts` yet, which checked nothing. */
	withoutCheck: string[];
	/** How many of the files matched at least one rule. */
	files: number;
	/** How many rules matched at least one of the files. */
	rules: number;
	/** Findings under their rule's threshold: what a decider thought unlikely. */
	dropped: number;
	/** Findings a `scry-ignore` comment excused. */
	ignored: number;
	/**
	 * Checked files still excusing themselves with `rule-ignore`, the
	 * spelling from before scry, which counts the same but should be renamed.
	 */
	legacy: string[];
	/** Whether it was stopped before every rule came back. */
	cancelled: boolean;
}

/** What a check looks at, and what it builds the rules with. */
export interface CheckOptions {
	/** Files to check, from the project root. */
	paths: readonly string[];
	/** What every rule is built with. */
	tools: Tools;
	glob?: Glob;
	/** Stops the check: what came back by then is the report. */
	signal?: AbortSignal;
}

/**
 * The rules in a project's `.wiz/scry`. A rule is a directory: its `RULE.md`
 * says what it expects and which files it reads, and its `rule.ts`
 * default-exports the class that checks them.
 */
export class Rules {
	private constructor(
		/** The project root. */
		private dir: string,
		readonly all: readonly RuleDocument[],
		private fs: Fs,
	) {}

	/**
	 * Every rule under `<dir>/.wiz/scry`, as its `RULE.md` reads. A directory
	 * there without a `RULE.md`, or one whose document fails to parse, is an
	 * error, and every such problem is reported at once rather than the first.
	 */
	static async load(dir: string, opts: LoadOptions = {}): Promise<Rules> {
		const fs = opts.fs ?? new NodeFs();
		// no such directory is just "no rules", and the message for that
		// belongs to the caller, who knows what it was about to do with them
		const ids = await fs
			.readdir(`${dir}/${RULES_ROOT}`)
			.catch((): string[] => []);
		const rules: RuleDocument[] = [];
		const problems: string[] = [];
		for (const id of ids.toSorted()) {
			if (id.startsWith(".")) {
				continue;
			}
			const path = `${RULES_ROOT}/${id}/${RULE_FILE}`;
			const text = await fs.read(`${dir}/${path}`).catch((): null => null);
			if (text === null) {
				problems.push(`${path}: missing`);
				continue;
			}
			try {
				rules.push(RuleDocument.parse(text, { path, id }));
			} catch (error) {
				problems.push(error instanceof RuleError ? error.message : `${error}`);
			}
		}
		if (problems.length > 0) {
			throw new RuleError(problems.join("\n"));
		}
		return new Rules(dir, rules, fs);
	}

	get(id: string): RuleDocument | undefined {
		return this.all.find((rule) => rule.id === id);
	}

	/**
	 * Checks each file against every rule whose `files` it matches. Every rule
	 * runs on every file at once, so the questions they ask a decider arrive
	 * together, and each file is read and parsed once however many rules read
	 * it. A rule that throws, on one file or on loading, is reported unchecked
	 * rather than ending the check.
	 */
	async check(opts: CheckOptions): Promise<Report> {
		const glob = opts.glob ?? new NodeGlob();
		const report: Report = {
			problems: [],
			unchecked: [],
			withoutCheck: [],
			files: 0,
			rules: 0,
			dropped: 0,
			ignored: 0,
			legacy: [],
			cancelled: false,
		};
		// a rule's own cases break it, or follow it, on purpose
		const checked = opts.paths.filter((path) => !OWN_CASES.test(path));
		const matched = this.all
			.map((document) => ({
				document,
				paths: checked.filter((path) => glob.matches(document.files, path)),
			}))
			.filter(({ paths }) => paths.length > 0);
		report.rules = matched.length;
		report.files = new Set(matched.flatMap(({ paths }) => paths)).size;

		const files = new Map<string, Promise<SourceFile>>();
		const open = (path: string): Promise<SourceFile> => {
			let file = files.get(path);
			if (file === undefined) {
				file = this.fs
					.read(`${this.dir}/${path}`)
					.then((text) => new SourceFile(path, text));
				files.set(path, file);
			}
			return file;
		};

		const checks = matched.map(async ({ document, paths }) => {
			const rule = await this.build(document, opts.tools).catch(
				(error: unknown) => {
					report.unchecked.push({
						subject: document.id,
						reason: reason(error),
					});
					return null;
				},
			);
			if (rule === null) {
				return;
			}
			if (rule === undefined) {
				report.withoutCheck.push(document.id);
				return;
			}
			await Promise.all(
				paths.map(async (path) => {
					const file = await open(path);
					const findings = await rule.check(file).catch((error: unknown) => {
						report.unchecked.push({
							subject: `${document.id} on ${path}`,
							reason: reason(error),
						});
						return [];
					});
					for (const finding of findings) {
						if (ignored(file.text, document.id, finding.line)) {
							report.ignored++;
						} else if (finding.confidence < document.threshold) {
							report.dropped++;
						} else {
							report.problems.push({
								...finding,
								path,
								rule: document.id,
								level: document.level,
							});
						}
					}
				}),
			);
		});
		await Promise.all(checks);

		for (const [path, file] of files) {
			if (/\brule-ignore(-file)? /.test((await file).text)) {
				report.legacy.push(path);
			}
		}
		report.cancelled = opts.signal?.aborted ?? false;
		report.problems.sort(
			(left, right) =>
				left.path.localeCompare(right.path) || left.line - right.line,
		);
		report.unchecked.sort((left, right) =>
			left.subject.localeCompare(right.subject),
		);
		report.withoutCheck.sort();
		report.legacy.sort();
		return report;
	}

	/** The rule's check, built with the tools; undefined when it has no `rule.ts` yet. */
	private async build(
		document: RuleDocument,
		tools: Tools,
	): Promise<Rule | undefined> {
		const path = `${this.dir}/${RULES_ROOT}/${document.id}/${CHECK_FILE}`;
		if (!(await this.fs.exists(path))) {
			return undefined;
		}
		const module = (await import(resolve(path))) as { default?: RuleClass };
		if (typeof module.default !== "function") {
			throw new Error(
				`${RULES_ROOT}/${document.id}/${CHECK_FILE} does not default-export the rule's class`,
			);
		}
		return new module.default(tools);
	}
}

/** A file in a rule's own `evals/` or `fixtures/`. */
const OWN_CASES = new RegExp(
	`^${RULES_ROOT.replaceAll(".", "\\.")}/[^/]+/(evals|fixtures)/`,
);

function reason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
