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

/**
 * One named unit of release work. A deadline tells callers when to consider the
 * step hung; it never cancels the work. A check, when present, retries until it
 * confirms that the work really landed.
 */
export interface Step {
	readonly name: string;
	readonly deadline: Duration;
	readonly stage?: StepStage;
	run(cut: Cut, report?: StepReport): Promise<void>;
	check?(cut: Cut): Promise<boolean>;
}
