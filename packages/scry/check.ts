import { Dispatcher, type Eventful } from "webappwiz/events";
import {
	type Fs,
	type Glob,
	NodeFs,
	NodeGlob,
	NodePs,
	type Ps,
} from "webappwiz/system";
import { Call, type CallFile, type Finding } from "./call";
import type { Changeset } from "./git";
import type { Effort, Rule } from "./rule";
import type { Rules } from "./rules";
import { type Candidate, Scripts } from "./scripts";

/** Whatever answers a prompt: a model behind a command, or a fake in a test. */
export interface Agent {
	ask(prompt: string, opts?: AskOptions): Promise<string>;
}

/** How one question to an agent runs. */
export interface AskOptions {
	/** Gives up on the question when it aborts. */
	signal?: AbortSignal;
	/** Told what the agent is doing as it answers, when it can say. */
	observer?: AskObserver;
}

/** What hears about one question to an agent while it is answered. */
export interface AskObserver {
	/** What the agent is doing now, in a few words: `thinking`, `writing ~120 tokens`. */
	status(status: string): void;
	/** What the question really cost, when the agent reports it. */
	usage(usage: Usage): void;
}

/** Tokens an agent really spent, as it reported them. */
export interface Usage {
	/** Every input token, cached or not. */
	input: number;
	/** Of `input`, what came from the provider's cache, which costs less. */
	cached: number;
	output: number;
	/** In US dollars, when the agent says. */
	cost?: number;
}

/** Something the check could not look at, and why. */
export interface Unchecked {
	/** What was not checked: a file, or a rule's script. */
	subject: string;
	reason: string;
}

/** What a check found, and what it could not look at. */
export interface Report {
	since: string;
	/** In file order, then line order. */
	findings: Finding[];
	unchecked: Unchecked[];
	/** How many changed files matched at least one rule. */
	files: number;
	/** How many rules matched at least one changed file. */
	rules: number;
	/** Whether the check was stopped before every call came back. */
	cancelled: boolean;
	/**
	 * What the calls whose agents report usage really spent, summed, and how
	 * many calls that was. Absent when none of them did.
	 */
	usage?: Usage & { calls: number };
	/**
	 * Checked files still excusing themselves with `rule-ignore`, the
	 * spelling from before scry, which counts the same but should be renamed.
	 */
	legacy: string[];
}

/** What a check raises while it runs. */
export interface CheckEvents extends Record<string, unknown> {
	/** A call went to its agent. */
	asked: { call: Call };
	/** The agent working on a call said what it is doing. */
	status: { call: Call; status: string };
	/**
	 * A call is settled: it came back with what it found, or with why it
	 * could not be read, or the check was cancelled before it did, whether it
	 * had gone out or not. `done` counts the calls settled so far, this one
	 * included.
	 */
	answered: {
		call: Call;
		done: number;
		findings: Finding[];
		error?: string;
		cancelled?: boolean;
	};
}

/** What a check needs to look at a change. */
export interface PrepareOptions {
	/** The project root. */
	dir: string;
	rules: Rules;
	changes: Changeset;
	/**
	 * The estimated input tokens one call holds before the next file goes in
	 * a call of its own. A file too big for it alone still gets one call.
	 * 32,000 when not set.
	 */
	batch?: number;
	fs?: Fs;
	ps?: Ps;
	glob?: Glob;
}

/** How a prepared check runs its agent calls. */
export interface RunOptions {
	/** The agent for each effort the check needs; see `efforts`. */
	agents: ReadonlyMap<Effort, Agent>;
	/** How many calls run at once. */
	jobs: number;
	/**
	 * Stops the check early: no more calls go out, the ones out are abandoned,
	 * and the report holds what came back before it.
	 */
	signal?: AbortSignal;
}

/**
 * A change checked against a project's rules. `prepare` does everything that
 * costs nothing, matching rules to files and running their scripts, so the
 * cost of the rest is known before any of it is spent; `run` sends the
 * agent calls.
 */
export class Check implements Eventful<CheckEvents> {
	private readonly dispatcher = new Dispatcher<CheckEvents>();
	readonly events = this.dispatcher.events;

	private constructor(
		private since: string,
		/** The agent calls still to make, each some files and one effort. */
		readonly calls: readonly Call[],
		/** Findings the scripts of `effort: none` rules settled on their own. */
		private settled: Finding[],
		private unchecked: Unchecked[],
		private files: number,
		private rules: number,
		private legacy: string[],
	) {}

