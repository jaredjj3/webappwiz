import { Duration, SystemTimer, type Timer } from "webappwiz/time";
import type { Cut } from "./cut";
import type { StepDeclaration, StepEvents } from "./step-events";

const CHECK_INTERVAL = Duration.secs(10);

/** Runs declared work and its checks, reporting every transition. */
export class StepRunner {
	constructor(
		private readonly events: StepEvents,
		private readonly timer: Timer = new SystemTimer(),
	) {}

	async declare(steps: readonly StepDeclaration[]): Promise<void> {
		for (const step of steps) {
			await this.events.declared(step);
		}
	}

	async run(
		declaration: StepDeclaration,
		cut: Cut,
		opts: StepRunOptions = {},
	): Promise<void> {
		if (opts.done === true) {
			await this.events.done(declaration);
			return;
		}
		await this.events.started(declaration);
		try {
			await declaration.step.run(cut);
			while (declaration.step.check !== undefined) {
				const passed = await declaration.step.check(cut);
				await this.events.check(declaration, passed);
				if (passed) {
					break;
				}
				await this.wait();
			}
			await this.events.done(declaration);
		} catch (error) {
			await this.events.failed(declaration, error);
			throw error;
		}
	}

	private async wait(): Promise<void> {
		await new Promise<void>((resolve) => {
			const waiting = this.timer.setTimeout(() => {
				waiting.dispose();
				resolve();
			}, CHECK_INTERVAL);
		});
	}
}

interface StepRunOptions {
	done?: boolean;
}
