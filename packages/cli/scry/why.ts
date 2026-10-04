import { Decisions, Git } from "@webappwiz/scry";
import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { DECISIONS } from "./check";

export interface WhyOptions {
	/** `path:line`, the path from the working directory, as a report prints it. */
	at: string;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
}

/**
 * What a decision model was asked about one line, and what it answered: why
 * a finding there was reported, or dropped. Only what was asked about the
 * file as it reads now counts; an edit since retires it.
 */
export async function why(opts: WhyOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	const match = /^(?<file>.+):(?<line>\d+)$/.exec(opts.at);
	if (match?.groups === undefined) {
		throw new Error(
			`expected path:line, like src/cart.ts:12, got "${opts.at}"`,
		);
	}
	const { file = "", line = "" } = match.groups;
	const { root, paths } = await Git.locate(ps.cwd(), [file], { ps });
	const path = paths[0] ?? file;
	const text = await fs.read(`${root}/${path}`);
	const decisions = (
		await Decisions.open(`${root}/${DECISIONS}`, { fs })
	).about(path, text, Number(line));
	if (decisions.length === 0) {
		log.info(
			`no model was asked about ${path}:${line} as it reads now: whatever a rule found there, its code decided`,
		);
		return;
	}
	for (const decision of decisions) {
		log.info(
			`${color.bold(`${Math.round(decision.probability * 100)}%`)}  ${decision.question}  ${color.dim(`${decision.model}, ${decision.at}`)}`,
		);
	}
}
