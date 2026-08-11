import type { Logger } from "./logger";

export class PrefixLogger implements Logger {
	constructor(
		private prefix: string,
		private log: Logger,
	) {}

	info(message: unknown, ...optionalParams: unknown[]): void {
		this.log.info(`${this.prefix} ${message}`, ...optionalParams);
	}

	error(message: unknown, ...optionalParams: unknown[]): void {
		this.log.error(`${this.prefix} ${message}`, ...optionalParams);
	}
}
