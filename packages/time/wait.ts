import type { Duration } from "./duration";

/** Waits for `duration` before resolving. */
export function wait(duration: Duration): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, duration.ms));
}
