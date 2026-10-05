import { basename, dirname, resolve } from "node:path";
import { type Fs, type Glob, NodeFs, NodeGlob } from "webappwiz/system";
import { type Case, Cases } from "./cases";
import { DeclaredRule } from "./declared-rule";
import { ignored, legacy } from "./ignores";
import { CASES_DIR, CHECK_FILE, RULES_ROOT } from "./layout";
import { Progress } from "./progress";
import type { Finding, Level, Rule, Tools } from "./rule";
import { RuleError } from "./rule-error";
import { SourceFile } from "./source-file";

/**
 * The rules in a project's `.wiz/scry`. A rule is a directory: its `rule.ts`
 * default-exports the class that checks files, whose static members say what
 * the rule expects and which files it reads. Its `RULE.md` is prose for
 * whoever fixes a finding, and nothing here reads it.
 */
export class Rules {
	private constructor(
		/** The project root. */
		private dir: string,
		readonly all: readonly DeclaredRule[],
		private fs: Fs,
	) {}

	/**
	 * Every rule under `<dir>/.wiz/scry`, as its class declares it. A
	 * directory there without a `rule.ts`, one that fails to import, or one
	 * whose class lacks a setting or gives a bad one, is an error, and every
	 * such problem is reported at once rather than the first.
	 */
	static async load(dir: string, opts: LoadOptions = {}): Promise<Rules> {
		const fs = opts.fs ?? new NodeFs();
		// no such directory is just "no rules", and the message for that
		// belongs to the caller, who knows what it was about to do with them
		const ids = await fs
			.readdir(`${dir}/${RULES_ROOT}`)
			.catch((): string[] => []);
		const rules: DeclaredRule[] = [];
		const problems: string[] = [];
		for (const id of ids.toSorted()) {
			if (id.startsWith(".")) {
				continue;
			}
			const path = `${RULES_ROOT}/${id}/${CHECK_FILE}`;
			if (!(await fs.exists(`${dir}/${path}`))) {
				problems.push(`${path}: missing`);
				continue;
			}
			try {
				const module = (await import(resolve(dir, path))) as {
					default?: unknown;
				};
				rules.push(DeclaredRule.of(id, module.default, { path }));
			} catch (error) {
				problems.push(
					error instanceof RuleError
						? error.message
						: `${path}: ${reason(error)}`,
				);
			}
		}
		if (problems.length > 0) {
			throw new RuleError(problems.join("\n"));
		}
		return new Rules(dir, rules, fs);
	}

	get(id: string): DeclaredRule | undefined {
		return this.all.find((rule) => rule.id === id);
	}

	/** The rules with these ids, or every rule when there are none; an id with no rule is an error. */
	private chosen(ids: readonly string[] = []): readonly DeclaredRule[] {
		for (const id of ids) {
			if (this.get(id) === undefined) {
				throw new RuleError(`no rule "${id}" in ${RULES_ROOT}`);
			}
		}
		return ids.length === 0
			? this.all
			: this.all.filter((declared) => ids.includes(declared.id));
	}

