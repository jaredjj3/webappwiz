import type { Fix, FixOptions } from "./fix";

/** Succeeds every time, recording the options it was run with. */
export class FakeFix implements Fix {
	readonly runs: FixOptions[] = [];

	async run(opts: FixOptions): Promise<void> {
		this.runs.push(opts);
	}
}
