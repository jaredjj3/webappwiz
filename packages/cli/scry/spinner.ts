import type { Progress } from "@webappwiz/scry";
import type { Resource } from "webappwiz/disposable";
import { color } from "webappwiz/log";
import { Duration, type Timer } from "webappwiz/time";
import { plural, type Spent } from "./project-decider";
import type { Screen } from "./screen";

const ESC = "\u001B";
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
/** About ten redraws a second: enough to look alive, cheap to draw. */
const TICK = Duration.ms(100);

/** What a `Spinner` counts questions from: the decider the rules ask. */
export interface Asking {
	readonly spent: Spent;
	/** Of the questions asked, how many the model has answered. */
	readonly answered: number;
}

export interface SpinnerOptions {
	screen: Screen;
	timer: Timer;
	/** How far the work has got. */
	progress: Progress;
	decider: Asking;
	/** What the work is doing, as `checking`. */
	verb: string;
	/** What it counts, as `file`. */
	noun: string;
}

/**
 * One line on a live screen while a check runs: a spinner, how many of the
 * files are done, and what the decider has asked. It reads the counts on its
 * own timer, so the work never waits on it, and draws nothing at all where
 * the screen is not live. `start` before the work; `dispose` before printing
 * anything else, which erases the line.
 */
export class Spinner implements Resource {
	private ticker: Resource | undefined;
	private frame = 0;
	private drawn = false;

	constructor(private opts: SpinnerOptions) {}

	start(): void {
		if (!this.opts.screen.live || this.ticker !== undefined) {
			return;
		}
		// not drawn until the first tick, so a check that is done by then,
		// answered from the cache, never flashes a line
		this.ticker = this.opts.timer.setInterval(() => this.draw(), TICK);
	}

	/** What the line says now, without the spinner. */
	text(): string {
		const { progress, decider, verb, noun } = this.opts;
		const { questions, cached } = decider.spent;
		const asked = [
			...(questions === 0
				? []
				: [
						`${questions} ${plural(questions, "question")} asked, ${decider.answered} answered`,
					]),
			...(cached === 0 ? [] : [`${cached} from cache`]),
		];
		const done = `${verb} ${progress.done} of ${progress.total} ${plural(progress.total, noun)}`;
		return asked.length === 0 ? done : `${done} · ${asked.join(", ")}`;
	}

	dispose(): void {
		this.ticker?.dispose();
		this.ticker = undefined;
		if (this.drawn) {
			this.opts.screen.write(`\r${ESC}[K`);
			this.drawn = false;
		}
	}

	private draw(): void {
		// a line that wraps is two rows, and the next frame would only redraw one
		const room = Math.max(0, this.opts.screen.columns - 3);
		const frame = FRAMES[this.frame % FRAMES.length] ?? "";
		this.opts.screen.write(
			`\r${color.blue(frame)} ${color.dim(this.text().slice(0, room))}${ESC}[K`,
		);
		this.frame++;
		this.drawn = true;
	}
}
