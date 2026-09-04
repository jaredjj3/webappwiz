import { changed, Rules } from "@webappwiz/rules";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import type { Fs, Glob, Ps } from "webappwiz/system";

export interface ReviewOptions {
	/** The project root: where `.wiz/rules` is, and what paths are relative to. */
	dir: string;
	/** The git ref the change is measured from. */
	since: string;
	/** Files per block, at most. */
	chunk: number;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	glob?: Glob;
}

/**
 * Divides a change into blocks of work, each the rules of one complexity over
 * the changed files they all match, and prints them for a parent agent to hand
 * to subagents. Nothing is spawned and no rule is quoted: each block names its
 * rules' files, and the subagent reads them.
 */
export async function review(opts: ReviewOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const rules = await Rules.load(opts.dir, { fs: opts.fs });
	if (rules.all.length === 0) {
		throw new Error(
			`no rules in ${opts.dir}/.wiz/rules: copy one in with \`rules add\`, or write one with \`rules new\``,
		);
	}
	const files = await changed(opts.dir, opts.since, { ps: opts.ps });
	if (files.length === 0) {
		log.info(`nothing has changed since ${opts.since}`);
		return;
	}
	const blocks = rules.review(files, { chunk: opts.chunk, glob: opts.glob });
	const count = (total: number, noun: string) =>
		`${total} ${noun}${total === 1 ? "" : "s"}`;
	if (blocks.length === 0) {
		log.info(
			`no rule matches the ${count(files.length, "file")} changed since ${opts.since}`,
		);
		return;
	}
	const matched = new Set(
		blocks.flatMap((block) => block.rules.map((rule) => rule.id)),
	).size;
	log.info(
		`${count(files.length, "file")} changed since ${opts.since}; ` +
			`${count(matched, "rule")} matched, ${count(blocks.length, "block")} to review`,
	);
	for (const block of blocks) {
		log.info("");
		log.info(block.prompt(opts.since));
	}
}
