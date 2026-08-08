import { Duration } from "../duration";
import type { Clock } from "./clock";

/** A {@link Clock} that moves only when the test advances it. */
export class FakeClock implements Clock {
	private current: Duration;

	constructor(start: Duration = Duration.zero()) {
		this.current = start;
	}

	now(): Duration {
		return this.current;
	}

	advance(duration: Duration): void {
		this.current = this.current.add(duration);
	}

	set(duration: Duration): void {
		this.current = duration;
	}
}
