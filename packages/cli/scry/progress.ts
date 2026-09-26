import type { Call, Check } from "@webappwiz/scry";
import type { Resource } from "webappwiz/disposable";
import type { Unlisten } from "webappwiz/events";
import { color, type Logger } from "webappwiz/log";
import { type Clock, Duration, type Timer } from "webappwiz/time";
import type { Screen } from "./screen";

const ESC = "\u001B";
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
/** Past this many calls, the view shows only those running or failed, and a tally. */
const ROWS = 20;

/** What a `Progress` draws on, and times the calls by. */
export interface ProgressOptions {
	screen: Screen;
	/** Where the plain lines go when the screen is not live. */
	log: Logger;
	clock: Clock;
	/** What ticks the spinner and the running times over. */
	timer: Timer;
}

/** Where one call has got to. */
interface State {
	started?: Duration;
	took?: Duration;
	/** Set once it is answered: what it found, by level. */
	found?: { errors: number; warnings: number };
	error?: string;
	cancelled?: boolean;
	/** What its agent last said it was doing. */
	status?: string;
}

/**
 * The calls of a running check, a line each. On a live screen the lines
 * redraw in place: queued, then a spinner and a running time, then how it
 * went. Anywhere else, one line as each call settles, so a log reads the
 * same. `start` before the check runs; `dispose` after, which leaves the
 * last frame on the screen.
 */
export class Progress implements Resource {
	private states: Map<Call, State>;
	private unlisten: Unlisten[];
	private ticker: Resource | undefined;
	/** How many lines the last frame took, to move back over. */
	private drawn = 0;
	private frame = 0;

	constructor(
		check: Check,
		private opts: ProgressOptions,
	) {
		this.states = new Map(check.calls.map((call) => [call, {}]));
		this.unlisten = [
			check.events.on("asked", ({ call }) => {
				this.state(call).started = opts.clock.now();
				this.draw();
			}),
			// the ticker redraws; a status can come many times a second
			check.events.on("status", ({ call, status }) => {
				this.state(call).status = status;
			}),
			check.events.on(
				"answered",
				({ call, done, findings, error, cancelled }) => {
					const state = this.state(call);
					if (state.started !== undefined) {
						state.took = opts.clock.now().subtract(state.started);
					}
					const errors = findings.filter(
						(finding) => finding.level === "error",
					).length;
					state.found = { errors, warnings: findings.length - errors };
					state.error = error;
					state.cancelled = cancelled;
					if (opts.screen.live) {
						this.draw();
					} else {
						const how = [
							...(state.took === undefined ? [] : [seconds(state.took)]),
							...(cancelled ? ["cancelled"] : []),
							...(error === undefined ? [] : ["failed"]),
						];
						opts.log.error(
							color.dim(
								`  [${done}/${this.states.size}] ${call.effort}: ${files(call)} (${how.join(", ")})`,
							),
						);
					}
				},
			),
		];
	}

	/** Shows `header`, then the calls. */
	start(header: string): void {
		if (!this.opts.screen.live) {
			this.opts.log.error(color.blue(header));
			return;
		}
		// straight to the screen: the logger's stderr is red on a terminal
		this.opts.screen.write(
			`${color.blue(header)}${color.dim(" · ctrl-c stops and reports what is in")}\n`,
		);
		this.draw();
		this.ticker = this.opts.timer.setInterval(() => {
			this.frame++;
			this.draw();
		}, Duration.ms(80));
	}

	dispose(): void {
		this.ticker?.dispose();
		this.ticker = undefined;
		for (const unlisten of this.unlisten) {
			unlisten();
		}
		this.draw();
	}