	/**
	 * Checks each file against every rule, or each one `ids` names, whose
	 * `files` it matches. Every rule
	 * runs on every file at once, so the questions they ask a decider arrive
	 * together, and each file is read and parsed once however many rules read
	 * it. A rule that throws, on one file or on being built, is reported
	 * unchecked rather than ending the check.
	 */
	async check(opts: CheckOptions): Promise<Report> {
		const glob = opts.glob ?? new NodeGlob();
		const report: Report = {
			problems: [],
			unchecked: [],
			files: 0,
			rules: 0,
			dropped: 0,
			ignored: 0,
			legacy: [],
			cancelled: false,
		};
		const homes = new Map(
			await Promise.all(
				opts.paths.map(
					async (path) => [path, await this.ruleHome(path)] as const,
				),
			),
		);
		// a rule's cases break it, or follow it, on purpose
		const checked = opts.paths.filter((path) => !homes.get(path)?.isCase);
		const matched = this.chosen(opts.ids)
			.map((declared) => ({
				declared,
				paths: checked.filter((path) => glob.matches(declared.files, path)),
			}))
			.filter(({ paths }) => paths.length > 0);
		report.rules = matched.length;
		report.files = new Set(matched.flatMap(({ paths }) => paths)).size;
		const progress = opts.progress ?? new Progress();
		progress.total = report.files;
		progress.done = 0;
		// a file is done once every rule that matched it is done with it
		const left = new Map<string, number>();
		for (const path of matched.flatMap(({ paths }) => paths)) {
			left.set(path, (left.get(path) ?? 0) + 1);
		}
		const finish = (path: string) => {
			const count = (left.get(path) ?? 1) - 1;
			left.set(path, count);
			if (count === 0) {
				progress.done++;
			}
		};

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

		const checks = matched.map(async ({ declared, paths }) => {
			let rule: Rule;
			try {
				rule = declared.build(opts.tools);
			} catch (error) {
				report.unchecked.push({ subject: declared.id, reason: reason(error) });
				paths.forEach(finish);
				return;
			}
			await Promise.all(
				paths.map(async (path) => {
					// a rule's own code and tests show what it forbids, on purpose
					if (homes.get(path)?.id === declared.id) {
						finish(path);
						return;
					}
					const file = await open(path);
					const findings = await rule.check(file).catch((error: unknown) => {
						report.unchecked.push({
							subject: `${declared.id} on ${path}`,
							reason: reason(error),
						});
						return [];
					});
					report.problems.push(
						...this.sift(declared, file, findings, report).map((finding) => ({
							...finding,
							path,
							rule: declared.id,
							level: declared.level,
						})),
					);
					finish(path);
				}),
			);
		});
		await Promise.all(checks);

		const ids = this.all.map((declared) => declared.id);
		for (const [path, file] of files) {
			if (legacy((await file).text, ids)) {
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
		report.legacy.sort();
		return report;
	}

	/**
	 * Runs each rule on its labeled cases, the way a check would run it on a
	 * project's files: what a `scry-ignore` comment excuses and what falls
	 * under the threshold are not findings. Every case of every rule at once,
	 * so a decider batches them as it would a check.
	 */
	async evaluate(opts: EvaluateOptions): Promise<Evaluation[]> {
		const evaluated = this.chosen(opts.ids);
		// every case is loaded before any is scored, so the total is known
		const loaded = await Promise.all(
			evaluated.map(async (declared) => ({
				declared,
				rule: declared.build(opts.tools),
				cases: await Cases.load(`${this.dir}/${RULES_ROOT}/${declared.id}`, {
					fs: this.fs,
				}),
			})),
		);
		const progress = opts.progress ?? new Progress();
		progress.total = loaded.reduce(
			(sum, { cases }) => sum + cases.all.length,
			0,
		);
		progress.done = 0;
		return Promise.all(
			loaded.map(async ({ declared, rule, cases }): Promise<Evaluation> => {
				const scored = await Promise.all(
					cases.all.map(async (each): Promise<Scored> => {
						const scoring = { name: each.name, kind: each.kind };
						try {
							const findings = await rule.check(each.file);
							return {
								...scoring,
								findings: this.sift(declared, each.file, findings),
							};
						} catch (error) {
							return { ...scoring, findings: [], error: reason(error) };
						} finally {
							progress.done++;
						}
					}),
				);
				return { rule: declared.id, cases: scored };
			}),
		);
	}

	/**
	 * The findings that stand: not excused by a `scry-ignore` comment, and at
	 * or over the rule's threshold. Counts the rest on the report, when given.
	 */
	private sift(
		declared: DeclaredRule,
		file: SourceFile,
		findings: Finding[],
		report: Pick<Report, "ignored" | "dropped"> = { ignored: 0, dropped: 0 },
	): Finding[] {
		return findings.filter((finding) => {
			if (ignored(file.text, declared.id, finding.line)) {
				report.ignored++;
				return false;
			}
			if (finding.confidence < declared.threshold) {
				report.dropped++;
				return false;
			}
			return true;
		});
	}

	/**
	 * The rule whose directory a file is in, by the `rule.ts` beside it or
	 * above its `evals/`, wherever the rule lives: in `.wiz/scry`, or in a
	 * catalog it ships from.
	 */
	private async ruleHome(
		path: string,
	): Promise<{ id: string; isCase: boolean } | undefined> {
		const dir = dirname(path);
		if (await this.fs.exists(`${this.dir}/${dir}/${CHECK_FILE}`)) {
			return { id: basename(dir), isCase: false };
		}
		const above = dirname(dir);
		if (
			basename(dir) === CASES_DIR &&
			(await this.fs.exists(`${this.dir}/${above}/${CHECK_FILE}`))
		) {
			return { id: basename(above), isCase: true };
		}
		return undefined;
	}
}

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

/** How a rule did on one of its labeled cases. */
export interface Scored {
	/** Where the case came from, as `Case.name`. */
	name: string;
	kind: Case["kind"];
	/** What the rule found in it, over its threshold and not ignored. */
	findings: Finding[];
	/** Why the rule could not check it, when it threw. */
	error?: string;
}

/** A rule's score on its cases. */
export interface Evaluation {
	rule: string;
	cases: Scored[];
}

/** Which rules to evaluate, and what to build them with. */
export interface EvaluateOptions {
	/** Rule ids; every rule when empty. */
	ids?: readonly string[];
	tools: Tools;
	signal?: AbortSignal;
	/** Counts the cases as each is scored, for showing as it goes. */
	progress?: Progress;
}

/** What a check looks at, and what it builds the rules with. */
export interface CheckOptions {
	/** Files to check, from the project root. */
	paths: readonly string[];
	/** Rule ids; every rule when empty. */
	ids?: readonly string[];
	/** What every rule is built with. */
	tools: Tools;
	glob?: Glob;
	/** Stops the check: what came back by then is the report. */
	signal?: AbortSignal;
	/** Counts the files as every rule finishes with each, for showing as it goes. */
	progress?: Progress;
}

function reason(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
