import { type Fs, type Glob, NodeFs, NodeGlob } from "webappwiz/system";
import { Block } from "./block";
import type { ChangedFile } from "./changed";
import { RULE_FILE, RULES_ROOT } from "./layout";
import { Rule, RuleError } from "./rule";

/** What `load` reads through; the real filesystem by default. */
export interface LoadOptions {
	fs?: Fs;
}

/** How a review cuts the changed files up. */
export interface ReviewOptions {
	/** Files per block, at most. A rule matching more gets several blocks. */
	chunk?: number;
	/** Matches globs to paths; the real matcher by default. */
	glob?: Glob;
}

/** Files per block when a caller does not say. */
export const DEFAULT_CHUNK = 25;

/**
 * The rules a project has: every `RULE.md` under `.wiz/rules`, validated, in
 * id order. The one thing to do with them is plan a review, which is why the
 * planning sits here rather than beside git.
 */
export class Rules {
	private constructor(readonly all: readonly Rule[]) {}

	/** Rules already parsed, for a caller that has them in hand. */
	static of(rules: Rule[]): Rules {
		return new Rules(
			rules.toSorted((left, right) => left.id.localeCompare(right.id)),
		);
	}

	/**
	 * Every rule under `<dir>/.wiz/rules`. A directory there without a
	 * `RULE.md`, or one whose document fails to parse, is an error, and every
	 * such problem is reported at once rather than the first one found.
	 */
	static async load(dir: string, opts: LoadOptions = {}): Promise<Rules> {
		const fs = opts.fs ?? new NodeFs();
		// no such directory is just "no rules", and the message for that
		// belongs to the caller, who knows what it was about to do with them
		const ids = await fs
			.readdir(`${dir}/${RULES_ROOT}`)
			.catch((): string[] => []);
		const rules: Rule[] = [];
		const problems: string[] = [];
		for (const id of ids.toSorted()) {
			if (id.startsWith(".")) {
				continue;
			}
			const path = `${RULES_ROOT}/${id}/${RULE_FILE}`;
			const text = await fs.read(`${dir}/${path}`).catch((): null => null);
			if (text === null) {
				problems.push(`${path}: missing`);
				continue;
			}
			try {
				rules.push(Rule.parse(text, { path, id }));
			} catch (error) {
				problems.push(error instanceof RuleError ? error.message : `${error}`);
			}
		}
		if (problems.length > 0) {
			throw new RuleError(problems.join("\n"));
		}
		return new Rules(rules);
	}

	get(id: string): Rule | undefined {
		return this.all.find((rule) => rule.id === id);
	}

	/**
	 * One block per rule that matches any of the changed files, in id order,
	 * cut into several when a rule matches more than `chunk` files. A rule
	 * matching nothing gets no block: there is nothing to say about it.
	 */
	review(files: ChangedFile[], opts: ReviewOptions = {}): Block[] {
		const chunk = opts.chunk ?? DEFAULT_CHUNK;
		const glob = opts.glob ?? new NodeGlob();
		const blocks: Block[] = [];
		for (const rule of this.all) {
			const matched = files.filter((file) => rule.matches(file.path, glob));
			if (matched.length === 0) {
				continue;
			}
			// spread evenly rather than filling to the chunk, so the last block
			// is not left with a stray file or two
			const parts = Math.ceil(matched.length / chunk);
			const size = Math.ceil(matched.length / parts);
			for (let part = 0; part < parts; part++) {
				blocks.push(
					new Block(rule, matched.slice(part * size, (part + 1) * size), {
						part: part + 1,
						parts,
					}),
				);
			}
		}
		return blocks;
	}
}