	/** What the live view shows now, a line a row. */
	lines(): string[] {
		const now = this.opts.clock.now();
		const all = [...this.states];
		if (all.length <= ROWS) {
			return all.map(([call, state]) => this.row(call, state, now));
		}
		const shown = all
			.filter(
				([, state]) =>
					state.error !== undefined ||
					(state.started !== undefined && state.found === undefined),
			)
			.slice(0, ROWS - 1);
		const count = (label: string, has: (state: State) => boolean) => {
			const counted = all.filter(([, state]) => has(state)).length;
			return counted === 0 ? [] : [`${counted} ${label}`];
		};
		const tally = [
			...count(
				"answered",
				(state) =>
					state.found !== undefined &&
					state.error === undefined &&
					!state.cancelled,
			),
			...count("cancelled", (state) => state.cancelled === true),
			...count(
				"queued",
				(state) => state.started === undefined && state.found === undefined,
			),
		];
		return [
			...shown.map(([call, state]) => this.row(call, state, now)),
			color.dim(`  ${tally.join(", ")}`),
		];
	}

	private row(call: Call, state: State, now: Duration): string {
		const [icon, note] = this.mark(state);
		const elapsed =
			state.took ??
			(state.started === undefined ? undefined : now.subtract(state.started));
		const text = `${call.effort.padEnd(6)} ${(elapsed === undefined ? "" : seconds(elapsed)).padStart(4)}  ${files(call)}`;
		// a line that wraps takes two rows, and the next frame would move back over one
		let room = Math.max(0, this.opts.screen.columns - 5);
		const fitted = text.slice(0, room);
		room -= fitted.length;
		let noted = "";
		for (const [part, paint] of note.length === 0
			? []
			: [["  ", plain] as Segment, ...note]) {
			noted += paint(part.slice(0, room));
			room = Math.max(0, room - part.length);
		}
		return `  ${icon} ${state.started === undefined ? color.dim(fitted) : fitted}${noted}`;
	}

	/** A call's icon, and the note after its files in colored parts. */
	private mark(state: State): [string, Segment[]] {
		if (state.cancelled) {
			return [color.yellow("■"), [["cancelled", plain]]];
		}
		if (state.error !== undefined) {
			return [color.red("✖"), [["failed", plain]]];
		}
		const found = state.found;
		if (found !== undefined) {
			if (found.errors + found.warnings === 0) {
				return [color.green("✔"), []];
			}
			// a dot, not a cross, so found problems read apart from a broken call
			return [
				found.errors > 0 ? color.red("●") : color.yellow("●"),
				tally(found),
			];
		}
		if (state.started !== undefined) {
			return [
				color.blue(SPINNER[this.frame % SPINNER.length]),
				state.status === undefined ? [] : [[state.status, plain]],
			];
		}
		return [color.dim("·"), []];
	}

	private draw(): void {
		if (!this.opts.screen.live) {
			return;
		}
		const lines = this.lines();
		const back = this.drawn > 0 ? `${ESC}[${this.drawn}F` : "";
		this.opts.screen.write(
			`${back}${lines.map((line) => `${line}${ESC}[K\n`).join("")}${ESC}[J`,
		);
		this.drawn = lines.length;
	}

	private state(call: Call): State {
		const state = this.states.get(call) ?? {};
		this.states.set(call, state);
		return state;
	}
}

function files(call: Call): string {
	const [first, ...rest] = call.files;
	return rest.length === 0 ? (first ?? "") : `${first} and ${rest.length} more`;
}

/** Some text, and what colors it. */
type Segment = [string, (text: string) => string];

function plain(text: string): string {
	return text;
}

/** Errors in red and warnings in yellow, so each reads as what it is. */
function tally(found: { errors: number; warnings: number }): Segment[] {
	const errors: Segment[] =
		found.errors === 0
			? []
			: [
					[
						`${found.errors} ${found.errors === 1 ? "error" : "errors"}`,
						color.red,
					],
				];
	const warnings: Segment[] =
		found.warnings === 0
			? []
			: [
					[
						`${found.warnings} ${found.warnings === 1 ? "warning" : "warnings"}`,
						color.yellow,
					],
				];
	return errors.length > 0 && warnings.length > 0
		? [...errors, [", ", plain], ...warnings]
		: [...errors, ...warnings];
}

function seconds(duration: Duration): string {
	return `${Math.floor(duration.secs)}s`;
}
