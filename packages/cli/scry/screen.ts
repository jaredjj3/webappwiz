import { NodePs, type Ps } from "webappwiz/system";

/** Where a line of progress is drawn. */
export interface Screen {
	/** Whether a line can be redrawn in place there, and should be. */
	readonly live: boolean;
	/** How wide a line can be before it wraps. */
	readonly columns: number;
	write(text: string): void;
}

/**
 * The process's stderr, which keeps progress apart from the report on
 * stdout. It is live only on a terminal that understands cursor movement,
 * and never under CI, so a pipe or a build log gets nothing.
 */
export class StderrScreen implements Screen {
	constructor(private ps: Ps = new NodePs()) {}

	get live(): boolean {
		const ci = this.ps.env("CI");
		return (
			process.stderr.isTTY === true &&
			this.ps.env("TERM") !== "dumb" &&
			(ci === undefined || ci === "" || ci === "false" || ci === "0")
		);
	}

	get columns(): number {
		// 0 when the terminal does not say
		return process.stderr.columns || 80;
	}

	write(text: string): void {
		process.stderr.write(text);
	}
}
