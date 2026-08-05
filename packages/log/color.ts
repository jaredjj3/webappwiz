const ANSI_RESET = "\u001B[0m";

export class color {
	private constructor() {
		throw new Error("color is a static-only class and cannot be instantiated.");
	}

	static red(value: unknown): string {
		return color.wrap("31", value);
	}

	static yellow(value: unknown): string {
		return color.wrap("33", value);
	}

	static green(value: unknown): string {
		return color.wrap("32", value);
	}

	static blue(value: unknown): string {
		return color.wrap("34", value);
	}

	static dim(value: unknown): string {
		return color.wrap("2", value);
	}

	static gray(value: unknown): string {
		return color.wrap("90", value);
	}

	private static wrap(code: string, value: unknown): string {
		return `\u001B[${code}m${String(value)}${ANSI_RESET}`;
	}
}
