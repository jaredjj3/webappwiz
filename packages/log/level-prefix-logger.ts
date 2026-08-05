import type { Logger } from "./logger";
import { PrefixLogger } from "./prefix-logger";

export class LevelPrefixLogger implements Logger {
	private infoLogger: PrefixLogger;
	private errorLogger: PrefixLogger;

	constructor(log: Logger) {
		this.infoLogger = new PrefixLogger("[INFO]", log);
		this.errorLogger = new PrefixLogger("[ERROR]", log);
	}

	info(message: unknown, ...optionalParams: unknown[]): void {
		this.infoLogger.info(message, ...optionalParams);
	}

	error(message: unknown, ...optionalParams: unknown[]): void {
		this.errorLogger.error(message, ...optionalParams);
	}
}
