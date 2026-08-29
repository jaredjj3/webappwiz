import type { Resource } from "webappwiz/disposable";
import { color } from "webappwiz/log";
import {
	type Clock,
	Duration,
	SystemClock,
	SystemTimer,
	type Timer,
} from "webappwiz/time";
import { compact, count, tokens } from "./report";

/**
 * Where live progress draws. `tty` is whether a block can be redrawn in
 * place: without one, judge stays line-by-line and never writes here.
 */
export interface Screen {
	tty: boolean;
	/** Columns a line may use before it is truncated. */
	width: number;
	write(text: string): void;
}

/** The terminal this process writes to. */
export const terminal = (): Screen => ({
	tty: process.stdout.isTTY === true,
	width: process.stdout.columns ?? 80,
	write: (text) => process.stdout.write(text),
});

/** One worker as the block shows it: what it is on, and what it has done. */
export interface WorkerView {
	/** 0-based slot; shown from 1, the way the report names workers. */
	worker: number;
	/** The review in flight, or undefined once the worker has run dry. */
	review?: {
		label: string;
		files: number;
		/** Tokens the plan can see in it, a floor on what the call reads. */
		reading: number;
		/** How long the call has been out, which is what says it is stuck. */
		elapsed: Duration;
	};
	/** Calls this worker has finished. */
	done: number;
	/** Tokens it has spent, when its agent reports usage. */
	tokens?: number;
}

/**
 * The block, one line per worker. Pure, so what the block says is testable
 * without a terminal: the `Progress` around it only draws and redraws it.
 */
export function render(views: WorkerView[], width: number): string[] {
	return views.map((view) => {
		const name = `w${view.worker + 1}`;
		const totals =
			view.done === 0
				? ""
				: `  ${count(view.done, "call")}${
						view.tokens === undefined
							? ""
							: `, ${compact.format(view.tokens)} tokens`
					}`;
		if (view.review === undefined) {
			return `${color.dim(name)}  ${color.gray(`idle${totals}`)}`;
		}
		const { label, files, reading, elapsed } = view.review;
		const meta = ` (${count(files, "file")}, ~${compact.format(reading)} tokens)  ${elapsed.human()}${totals}`;
		// Truncate the label rather than the line: the numbers on the right are
		// what a watcher reads, and a finding names its rule in full anyway.
		const room = Math.max(8, width - name.length - 2 - meta.length);
		const shown = label.length > room ? `${label.slice(0, room - 1)}…` : label;
		return `${color.dim(name)}  ${shown}${color.gray(meta)}`;
	});
}

/** What one worker is on right now, kept while its call is out. */
interface Working {
	label: string;
	files: number;
	reading: number;
	since: Duration;
}

/** What a `Progress` reads the time through; the real ones by default. */
export interface ProgressOptions {
	clock?: Clock;
	timer?: Timer;
}

/**
 * The live block a run draws while agents are out: one line per worker with
 * the review it is on, how long it has been on it, and what it has done so
 * far. Redraws on every event and once a second, so the clocks tick between
 * events; `stop` takes the block down, and whatever prints next lands where
 * it was.
 */
export class Progress {
	private clock: Clock;
	private working = new Map<number, Working>();
	private totals = new Map<number, { done: number; tokens?: number }>();
	private drawn = 0;
	private ticking: Resource;

	constructor(
		private screen: Screen,
		opts: ProgressOptions = {},
	) {
		this.clock = opts.clock ?? new SystemClock();
		const timer = opts.timer ?? new SystemTimer();
		this.ticking = timer.setInterval(() => this.draw(), Duration.secs(1));
	}

	started(
		worker: number,
		review: { label: string; files: number; bytes: number },
	): void {
		this.working.set(worker, {
			label: review.label,
			files: review.files,
			reading: tokens(review.bytes),
			since: this.clock.now(),
		});
		this.draw();
	}

	finished(worker: number, spent?: number): void {
		this.working.delete(worker);
		const total = this.totals.get(worker) ?? { done: 0 };
		total.done += 1;
		if (spent !== undefined) {
			total.tokens = (total.tokens ?? 0) + spent;
		}
		this.totals.set(worker, total);
		this.draw();
	}

	/** Takes the block down for good; call it before printing the report. */
	stop(): void {
		this.ticking.dispose();
		this.erase();
	}

	private views(): WorkerView[] {
		const workers = [
			...new Set([...this.working.keys(), ...this.totals.keys()]),
		].sort((left, right) => left - right);
		const now = this.clock.now();
		return workers.map((worker) => {
			const working = this.working.get(worker);
			return {
				worker,
				review: working && {
					label: working.label,
					files: working.files,
					reading: working.reading,
					elapsed: now.subtract(working.since),
				},
				done: this.totals.get(worker)?.done ?? 0,
				tokens: this.totals.get(worker)?.tokens,
			};
		});
	}

	private erase(): void {
		if (this.drawn > 0) {
			// up over the block, to the line's start, and clear to screen end
			this.screen.write(`\x1b[${this.drawn}A\r\x1b[0J`);
			this.drawn = 0;
		}
	}

	private draw(): void {
		const lines = render(this.views(), this.screen.width);
		this.erase();
		this.screen.write(lines.map((line) => `${line}\n`).join(""));
		this.drawn = lines.length;
	}
}
