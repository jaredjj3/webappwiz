import { join } from "node:path";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import type { Fs, Glob } from "webappwiz/system";
import { NodeFs, NodeGlob, walk } from "webappwiz/system";
import { Checker } from "./checker";
import type { Finding } from "./finding";
import { exemptions } from "./ignore";
import { prompt } from "./prompt";
import type { Review } from "./review";
import type { FileRule, Level } from "./rule";

/** One agent call over files: the harness's review, plus what was chosen for it. */
export interface FileReview extends Review {
	rules: FileRule[];
	/** The files this review's prompt tells the agent to read, dir-relative. */
	files: string[];
	/** Always priced: the size of every file named is known here. */
	bytes: number;
}

/** One rule broken in one place, as the report prints it. */
export interface Violation {
	/** The rule's referenceable id, as `rules ls` lists it. */
	id: string;
	level: Level;
	/** Path as the caller would type it: the judged dir plus the file. */
	file: string;
	line: number;
	/** How this code breaks the rule. Never what to do about it. */
	message: string;
	/** That line of the file, read from disk rather than from the agent. */
	code: string;
}

/** Answers whether a rule's escalation was already judged clean on these
 * exact bytes; where the verdicts live is the caller's business. */
export interface CleanCache {
	clean(rule: FileRule, file: string, text: string): boolean;
}

/** How much of the tree a run covers, and how finely it is cut up. */
export interface PlanOptions {
	/** Files per review, on average: it sets how many reviews a group becomes,
	 * and the files spread over them by size, so a review of big files carries
	 * fewer of them. */
	chunk?: number;
	/**
	 * Narrows the run to these files, named the way the globs are, for a caller
	 * checking a subset of the tree rather than all of it. A rule matching
	 * nothing left in it is still worth saying so.
	 */
	only?: Set<string>;
	/** Past clean verdicts, so an unchanged file is not judged again. */
	cache?: CleanCache;
}

/** Files per review when a caller does not say. */
export const DEFAULT_CHUNK = 25;

/**
 * Turns a directory and a set of rules into reviews the harness can run, and the
 * findings that come back into violations a report can print.
 *
 * Everything file-shaped lives here: choosing the files, chunking them,
 * honoring `rule-ignore` markers and quoting the offending line off disk. The
 * harness underneath knows none of it, and this does not wrap it: a caller
 * plans here, runs there, and turns the findings back here.
 */
/** What a `Files` reads through; the real ones by default. */
export interface FilesOptions {
	log?: Logger;
	fs?: Fs;
	glob?: Glob;
}

export class Files {
	// Every file the plan read, by dir-relative path, so turning findings into
	// violations needs no second pass over the disk. Planning has already read
	// exactly the files the agent is told to look at.
	private lines = new Map<string, string[]>();

	private log: Logger;
	private fs: Fs;
	private glob: Glob;

	constructor(opts: FilesOptions = {}) {
		this.log = opts.log ?? new ConsoleLogger();
		this.fs = opts.fs ?? new NodeFs();
		this.glob = opts.glob ?? new NodeGlob();
	}

