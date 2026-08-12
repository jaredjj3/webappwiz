import type { Console } from "../console/console";
import type { Logger } from "./logger";

export class ConsoleLogger implements Logger {
	constructor(private readonly out: Console = console) {}

	info(message: unknown, ...optionalParams: unknown[]): void {
		this.out.log(message, ...optionalParams);
	}

	error(message: unknown, ...optionalParams: unknown[]): void {
		this.out.error(message, ...optionalParams);
	}
}
