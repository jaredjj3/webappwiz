import type { Duration } from "webappwiz/time";
import type { Stage } from "./artifact/artifact";
import type { Cut } from "./cut";

/** Where a caller-defined step runs. Preflight steps precede the release prompt. */
export type StepStage = "preflight" | Stage;

/**
 * One named unit of release work. A deadline tells callers when to consider the
 * step hung; it never cancels the work. A check, when present, retries until it
 * confirms that the work really landed.
 */
export interface Step {
	readonly name: string;
	readonly deadline: Duration;
	readonly stage?: StepStage;
	run(cut: Cut): Promise<void>;
	check?(cut: Cut): Promise<boolean>;
}
