import type { Console } from "./console";

/** Keeps every call's arguments, so a test can read what was written. */
export class FakeConsole implements Console {
	readonly logged: unknown[][] = [];
	readonly errored: unknown[][] = [];

	log(message: unknown, ...optionalParams: unknown[]): void {
		this.logged.push([message, ...optionalParams]);
	}

	error(message: unknown, ...optionalParams: unknown[]): void {
		this.errored.push([message, ...optionalParams]);
	}
}
