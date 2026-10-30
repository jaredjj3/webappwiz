import type { Fs } from "webappwiz/system";
import { SystemWallClock, type WallClock } from "webappwiz/time";
import type { Step } from "./step";

/** The states a progress line reports; the vocabulary of `wiz dev ship plan` ids. */
type ProgressState = "start" | "done" | "failed" | "skipped";

/**
 * JSON-lines release progress. No path means no event file; `progress`, when
 * given, also receives one `{"event":"step",...}` line per start, done, failure
 * or skip, for a caller reading the release's own output.
 */
export class StepEvents {
	constructor(
		private readonly path: string | undefined,
		private readonly fs: Fs,
		private readonly clock: WallClock = new SystemWallClock(),
		private readonly progress?: ProgressSink,
	) {}

	async declared({ id, step }: StepDeclaration): Promise<void> {
		await this.write({
			type: "declared",
			id,
			name: step.name,
			deadlineMs: step.deadline.ms,
			at: this.at(),
		});
	}

	async started({ id, step }: StepDeclaration): Promise<void> {
		this.report(id, "start");
		await this.write({ type: "started", id, name: step.name, at: this.at() });
	}

	async check(declaration: StepDeclaration, passed: boolean): Promise<void> {
		await this.write({
			type: "check",
			id: declaration.id,
			name: declaration.step.name,
			passed,
			at: this.at(),
		});
	}

	async done({ id, step }: StepDeclaration): Promise<void> {
		this.report(id, "done");
		await this.write({ type: "done", id, name: step.name, at: this.at() });
	}

	/** A step a resumed release found already landed. */
	async skipped({ id, step }: StepDeclaration): Promise<void> {
		this.report(id, "skipped");
		await this.write({ type: "skipped", id, name: step.name, at: this.at() });
	}

	async failed({ id, step }: StepDeclaration, error: unknown): Promise<void> {
		this.report(id, "failed");
		await this.write({
			type: "failed",
			id,
			name: step.name,
			error: error instanceof Error ? error.message : String(error),
			at: this.at(),
		});
	}

	private report(id: string, state: ProgressState): void {
		this.progress?.line(
			JSON.stringify({ event: "step", id, state, at: this.at() }),
		);
	}

	private async write(event: ReleaseStepEvent): Promise<void> {
		if (this.path !== undefined && this.path !== "") {
			await this.fs.append(this.path, `${JSON.stringify(event)}\n`);
		}
	}

	private at(): string {
		return new Date(this.clock.now()).toISOString();
	}
}

/** Where progress lines go; the release's own logger in practice. */
export interface ProgressSink {
	line(text: string): void;
}

interface StepEvent {
	readonly id: string;
	readonly name: string;
	readonly at: string;
}

export interface StepDeclaredEvent extends StepEvent {
	readonly type: "declared";
	readonly deadlineMs: number;
}

export interface StepStartedEvent extends StepEvent {
	readonly type: "started";
}

export interface StepCheckEvent extends StepEvent {
	readonly type: "check";
	readonly passed: boolean;
}

export interface StepDoneEvent extends StepEvent {
	readonly type: "done";
}

export interface StepSkippedEvent extends StepEvent {
	readonly type: "skipped";
}

export interface StepFailedEvent extends StepEvent {
	readonly type: "failed";
	readonly error: string;
}

/** One line in the release event file named by WEBAPPWIZ_SHIP_EVENTS. */
export type ReleaseStepEvent =
	| StepDeclaredEvent
	| StepStartedEvent
	| StepCheckEvent
	| StepDoneEvent
	| StepSkippedEvent
	| StepFailedEvent;

/** What a step runner reports, identified independently of its display name. */
export interface StepDeclaration {
	readonly id: string;
	readonly step: Step;
}
