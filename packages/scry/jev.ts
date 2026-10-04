import type { Judge, JudgeOptions, Judgment, Verdict } from "./judge";
import { SystemOneEndpoint } from "./system-one-endpoint";

/** Where Jev is reached. */
export interface JevOptions {
	/**
	 * `https://api.typesafe.ai` when not given. Anything else that serves
	 * `/v1/systemone`, like Clef's open weights on your own hardware, works too.
	 */
	origin?: string;
}

/** TypeSafe's decision model. */
export class Jev implements Judge {
	private endpoint: SystemOneEndpoint;

	constructor(
		/** As TypeSafe names it: `jev-latest`, `jev-preview`, or a version like `jev-1.13.0`. */
		readonly model: string,
		/** A TypeSafe API key. */
		token: string,
		opts: JevOptions = {},
	) {
		this.endpoint = new SystemOneEndpoint(
			`${opts.origin ?? "https://api.typesafe.ai"}/v1/systemone`,
			token,
			{ body: { model } },
		);
	}

	judge(judgment: Judgment, opts: JudgeOptions = {}): Promise<Verdict> {
		return this.endpoint.judge(judgment, opts);
	}
}