	static async prepare(opts: PrepareOptions): Promise<Check> {
		const fs = opts.fs ?? new NodeFs();
		const glob = opts.glob ?? new NodeGlob();
		const scripts = new Scripts(opts.dir, { fs, ps: opts.ps ?? new NodePs() });
		const matched = new Map<Rule, string[]>();
		for (const rule of opts.rules.all) {
			const files = opts.changes.files
				.map((file) => file.path)
				.filter((path) => glob.matches(rule.files, path));
			if (files.length > 0) {
				matched.set(rule, files);
			}
		}

		// rule id, then file, to what its scripts flagged there
		const flagged = new Map<string, Map<string, Candidate[]>>();
		const unchecked: Unchecked[] = [];
		for (const [rule, files] of matched) {
			const byFile = new Map<string, Candidate[]>();
			flagged.set(rule.id, byFile);
			for (const script of rule.scripts) {
				try {
					for (const candidate of await scripts.run(script, files)) {
						// a script reporting a file it was not handed is not believed
						if (files.includes(candidate.file)) {
							byFile.set(candidate.file, [
								...(byFile.get(candidate.file) ?? []),
								candidate,
							]);
						}
					}
				} catch (error) {
					unchecked.push({ subject: script, reason: message(error) });
				}
			}
		}

		const settled: Finding[] = [];
		const legacy: string[] = [];
		// effort and rule ids to the files that share exactly those rules, so
		// every file in a call is judged against every rule in it
		const groups = new Map<
			string,
			{ effort: Exclude<Effort, "none">; rules: Rule[]; files: CallFile[] }
		>();
		for (const file of opts.changes.files) {
			const here = [...matched]
				.filter(([, files]) => files.includes(file.path))
				.map(([rule]) => rule);
			if (here.length === 0) {
				continue;
			}
			const text = await fs.read(`${opts.dir}/${file.path}`);
			// on a comment line, so code and docs that only mention it do not count
			if (
				/^\s*(\/\/|#|\*|\/\*|<!--).*\brule-ignore(-file)? [\w-]+:/m.test(text)
			) {
				legacy.push(file.path);
			}
			for (const rule of here.filter((rule) => rule.effort === "none")) {
				for (const candidate of flagged.get(rule.id)?.get(file.path) ?? []) {
					if (!ignored(text, rule.id, candidate.line)) {
						settled.push({
							file: file.path,
							line: candidate.line,
							level: rule.level,
							rule: rule.id,
							message: candidate.message,
						});
					}
				}
			}
			for (const effort of ["low", "medium", "high"] as const) {
				const rules = here.filter((rule) => rule.effort === effort);
				if (rules.length === 0) {
					continue;
				}
				const candidates = new Map(
					rules.map((rule) => [
						rule.id,
						flagged.get(rule.id)?.get(file.path) ?? [],
					]),
				);
				const key = [effort, ...rules.map((rule) => rule.id)].join(" ");
				const group = groups.get(key) ?? { effort, rules, files: [] };
				group.files.push({ file, text, candidates });
				groups.set(key, group);
			}
		}

		const cap = opts.batch ?? 32_000;
		const calls: Call[] = [];
		for (const { effort, rules, files } of groups.values()) {
			let batch: CallFile[] = [];
			for (const file of files) {
				const grown = new Call({ effort, rules, files: [...batch, file] });
				if (batch.length > 0 && grown.tokens > cap) {
					calls.push(new Call({ effort, rules, files: batch }));
					batch = [file];
				} else {
					batch.push(file);
				}
			}
			calls.push(new Call({ effort, rules, files: batch }));
		}
		const files = new Set([...matched.values()].flat()).size;
		return new Check(
			opts.changes.since,
			calls,
			settled,
			unchecked,
			files,
			matched.size,
			legacy,
		);
	}

	/** The estimated input tokens every call together sends. */
	get tokens(): number {
		return this.calls.reduce((sum, call) => sum + call.tokens, 0);
	}

	/** The efforts the calls need an agent for. */
	get efforts(): Set<Effort> {
		return new Set(this.calls.map((call) => call.effort));
	}

	/**
	 * Sends every call, `jobs` at a time, and reports what they and the
	 * scripts found. A call whose agent fails or answers in a way that cannot
	 * be read is reported as unchecked, never guessed at.
	 */
	async run(opts: RunOptions): Promise<Report> {
		for (const effort of this.efforts) {
			if (!opts.agents.has(effort)) {
				throw new Error(`no agent for effort ${effort}`);
			}
		}
		const findings = [...this.settled];
		const unchecked = [...this.unchecked];
		const queue = [...this.calls];
		const signal = opts.signal;
		let done = 0;
		const used: Usage[] = [];
		const cancel = (call: Call): void => {
			for (const file of call.files) {
				unchecked.push({ subject: file, reason: "cancelled" });
			}
			this.dispatcher.dispatch("answered", {
				call,
				done: ++done,
				findings: [],
				cancelled: true,
			});
		};
		const worker = async (): Promise<void> => {
			while (!signal?.aborted) {
				const call = queue.shift();
				if (call === undefined) {
					return;
				}
				this.dispatcher.dispatch("asked", { call });
				const observer: AskObserver = {
					status: (status) => {
						this.dispatcher.dispatch("status", { call, status });
					},
					usage: (usage) => {
						used.push(usage);
					},
				};
				try {
					const reply = await abandonable(
						opts.agents
							.get(call.effort)
							?.ask(call.prompt, { signal, observer }) ?? Promise.resolve(""),
						signal,
					);
					const found = call.findings(reply);
					findings.push(...found);
					this.dispatcher.dispatch("answered", {
						call,
						done: ++done,
						findings: found,
					});
				} catch (error) {
					if (signal?.aborted) {
						cancel(call);
						return;
					}
					for (const file of call.files) {
						unchecked.push({ subject: file, reason: message(error) });
					}
					this.dispatcher.dispatch("answered", {
						call,
						done: ++done,
						findings: [],
						error: message(error),
					});
				}
			}
		};
		await Promise.all(
			Array.from({ length: Math.max(1, opts.jobs) }, () => worker()),
		);
		// the calls that never went out
		for (const call of queue) {
			cancel(call);
		}
		return {
			since: this.since,
			findings: findings.toSorted(
				(left, right) =>
					left.file.localeCompare(right.file) || left.line - right.line,
			),
			// a file whose calls at two efforts failed the same way is named once
			unchecked: [
				...new Map(
					unchecked.map((item) => [`${item.subject}\0${item.reason}`, item]),
				).values(),
			].toSorted((left, right) => left.subject.localeCompare(right.subject)),
			files: this.files,
			rules: this.rules,
			cancelled: signal?.aborted ?? false,
			...(used.length === 0 ? {} : { usage: total(used) }),
			legacy: this.legacy,
		};
	}
}

/**
 * `answer`, or a rejection the moment `signal` aborts, so an agent that
 * ignores its signal cannot hold a cancelled check open.
 */
function abandonable<T>(answer: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (signal === undefined) {
		return answer;
	}
	return Promise.race([
		answer,
		new Promise<never>((_, reject) => {
			const abandon = () => reject(new Error("cancelled"));
			if (signal.aborted) {
				abandon();
			}
			signal.addEventListener("abort", abandon, { once: true });
		}),
	]);
}

function total(used: Usage[]): Usage & { calls: number } {
	const costs = used.flatMap((usage) =>
		usage.cost === undefined ? [] : [usage.cost],
	);
	return {
		calls: used.length,
		input: used.reduce((sum, usage) => sum + usage.input, 0),
		cached: used.reduce((sum, usage) => sum + usage.cached, 0),
		output: used.reduce((sum, usage) => sum + usage.output, 0),
		...(costs.length === 0
			? {}
			: { cost: costs.reduce((sum, cost) => sum + cost, 0) }),
	};
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * Whether a comment excuses `line` of `text` from `rule`: `scry-ignore-file`
 * anywhere, or `scry-ignore` in the comment lines right above it, or the
 * same under the older `rule-ignore`. Agents read the same comments from the
 * prompt; this is for findings no agent sees.
 */
function ignored(text: string, rule: string, line: number): boolean {
	if (new RegExp(`(scry|rule)-ignore-file ${rule}\\b`).test(text)) {
		return true;
	}
	const lines = text.split("\n");
	for (let at = line - 2; at >= 0; at--) {
		const above = lines[at]?.trim() ?? "";
		if (!/^(\/\/|#|\*|\/\*|<!--)/.test(above)) {
			return false;
		}
		if (new RegExp(`(scry|rule)-ignore ${rule}\\b`).test(above)) {
			return true;
		}
	}
	return false;
}
