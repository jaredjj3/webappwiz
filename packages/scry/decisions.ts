import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { type Fs, NodeFs } from "webappwiz/system";
import { SystemWallClock, type WallClock } from "webappwiz/time";
import { type Decider, pointing } from "./decider";
import type { Span } from "./source-file";

/** One answer a model gave, and what it was about. */
export interface Decision {
	/** The question as the rule asked it. */
	question: string;
	path: string;
	line: number;
	probability: number;
	model: string;
	/** A hash of the whole file it was asked about, so an edit retires it. */
	file: string;
	/** When it was asked, as an ISO time. */
	at: string;
}

/** How many decisions a store keeps, the most recent first. */
const KEPT = 10_000;

export interface DecisionsOptions {
	fs?: Fs;
}

/**
 * Every answer a decider gave, kept between runs in one JSON file: what
 * makes asking again about an unchanged file free, and what `scry why`
 * reads to say what decided a finding.
 */
export class Decisions {
	private constructor(
		private path: string,
		private byKey: Map<string, Decision>,
		private fs: Fs,
	) {}

	/** The decisions kept at `path`; none when it does not exist yet. */
	static async open(
		path: string,
		opts: DecisionsOptions = {},
	): Promise<Decisions> {
		const fs = opts.fs ?? new NodeFs();
		const text = await fs.read(path).catch((): null => null);
		// a cache that will not parse is a cache to start over, not an error
		const kept =
			text === null ? {} : (safeParse(text) as Record<string, Decision>);
		return new Decisions(path, new Map(Object.entries(kept)), fs);
	}

	/** A hash of a file's text, as decisions record it. */
	static fingerprint(text: string): string {
		return createHash("sha256").update(text).digest("hex").slice(0, 16);
	}

	get(key: string): Decision | undefined {
		return this.byKey.get(key);
	}

	put(key: string, decision: Decision): void {
		this.byKey.delete(key);
		this.byKey.set(key, decision);
	}

	/** What was decided about `line` of the file at `path` as it reads now. */
	about(path: string, text: string, line: number): Decision[] {
		const file = Decisions.fingerprint(text);
		return [...this.byKey.values()].filter(
			(decision) =>
				decision.path === path &&
				decision.file === file &&
				decision.line === line,
		);
	}

	/** Writes them back, keeping the most recent. */
	async save(): Promise<void> {
		const recent = [...this.byKey.entries()]
			.toSorted(([, left], [, right]) => right.at.localeCompare(left.at))
			.slice(0, KEPT);
		await this.fs.mkdir(dirname(this.path));
		await this.fs.write(this.path, JSON.stringify(Object.fromEntries(recent)));
	}
}

/**
 * A decider that answers from what it was told before about the same
 * question, the same line, and the same file to the byte, and asks the one it
 * wraps otherwise, keeping the answer.
 */
export class CachedDecider implements Decider {
	/** Answers given from the store. */
	hits = 0;

	constructor(
		private inner: Decider,
		private decisions: Decisions,
		/** The model behind `inner`, since another model's answer is not this one's. */
		private model: string,
		private clock: WallClock = new SystemWallClock(),
	) {}

	async decide(question: string, about: Span): Promise<number> {
		const file = Decisions.fingerprint(about.file.text);
		const key = createHash("sha256")
			.update(
				[this.model, pointing(question, about), about.file.path, file].join(
					"\0",
				),
			)
			.digest("hex");
		const known = this.decisions.get(key);
		if (known !== undefined) {
			this.hits++;
			return known.probability;
		}
		const probability = await this.inner.decide(question, about);
		this.decisions.put(key, {
			question,
			path: about.file.path,
			line: about.line,
			probability,
			model: this.model,
			file,
			at: new Date(this.clock.now()).toISOString(),
		});
		return probability;
	}
}

function safeParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return {};
	}
}
