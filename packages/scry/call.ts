import type { ChangedFile } from "./git";
import { ignored } from "./ignores";
import type { Judgment, Noul, Verdict } from "./judge";
import type { Effort, Level, Rule } from "./rule";
import type { Candidate } from "./scripts";

/** One thing a check found. */
export interface Finding {
	file: string;
	line: number;
	level: Level;
	/** The id of the rule it breaks. */
	rule: string;
	message: string;
	/**
	 * How sure the model is that the line breaks the rule, from 0 to 1; 1 for
	 * what a script of an `effort: none` rule found.
	 */
	probability: number;
}

/** What a judge said about one question of a call, reported or not. */
export interface Answer {
	rule: Rule;
	line: number;
	/** The rule's description, or a script's message for a line it flagged. */
	message: string;
	/** How sure the judge is that the line breaks the rule, from 0 to 1. */
	probability: number;
}

/** One file of a call: its change, its text, and what scripts flagged in it. */
export interface CallFile {
	file: ChangedFile;
	/** The file's whole text. */
	text: string;
	/** What the rules' scripts printed for this file, by rule id. */
	candidates: Map<string, Candidate[]>;
}

/** Everything the calls for one file need: the file, and the rules of one effort it matches. */
export interface CallOptions {
	effort: Exclude<Effort, "none">;
	rules: Rule[];
	file: CallFile;
}

/** What one question asks about, so its answer can become a finding. */
interface Asked {
	rule: Rule;
	line: number;
	message: string;
	question: Noul;
}

/** The most questions one judgment holds; Clef takes no more. */
const QUESTIONS = 64;

const CRITERIA = {
	true: "The lines do what the rule forbids, or leave out what it requires.",
	false: "The lines follow the rule, or the rule does not apply to them.",
};

/**
 * One judgment about one file: its text, its diff, and the rules it matches
 * of one effort, with a yes-or-no question for each rule and each run of
 * lines the change added, and one for each line a rule's script flagged. A
 * model answers with how likely each is to break its rule, so no text has to
 * be read back and nothing is generated.
 */
export class Call {
	private constructor(
		readonly file: string,
		readonly effort: Exclude<Effort, "none">,
		readonly judgment: Judgment,
		private asked: Map<string, Asked>,
	) {}

	/**
	 * The calls a file takes: none when nothing it added is left to judge, and
	 * more than one when it has more questions than a judgment holds.
	 * Lines and files a `scry-ignore` comment excuses from a rule are never
	 * asked about.
	 */
	static plan(opts: CallOptions): Call[] {
		const { file, text, candidates } = opts.file;
		const added = addedLines(file.diff);
		const asked: Asked[] = [];
		for (const rule of opts.rules) {
			const judged = added.filter((line) => !ignored(text, rule.id, line));
			for (const [first, last] of runs(judged)) {
				const lines =
					first === last ? `line ${first}` : `lines ${first} to ${last}`;
				asked.push({
					rule,
					line: first,
					message: rule.description,
					question: {
						type: "noul",
						instructions: `Does the change break the rule in \`rules["${rule.id}"]\` at ${lines} of \`file\`, which it added? Judge them in the context of the whole file.`,
						criteria: CRITERIA,
					},
				});
			}
			for (const candidate of candidates.get(rule.id) ?? []) {
				if (ignored(text, rule.id, candidate.line)) {
					continue;
				}
				asked.push({
					rule,
					line: candidate.line,
					message: candidate.message,
					question: {
						type: "noul",
						instructions: `A script flagged line ${candidate.line} of \`file\`: "${candidate.message}". Does that line break the rule in \`rules["${rule.id}"]\`?`,
						criteria: CRITERIA,
					},
				});
			}
		}
		const calls: Call[] = [];
		for (let start = 0; start < asked.length; start += QUESTIONS) {
			const chunk = asked.slice(start, start + QUESTIONS);
			const ids = new Map(chunk.map((item, index) => [`q${index}`, item]));
			// only the rules this judgment asks about, each once
			const rules = new Map(
				chunk.map(({ rule }) => [rule.id, rule.document.trim()]),
			);
			const judgment: Judgment = {
				state: {
					path: file.path,
					file: numbered(text),
					diff: file.diff.trim(),
					rules: Object.fromEntries(rules),
				},
				questions: Object.fromEntries(
					[...ids].map(([id, { question }]) => [id, question]),
				),
			};
			calls.push(new Call(file.path, opts.effort, judgment, ids));
		}
		return calls;
	}

	/** What the judgment costs to send, roughly: four characters a token. */
	get tokens(): number {
		return Math.ceil(JSON.stringify(this.judgment).length / 4);
	}

	/**
	 * Every question's answer in a verdict, in the order they were asked.
	 * Throws when one went unanswered, since a missing answer says nothing
	 * about the file.
	 */
	answers(verdict: Verdict): Answer[] {
		return [...this.asked].map(([id, { rule, line, message }]) => {
			const probability = verdict.answers.get(id);
			if (probability === undefined) {
				throw new Error(
					`the verdict answered ${verdict.answers.size} of ${this.asked.size} questions`,
				);
			}
			return { rule, line, message, probability };
		});
	}

	/**
	 * The findings in a verdict: each answer at or above its rule's
	 * threshold, one a rule and line, the likeliest kept.
	 */
	findings(verdict: Verdict): Finding[] {
		const found = new Map<string, Finding>();
		for (const { rule, line, message, probability } of this.answers(verdict)) {
			const key = `${rule.id}\0${line}`;
			const kept = found.get(key);
			if (
				probability >= rule.threshold &&
				(kept === undefined || probability > kept.probability)
			) {
				found.set(key, {
					file: this.file,
					line,
					level: rule.level,
					rule: rule.id,
					message,
					probability,
				});
			}
		}
		return [...found.values()];
	}
}

/** The lines of the new file a diff added, 1-based, in order. */
function addedLines(diff: string): number[] {
	const added: number[] = [];
	let line: number | undefined;
	for (const text of diff.split("\n")) {
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
		if (hunk) {
			line = Number(hunk[1]);
		} else if (line === undefined || text.startsWith("\\")) {
			// the header before the first hunk, or "\ No newline at end of file"
		} else if (text.startsWith("+")) {
			added.push(line++);
		} else if (!text.startsWith("-")) {
			line++;
		}
	}
	return added;
}

/** Ascending lines grouped into runs of neighbors, each as its first and last. */
function runs(lines: number[]): [number, number][] {
	const found: [number, number][] = [];
	for (const line of lines) {
		const last = found.at(-1);
		if (last !== undefined && last[1] === line - 1) {
			last[1] = line;
		} else {
			found.push([line, line]);
		}
	}
	return found;
}

function numbered(text: string): string {
	return text
		.split("\n")
		.map((line, index) => `${String(index + 1).padStart(5)}| ${line}`)
		.join("\n");
}
