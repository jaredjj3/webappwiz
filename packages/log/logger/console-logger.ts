import type { Logger } from "./logger";

export class ConsoleLogger implements Logger {
	info(message: unknown, ...optionalParams: unknown[]): void {
		console.log(message, ...optionalParams);
	}

	error(message: unknown, ...optionalParams: unknown[]): void {
		console.error(message, ...optionalParams);
	}
}
