import type { Fs } from "webappwiz/system";
import { SystemWallClock, type WallClock } from "webappwiz/time";
import type { Step } from "./step";

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
	| StepFailedEvent;

/** What a step runner reports, identified independently of its display name. */
export interface StepDeclaration {
	readonly id: string;
	readonly step: Step;
}

/** JSON-lines release progress. No path means no event output. */
export class StepEvents {
	constructor(
		private readonly path: string | undefined,
		private readonly fs: Fs,
		private readonly clock: WallClock = new SystemWallClock(),
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
		await this.write({ type: "done", id, name: step.name, at: this.at() });
	}

	async failed({ id, step }: StepDeclaration, error: unknown): Promise<void> {
		await this.write({
			type: "failed",
			id,
			name: step.name,
			error: error instanceof Error ? error.message : String(error),
			at: this.at(),
		});
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
