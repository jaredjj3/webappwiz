import type { Logger } from "./logger";

export class MdcLogger implements Logger {
	constructor(
		private context: Record<string, unknown>,
		private log: Logger,
	) {}

	info(message: unknown, ...optionalParams: unknown[]): void {
		this.log.info(this.withMdcPrefix(message), ...optionalParams);
	}

	error(message: unknown, ...optionalParams: unknown[]): void {
		this.log.error(this.withMdcPrefix(message), ...optionalParams);
	}

	withContext(context: Record<string, unknown>): MdcLogger {
		return new MdcLogger({ ...this.context, ...context }, this.log);
	}

	private withMdcPrefix(message: unknown): string {
		const prefix = Object.entries(this.context)
			.map(([key, value]) => `[${key}=${String(value)}]`)
			.join(" ");

		if (prefix.length === 0) {
			return `${message}`;
		}

		return `${prefix} ${message}`;
	}
}