	/**
	 * The reviews a run would spawn, without spawning any of them. Planning runs
	 * every rule's check first, free, and builds reviews from exactly what those
	 * checks escalated: the agent reads the files no check could settle, and
	 * nothing else. What the checks found locally is `wiz fix`'s report, not
	 * this run's, and is dropped here.
	 */
	async plan(
		rules: FileRule[],
		dir: string,
		{ chunk = DEFAULT_CHUNK, only, cache }: PlanOptions = {},
	): Promise<FileReview[]> {
		const checker = new Checker(rules, { glob: this.glob });
		const all: string[] = [];
		const size = new Map<string, number>();
		const files: Array<{ path: string; text: string }> = [];
		for await (const path of walk(dir, { fs: this.fs })) {
			const file = path.slice(dir.length + 1); // dir-relative, like the globs
			if (only && !only.has(file)) {
				continue;
			}
			all.push(file);
			if (!checker.matches(file)) {
				continue;
			}
			size.set(file, (await this.fs.stat(path)).size);
			const text = await this.fs.read(path);
			this.lines.set(file, text.split("\n"));
			files.push({ path: file, text });
		}
		files.sort((left, right) => left.path.localeCompare(right.path));
		const { escalations } = checker.check(files);
		const texts = new Map(files.map((file) => [file.path, file.text]));
		// Seeded in rule order, so reviews land in the order the config lists the
		// rules rather than the order the walk found their files.
		const wanted = new Map<FileRule, string[]>(rules.map((rule) => [rule, []]));
		for (const { rule, path } of escalations) {
			if (cache?.clean(rule, path, texts.get(path) ?? "")) {
				continue;
			}
			wanted.get(rule)?.push(path);
		}
		for (const rule of rules) {
			if (!all.some((file) => this.glob.matches(rule.files, file))) {
				// stderr, so the report on stdout stays parseable
				this.log.error(`rule "${rule.id}" matches no files under ${dir}`);
			}
		}
		// Rules escalating the same files ride in one review: the files are what a
		// review costs, and they are read once, not once per rule.
		const groups = new Map<string, { rules: FileRule[]; files: string[] }>();
		for (const [rule, escalated] of wanted) {
			if (escalated.length === 0) {
				continue;
			}
			const key = escalated.join("\n");
			const group = groups.get(key) ?? { rules: [], files: escalated };
			group.rules.push(rule);
			groups.set(key, group);
		}
		const reviews: FileReview[] = [];
		for (const group of groups.values()) {
			// As many reviews as slicing by count would have made, but balanced by
			// bytes rather than cut in walk order: one review of big files would
			// otherwise hold the run open after every other worker went idle.
			// Biggest file to the lightest review each time gets them even enough.
			const bins = Array.from(
				{ length: Math.ceil(group.files.length / chunk) },
				() => ({ files: [] as string[], bytes: 0 }),
			);
			const bySize = [...group.files].sort(
				(left, right) => (size.get(right) ?? 0) - (size.get(left) ?? 0),
			);
			for (const file of bySize) {
				const bin = bins.reduce((least, candidate) =>
					candidate.bytes < least.bytes ? candidate : least,
				);
				bin.files.push(file);
				bin.bytes += size.get(file) ?? 0;
			}
			for (const bin of bins) {
				if (bin.files.length === 0) {
					// Every file was weightless, so the first bin took them all.
					continue;
				}
				// Back in path order: the agent reads a directory listing, not a
				// ranking by size.
				const slice = bin.files.sort((left, right) =>
					left.localeCompare(right),
				);
				const draft: Omit<FileReview, "bytes"> = {
					rules: group.rules,
					label: group.rules.map((rule) => rule.id).join(", "),
					files: slice,
					context: [
						"Check each of these files, relative to your working directory:",
						slice.map((file) => `- ${file}`).join("\n"),
					].join("\n\n"),
					instructions: MARKERS,
				};
				reviews.push({
					...draft,
					bytes: slice.reduce(
						(bytes, file) => bytes + (size.get(file) ?? 0),
						Buffer.byteLength(prompt(draft)),
					),
				});
			}
		}
		// Heaviest first: the longest calls start immediately, with the quick ones
		// filling in around them, instead of one late straggler ending the run.
		return reviews.sort((left, right) => right.bytes - left.bytes);
	}

	/**
	 * What one review's findings mean, ready to print. Sync, so a caller can turn
	 * them around inside a `finished` handler the moment the agent returns.
	 */
	violations(
		review: FileReview,
		findings: Finding[],
		dir: string,
	): Violation[] {
		const violations: Violation[] = [];
		for (const finding of findings) {
			const rule = review.rules.find(
				(candidate) => candidate.id === finding.rule,
			);
			if (!rule) {
				continue; // the harness already said so, and dropped it
			}
			if (finding.file === undefined || finding.line === undefined) {
				// These rules are all about somewhere in particular, so a finding with
				// nowhere to point is one nobody can act on.
				this.log.error(
					`agent located no file for "${finding.rule}" on ${review.label}`,
				);
				continue;
			}
			const source = this.lines.get(finding.file);
			if (source === undefined) {
				// The review named the files to read, and the plan read every one of
				// them. A finding somewhere else is one nothing here can quote or
				// check a marker against, so it is said aloud rather than reported.
				this.log.error(
					`agent reported "${finding.rule}" in ${finding.file}, which ${review.label} was not given`,
				);
				continue;
			}
			// The prompt asks the agent to honor markers; this is what enforces it.
			if (exemptions(source, rule.id)(finding.line)) {
				continue;
			}
			violations.push({
				id: rule.id,
				level: rule.level,
				file: join(dir, finding.file),
				line: finding.line,
				message: finding.message,
				// From disk, not from the agent: the quoted line is the reader's
				// evidence, and evidence a model wrote is no evidence at all.
				code: source[finding.line - 1]?.trim() ?? "",
			});
		}
		return violations.sort(cmp);
	}
}

/** What the prompt says about `rule-ignore`, which is this caller's
 * convention and no business of the harness's. */
const MARKERS = [
	"Code excuses itself from a rule with a comment naming that rule's id:",
	"",
	"- `rule-ignore <id>: <reason>` excuses the line it sits above, " +
		"and everything indented under that line.",
	"- `rule-ignore-file <id>: <reason>` excuses the whole file.",
	"",
	"Report nothing an excused line does against the rule the marker names. " +
		"A marker excuses only that one rule, and a marker naming an id not " +
		"listed above excuses nothing here.",
].join("\n");

const cmp = (left: Violation, right: Violation): number =>
	left.file.localeCompare(right.file) || left.line - right.line;
