import type { Console } from "../console/console";
import type { Logger } from "./logger";

/** Where a `ConsoleLogger` writes; the process's own console by default. */
export interface ConsoleLoggerOptions {
	out?: Console;
}

export class ConsoleLogger implements Logger {
	private readonly out: Console;

	constructor(opts: ConsoleLoggerOptions = {}) {
		this.out = opts.out ?? console;
	}

	info(message: unknown, ...optionalParams: unknown[]): void {
		this.out.log(message, ...optionalParams);
	}

	error(message: unknown, ...optionalParams: unknown[]): void {
		this.out.error(message, ...optionalParams);
	}
}
