import { type Decider, pointing, state } from "./decider";
import type { Judge, Noul } from "./judge";
import type { SourceFile, Span } from "./source-file";

/** The most questions one request asks; Clef's limit. */
const QUESTIONS = 64;

interface Pending {
	question: string;
	about: Span;
	resolve: (probability: number) => void;
	reject: (error: unknown) => void;
}

/** What a batching decider has spent so far. */
export interface DeciderUsage {
	/** Requests sent to the model. */
	requests: number;
	/** Questions those requests asked. */
	questions: number;
	/** Input tokens they spent, as far as the model reports them. */
	input: number;
}

export interface BatchedDeciderOptions {
	/** The most questions one request asks; 64 by default. */
	questions?: number;
	/** The most requests out at once; 8 by default. */
	jobs?: number;
	/** Stops it: nothing more goes out, and every question still waiting fails. */
	signal?: AbortSignal;
}

/**
 * A decider over a decision model that holds each question until everything
 * running has asked what it is going to, then asks the questions about each
 * file together: one request per file for up to 64 questions, rather than one
 * each. Rules that run at once ask at once, so a rule written as plain
 * `await`s still shares a request with every other rule reading the file.
 *
 * Only questions about one file share a request. Packing unrelated code into
 * one state blurred a model's answers toward their average (correlation 0.3
 * with asking alone, on Jev); questions about one file kept them (0.98).
 */
export class BatchedDecider implements Decider {
	readonly usage: DeciderUsage = { requests: 0, questions: 0, input: 0 };
	private pending: Pending[] = [];
	private scheduled = false;
	/** Requests ready to go, waiting for one of `jobs` to come back. */
	private queue: Pending[][] = [];
	private out = 0;
	private size: number;
	private jobs: number;

	constructor(
		private judge: Judge,
		private opts: BatchedDeciderOptions = {},
	) {
		this.size = opts.questions ?? QUESTIONS;
		this.jobs = Math.max(1, opts.jobs ?? 8);
	}

	decide(question: string, about: Span): Promise<number> {
		return new Promise((resolve, reject) => {
			if (this.opts.signal?.aborted) {
				reject(cancelled());
				return;
			}
			this.pending.push({ question, about, resolve, reject });
			if (!this.scheduled) {
				this.scheduled = true;
				// a macrotask, not a microtask: a rule that read a file or
				// parsed one before asking is still on its way here
				setTimeout(() => this.flush(), 0);
			}
		});
	}

	private flush(): void {
		this.scheduled = false;
		this.queue.push(...this.batches(this.pending));
		this.pending = [];
		this.send();
	}

	/** Sends what is queued, while fewer than `jobs` requests are out. */
	private send(): void {
		while (this.out < this.jobs && this.queue.length > 0) {
			const batch = this.queue.shift() ?? [];
			this.out++;
			void this.ask(batch).finally(() => {
				this.out--;
				this.send();
			});
		}
	}

	/** The waiting questions by file, in requests of at most `size` questions. */
	private batches(waiting: Pending[]): Pending[][] {
		const byFile = new Map<SourceFile, Pending[]>();
		for (const item of waiting) {
			byFile.set(item.about.file, [
				...(byFile.get(item.about.file) ?? []),
				item,
			]);
		}
		return [...byFile.values()].flatMap((items) =>
			Array.from({ length: Math.ceil(items.length / this.size) }, (_, index) =>
				items.slice(index * this.size, (index + 1) * this.size),
			),
		);
	}

	private async ask(batch: Pending[]): Promise<void> {
		const [first] = batch;
		if (first === undefined) {
			return;
		}
		if (this.opts.signal?.aborted) {
			for (const item of batch) {
				item.reject(cancelled());
			}
			return;
		}
		const questions: Record<string, Noul> = Object.fromEntries(
			batch.map((item, index) => [
				`q${index}`,
				{ type: "noul", instructions: pointing(item.question, item.about) },
			]),
		);
		this.usage.requests++;
		this.usage.questions += batch.length;
		try {
			// a request still out when the check is stopped fails then, whether
			// or not the judge gives up on it
			const verdict = await Promise.race([
				this.judge.judge(
					{ state: state(first.about), questions },
					{ signal: this.opts.signal },
				),
				aborted(this.opts.signal),
			]);
			this.usage.input += verdict.input ?? 0;
			batch.forEach((item, index) => {
				const answer = verdict.answers.get(`q${index}`);
				if (answer === undefined) {
					item.reject(new Error(`no answer to "${item.question}"`));
				} else {
					item.resolve(answer);
				}
			});
		} catch (error) {
			for (const item of batch) {
				item.reject(error);
			}
		}
	}
}

function cancelled(): Error {
	return new Error("cancelled");
}

/** Rejects once `signal` aborts; never, without one. */
function aborted(signal: AbortSignal | undefined): Promise<never> {
	return new Promise((_, reject) => {
		signal?.addEventListener("abort", () => reject(cancelled()), {
			once: true,
		});
	});
}
