import type { Resource } from "webappwiz/disposable";
import { color } from "webappwiz/log";
import { Duration, SystemTimer, type Timer } from "webappwiz/time";
import { compact } from "./report";

/**
 * Where live progress draws. `tty` is whether a line can be redrawn in
 * place: without one, judge stays line-by-line and never writes here.
 */
export interface Screen {
	tty: boolean;
	write(text: string): void;
}

/** The terminal this process writes to. */
export const terminal = (): Screen => ({
	tty: process.stdout.isTTY === true,
	write: (text) => process.stdout.write(text),
});

/** A run as the status line shows it: how far along, and what it has spent. */
export interface RunView {
	/** Calls finished. */
	done: number;
	/** Calls the run will make in all. */
	total: number;
	/** Calls out right now. */
	running: number;
	/** Tokens spent so far, when any agent has reported usage. */
	tokens?: number;
}

const BAR = 20;

/** The spinner's walk, one step per tick while any call is out. */
export const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * The status line. Pure, so what it says is testable without a terminal:
 * the `Progress` around it only draws and redraws it. `frame` indexes the
 * spinner's walk; with nothing running there is nothing to spin.
 */
export function render(view: RunView, frame = 0): string {
	const spin =
		view.running === 0 ? " " : (FRAMES[frame % FRAMES.length] ?? " ");
	const filled = Math.round((BAR * view.done) / Math.max(1, view.total));
	const bar =
		color.green("█".repeat(filled)) + color.dim("░".repeat(BAR - filled));
	const spent =
		view.tokens === undefined ? "" : ` · ${compact.format(view.tokens)} tokens`;
	return `${color.green(spin)} ${bar}  ${color.gray(
		`${view.done}/${view.total} calls · ${view.running} running${spent}`,
	)}`;
}

/** What a `Progress` paces its spinner with; the real one by default. */
export interface ProgressOptions {
	timer?: Timer;
}

/**
 * The live line a run draws while agents are out: progress over the calls
 * and the tokens they have spent, redrawn on every event and spun on a
 * tick between them. `stop` takes the line down, and whatever prints next
 * lands where it was.
 */
export class Progress {
	private done = 0;
	private running = 0;
	private tokens: number | undefined;
	private drawn = false;
	private frame = 0;
	private ticking: Resource;

	constructor(
		private screen: Screen,
		private total: number,
		opts: ProgressOptions = {},
	) {
		const timer = opts.timer ?? new SystemTimer();
		this.ticking = timer.setInterval(() => {
			this.frame += 1;
			this.draw();
		}, Duration.ms(100));
	}

	started(): void {
		this.running += 1;
		this.draw();
	}

	finished(spent?: number): void {
		this.running -= 1;
		this.done += 1;
		if (spent !== undefined) {
			this.tokens = (this.tokens ?? 0) + spent;
		}
		this.draw();
	}

	/** Takes the line down for good; call it before printing the report. */
	stop(): void {
		this.ticking.dispose();
		this.erase();
	}

	private erase(): void {
		if (this.drawn) {
			// up over the line, to its start, and clear to screen end
			this.screen.write("\x1b[1A\r\x1b[0J");
			this.drawn = false;
		}
	}

	private draw(): void {
		const line = render(
			{
				done: this.done,
				total: this.total,
				running: this.running,
				tokens: this.tokens,
			},
			this.frame,
		);
		this.erase();
		this.screen.write(`${line}\n`);
		this.drawn = true;
	}
}
