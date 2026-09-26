/** Where progress is drawn. */
export interface Screen {
	/** Whether it is a terminal, where lines can be redrawn in place. */
	readonly live: boolean;
	/** How wide a line can be before it wraps. */
	readonly columns: number;
	write(text: string): void;
}

/**
 * The process's stderr, which keeps progress apart from the report on
 * stdout. It is live only on a terminal that understands cursor movement,
 * so a pipe or a CI log gets plain lines.
 */
export class StderrScreen implements Screen {
	get live(): boolean {
		return process.stderr.isTTY === true && process.env.TERM !== "dumb";
	}

	get columns(): number {
		// 0 when the terminal does not say
		return process.stderr.columns || 80;
	}

	write(text: string): void {
		process.stderr.write(text);
	}
}
