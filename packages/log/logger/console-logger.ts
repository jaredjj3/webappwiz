import type { Console } from "../console/console";
import type { Logger } from "./logger";

export class ConsoleLogger implements Logger {
	private readonly out: Console;

	constructor(out?: Console) {
		this.out = out ?? console;
	}

	info(message: unknown, ...optionalParams: unknown[]): void {
		this.out.log(message, ...optionalParams);
	}

	error(message: unknown, ...optionalParams: unknown[]): void {
		this.out.error(message, ...optionalParams);
	}
}
