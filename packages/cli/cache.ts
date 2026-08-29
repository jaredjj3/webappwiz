import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import type { FileRule } from "@webappwiz/rules";
import type { Fs } from "webappwiz/system";
import { NodeFs } from "webappwiz/system";

const FILE = join(".wiz", "judge-cache.json");

// Sixteen hex characters: this decides "same bytes or not", not authenticity,
// and short digests keep the file readable in a diff.
const hash = (text: string): string =>
	createHash("sha256").update(text).digest("hex").slice(0, 16);

/** What the file on disk holds: per rule, the hash of its document when the
 * verdicts were taken, and per file the content hash that was judged clean. */
type Stored = Record<string, { doc: string; files: Record<string, string> }>;

/** What a `JudgeCache` reads and writes through; the real one by default. */
export interface JudgeCacheOptions {
	fs?: Fs;
}

/**
 * The clean verdicts of past runs, so a file that has not changed since a rule
 * last found nothing in it is never judged for that rule again.
 *
 * A verdict is pinned to the hash of the file as the plan read it and to the
 * hash of the rule's document: editing either one is what re-judges. A missing
 * or unreadable cache is empty rather than an error, because the cache is a
 * convenience and losing it costs a re-judge, not a run.
 */
export class JudgeCache {
	/** Escalations answered clean so far, for the plan to report. */
	hits = 0;

	// Hashes memoized as `clean` is asked, so `record` hashes what the plan
	// read rather than re-reading a file an agent may since have edited.
	private hashed = new Map<string, string>();

	private constructor(
		private path: string,
		private fs: Fs,
		private stored: Stored,
	) {}

	static async load(
		root: string,
		opts: JudgeCacheOptions = {},
	): Promise<JudgeCache> {
		const fs = opts.fs ?? new NodeFs();
		const path = join(root, FILE);
		let stored: Stored = {};
		try {
			const parsed: unknown = JSON.parse(await fs.read(path));
			if (typeof parsed === "object" && parsed !== null) {
				stored = parsed as Stored;
			}
		} catch {
			// no cache yet, or one too broken to read: judge everything
		}
		return new JudgeCache(path, fs, stored);
	}

	/** Whether this file was judged clean for this rule last time, with both
	 * the file and the rule's document unchanged since. */
	clean(rule: FileRule, file: string, text: string): boolean {
		const digest = hash(text);
		this.hashed.set(file, digest);
		const entry = this.stored[rule.id];
		if (entry === undefined || entry.doc !== hash(rule.document)) {
			return false; // the rule changed, so its old verdicts say nothing
		}
		const hit = entry.files[file] === digest;
		if (hit) {
			this.hits += 1;
		}
		return hit;
	}

	/** Remembers this file as clean for this rule, as its content was when the
	 * plan read it. A file the plan never hashed records nothing. */
	record(rule: FileRule, file: string): void {
		const digest = this.hashed.get(file);
		if (digest === undefined) {
			return;
		}
		const doc = hash(rule.document);
		const entry = this.stored[rule.id];
		const kept =
			entry !== undefined && entry.doc === doc ? entry : { doc, files: {} };
		kept.files[file] = digest;
		this.stored[rule.id] = kept;
	}

	async save(): Promise<void> {
		await this.fs.mkdir(dirname(this.path));
		await this.fs.write(
			this.path,
			`${JSON.stringify(this.stored, null, "\t")}\n`,
		);
	}
}
