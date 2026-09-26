import { z } from "zod";
import type { ChangedFile } from "./git";
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
}

/** One file of a call: its change, its text, and what scripts flagged in it. */
export interface CallFile {
	file: ChangedFile;
	/** The file's whole text. */
	text: string;
	/** What the rules' scripts printed for this file, by rule id. */
	candidates: Map<string, Candidate[]>;
}

/** Everything one agent call needs: some files, and the rules of one effort they match. */
export interface CallOptions {
	effort: Exclude<Effort, "none">;
	rules: Rule[];
	files: CallFile[];
}

const REPLY = z.array(
	z.object({
		file: z.string().optional(),
		rule: z.string(),
		line: z.number().int().positive(),
		message: z.string(),
	}),
);

/**
 * One prompt to one agent: some files, and every rule of one effort that
 * matches them all, so the agent reads the rules once and judges each file
 * against every one of them. The prompt holds everything the agent needs, so
 * it needs no tools and can be any model that reads text.
 */
export class Call {
	readonly files: readonly string[];
	readonly effort: Exclude<Effort, "none">;
	readonly prompt: string;
	private rules: Rule[];

	constructor(opts: CallOptions) {
		this.files = opts.files.map((file) => file.file.path);
		this.effort = opts.effort;
		this.rules = opts.rules;
		this.prompt = prompt(opts);
	}

	/** What the prompt costs to send, roughly: four characters a token. */
	get tokens(): number {
		return Math.ceil(this.prompt.length / 4);
	}

	/**
	 * The findings in an agent's reply: the last JSON array in it, so talk
	 * around the array is fine. Throws when there is no such array, since an
	 * answer that cannot be read says nothing about the files.
	 */
	findings(reply: string): Finding[] {
		const parsed = REPLY.safeParse(lastArray(reply));
		if (!parsed.success) {
			throw new Error("the reply held no JSON array of findings");
		}
		const levels = new Map(this.rules.map((rule) => [rule.id, rule.level]));
		const only = this.files.length === 1 ? this.files[0] : undefined;
		return parsed.data.flatMap(({ rule, line, message, ...rest }) => {
			const level = levels.get(rule);
			const file = rest.file ?? only;
			// a rule or file this call did not ask about is the agent wandering off
			return level === undefined ||
				file === undefined ||
				!this.files.includes(file)
				? []
				: [{ file, line, level, rule, message }];
		});
	}
}

function prompt(opts: CallOptions): string {
	const rules = opts.rules.map(
		(rule) =>
			`<rule id="${rule.id}" level="${rule.level}">\n${rule.document.trim()}\n</rule>`,
	);
	const files = opts.files.flatMap(({ file, text }) => [
		`<file path="${file.path}">`,
		text
			.split("\n")
			.map((line, index) => `${String(index + 1).padStart(5)}| ${line}`)
			.join("\n"),
		"</file>",
		"",
		`<diff path="${file.path}">`,
		file.diff.trim(),
		"</diff>",
		"",
	]);
	const candidates = opts.files.flatMap(({ file, candidates }) =>
		[...candidates].flatMap(([rule, found]) =>
			found.map(
				(candidate) =>
					`- ${rule}, ${file.path} line ${candidate.line}: ${candidate.message}`,
			),
		),
	);
	return [
		"Check the files of a change against the coding rules below. Each rule",
		"says what it wants; judge by what it says and nothing else.",
		"",
		...rules,
		"",
		...files,
		...(candidates.length === 0
			? []
			: [
					"These rules' scripts flagged the lines below. Judge each against its",
					"rule before reporting it, and look past them for what a script cannot see:",
					"",
					...candidates,
					"",
				]),
		"Judge the lines each diff changed, in the context of the whole file. A",
		"comment holding `scry-ignore <rule>: <reason>` excuses the statement under",
		"it from that rule, and `scry-ignore-file <rule>: <reason>` excuses the file.",
		"The older spellings, `rule-ignore` and `rule-ignore-file`, count the same.",
		"",
		"Reply with a JSON array, one object a finding, and nothing after it:",
		'[{"file": "<file path>", "rule": "<rule id>", "line": <line number>, "message": "<what is wrong, in one short sentence>"}]',
		"Reply [] when the changed lines break none of these rules.",
	].join("\n");
}

/**
 * The last JSON array in `text`, or undefined. It ends at the last `]`, and
 * starts at the first `[` before it that makes the slice parse, which is the
 * outermost array rather than the last element of it.
 */
function lastArray(text: string): unknown {
	const end = text.lastIndexOf("]");
	for (let start = text.indexOf("["); start !== -1 && start < end; ) {
		try {
			return JSON.parse(text.slice(start, end + 1));
		} catch {
			start = text.indexOf("[", start + 1);
		}
	}
	return undefined;
}
