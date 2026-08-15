import type { Logger } from "./logger";

/** Writes straight to the process's own console. */
export class ConsoleLogger implements Logger {
	info(message: unknown, ...optionalParams: unknown[]): void {
		console.log(message, ...optionalParams);
	}

	error(message: unknown, ...optionalParams: unknown[]): void {
		console.error(message, ...optionalParams);
	}
}
