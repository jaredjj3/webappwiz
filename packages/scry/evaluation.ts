import { Markdown } from "webappwiz/md";
import { type Fs, NodeFs } from "webappwiz/system";
import { Call } from "./call";
import type { Unchecked, Usage } from "./check";
import type { Judge } from "./judge";
import { EVAL_FILE } from "./layout";
import type { Effort, Rule } from "./rule";

/**
 * One case a rule is judged on: an eval case in its `evals/`, or a code
 * block under its `## Good` or `## Bad`.
 */
export interface Example {
	rule: string;
	/** Whether it should come back under the rule's threshold, or at or over it. */
	kind: "good" | "bad";
	/** Where it came from: `evals/<file>`, or `RULE.md good 2`. */
	source: string;
	/**
	 * The file name the model is shown, which never says good or bad:
	 * `<name>.<ext>` for an eval case, `example.<lang>` for a code block.
	 */
	path: string;
	code: string;
}

/** An example, and what a judge made of it. */
export interface JudgedExample extends Example {
	/** How sure the judge is that the example breaks the rule. */
	probability: number;
	/** Whether that probability, against the rule's threshold, agrees with its kind. */
	right: boolean;
}

/** How a judge did on one rule's examples. */
export interface RuleEvaluation {
	rule: string;
	effort: Exclude<Effort, "none">;
	threshold: number;
	examples: JudgedExample[];
}

/** How the judges did on every rule's examples. */
export interface EvaluationReport {
	/** In the order the rules were given; a rule with no examples has none. */
	rules: RuleEvaluation[];
	/** Examples a judge failed on, as `<rule> <source>`. */
	unchecked: Unchecked[];
	/** Whether it was stopped before every example came back. */
	cancelled: boolean;
	/** What the judges that report usage really spent. */
	usage?: Usage & { calls: number };
}

/** What an evaluation reads. */
export interface EvaluationOptions {
	/** The project root, which a rule's eval paths are from. */
	dir: string;
	rules: readonly Rule[];
	fs?: Fs;
}

/** How an evaluation runs. */
export interface EvaluationRunOptions {
	/** The judge for each effort the rules need; see `efforts`. */
	judges: ReadonlyMap<Effort, Judge>;
	/** How many examples are judged at once. */
	jobs: number;
	signal?: AbortSignal;
}

/**
 * Each rule judged against cases whose answer is known: the files in its
 * `evals/`, named `<name>.good.<ext>` or `<name>.bad.<ext>`, and the code
 * blocks under its `## Good` and `## Bad`. A good case should come back under
 * the rule's threshold and a bad one at or over it. Each is asked the same
 * question a check asks of a new file, so two models compared this way are
 * compared on what a check does. A code block also sits in the rule the
 * model reads, so it is a floor a model has to clear; an eval case is code
 * the model has not seen, the way a check's is.
 */
export class Evaluation {
	private constructor(
		private rules: readonly Rule[],
		/** Each example, with the one call that asks about it. */
		private examples: readonly { example: Example; call: Call }[],
	) {}

	/** Every case of every rule a model judges; `effort: none` rules have no model to judge. */
	static async prepare(opts: EvaluationOptions): Promise<Evaluation> {
		const fs = opts.fs ?? new NodeFs();
		const judged = opts.rules.filter((rule) => rule.effort !== "none");
		const examples: { example: Example; call: Call }[] = [];
		for (const rule of judged) {
			const effort = rule.effort as Exclude<Effort, "none">;
			const cases = [
				...(await Evaluation.cases(opts.dir, rule, fs)),
				...Evaluation.examples(rule),
			];
			for (const example of cases) {
				const lines = example.code.split("\n");
				const [call] = Call.plan({
					effort,
					rules: [rule],
					file: {
						file: {
							path: example.path,
							diff: [
								`@@ -0,0 +1,${lines.length} @@`,
								...lines.map((line) => `+${line}`),
							].join("\n"),
						},
						text: example.code,
						candidates: new Map(),
					},
				});
				if (call !== undefined) {
					examples.push({ example, call });
				}
			}
		}
		return new Evaluation(judged, examples);
	}

	/** The files in a rule's `evals/`, in name order. */
	static async cases(dir: string, rule: Rule, fs: Fs): Promise<Example[]> {
		const cases: Example[] = [];
		for (const path of rule.evals) {
			const file = path.split("/").at(-1) ?? "";
			const match = EVAL_FILE.exec(file);
			const kind = match?.groups?.kind;
			if (kind !== "good" && kind !== "bad") {
				continue; // Rule.parse refuses these
			}
			cases.push({
				rule: rule.id,
				kind,
				source: `evals/${file}`,
				path: `${match?.groups?.name}${match?.groups?.ext ?? ""}`,
				code: await fs.read(`${dir}/${path}`),
			});
		}
		return cases;
	}

	/** The code blocks under a rule's `## Good` and `## Bad`, in that order. */
	static examples(rule: Rule): Example[] {
		const md = Markdown.parse(rule.document);
		return (["good", "bad"] as const).flatMap((kind) =>
			md.has(kind)
				? md
						.section(kind)
						.codeBlocks()
						.map((block, index) => ({
							rule: rule.id,
							kind,
							source: `RULE.md ${kind} ${index + 1}`,
							path: `example.${block.lang || "txt"}`,
							code: block.code,
						}))
				: [],
		);
	}

	/** The efforts the examples need a judge for. */
	get efforts(): Set<Effort> {
		return new Set(this.examples.map(({ call }) => call.effort));
	}

	/** How many examples there are to judge. */
	get size(): number {
		return this.examples.length;
	}

	/** Judges every example, `jobs` at a time. */
	async run(opts: EvaluationRunOptions): Promise<EvaluationReport> {
		for (const effort of this.efforts) {
			if (!opts.judges.has(effort)) {
				throw new Error(`no judge for effort ${effort}`);
			}
		}
		const judged = new Map<Example, JudgedExample>();
		const unchecked: Unchecked[] = [];
		const used: Usage[] = [];
		const queue = [...this.examples];
		const worker = async (): Promise<void> => {
			for (
				let next = queue.shift();
				next !== undefined && !opts.signal?.aborted;
				next = queue.shift()
			) {
				const { example, call } = next;
				try {
					const verdict = await (opts.judges.get(call.effort) as Judge).judge(
						call.judgment,
						{ signal: opts.signal },
					);
					if (verdict.input !== undefined) {
						used.push({ input: verdict.input });
					}
					const answers = call.answers(verdict);
					const probability = Math.max(
						...answers.map((answer) => answer.probability),
					);
					const threshold = answers[0]?.rule.threshold ?? 0.7;
					judged.set(example, {
						...example,
						probability,
						right:
							example.kind === "bad"
								? probability >= threshold
								: probability < threshold,
					});
				} catch (error) {
					unchecked.push({
						subject: `${example.rule} ${example.source}`,
						reason: error instanceof Error ? error.message : String(error),
					});
				}
			}
		};
		await Promise.all(
			Array.from({ length: Math.max(1, opts.jobs) }, () => worker()),
		);
		return {
			rules: this.rules.map((rule) => ({
				rule: rule.id,
				effort: rule.effort as Exclude<Effort, "none">,
				threshold: rule.threshold,
				examples: this.examples
					.filter(({ example }) => example.rule === rule.id)
					.flatMap(({ example }) => judged.get(example) ?? []),
			})),
			unchecked,
			cancelled: opts.signal?.aborted ?? false,
			...(used.length === 0
				? {}
				: {
						usage: {
							calls: used.length,
							input: used.reduce((sum, usage) => sum + usage.input, 0),
						},
					}),
		};
	}
}
