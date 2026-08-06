// attribute-specific resets (39 = default fg, 22 = normal intensity) so nesting works
const FG_RESET = "39";
const INTENSITY_RESET = "22";

export class color {
	private constructor() {
		throw new Error("color is a static-only class and cannot be instantiated.");
	}

	static red(value: unknown): string {
		return color.wrap("31", FG_RESET, value);
	}

	static yellow(value: unknown): string {
		return color.wrap("33", FG_RESET, value);
	}

	static green(value: unknown): string {
		return color.wrap("32", FG_RESET, value);
	}

	static blue(value: unknown): string {
		return color.wrap("34", FG_RESET, value);
	}

	static dim(value: unknown): string {
		return color.wrap("2", INTENSITY_RESET, value);
	}

	static bold(value: unknown): string {
		return color.wrap("1", INTENSITY_RESET, value);
	}

	static gray(value: unknown): string {
		return color.wrap("90", FG_RESET, value);
	}

	private static wrap(code: string, reset: string, value: unknown): string {
		return `\u001B[${code}m${String(value)}\u001B[${reset}m`;
	}
}
