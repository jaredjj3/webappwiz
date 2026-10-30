import type { Duration } from "webappwiz/time";
import type { Stage } from "./artifact/artifact";
import type { Cut } from "./cut";

/** Where a caller-defined step runs. Preflight steps precede the release prompt. */
export type StepStage = "preflight" | Stage;

/** What a running step tells whoever is watching the release. */
export interface StepReport {
	/** A package went to a registry that holds it until somebody approves it. */
	staged(info: {
		package: string;
		version: string;
		stageId: string;
		url: string;
	}): Promise<void>;
}

/** What one poll of a step's check found, for a check with more to say than pass or fail. */
export interface CheckReport {
	readonly passed: boolean;
	/** What the step is still waiting on, in a word, such as `pending` or `held`. */
	readonly status?: string;
	/** Where a person can look into what it waits on. */
	readonly url?: string;
}

/**
 * One named unit of release work. A deadline tells callers when to consider the
 * step hung; it never cancels the work. A check, when present, retries, backing
 * off, until it confirms that the work really landed; `waited` is how long it
 * has waited so far.
 */
export interface Step {
	readonly name: string;
	readonly deadline: Duration;
	readonly stage?: StepStage;
	run(cut: Cut, report?: StepReport): Promise<void>;
	check?(cut: Cut, waited: Duration): Promise<boolean | CheckReport>;
}
