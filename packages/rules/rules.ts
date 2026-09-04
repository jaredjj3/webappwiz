import { type Fs, type Glob, NodeFs, NodeGlob } from "webappwiz/system";
import { Block } from "./block";
import { Budget } from "./budget";
import type { ChangedFile } from "./changed";
import { RULE_FILE, RULES_ROOT } from "./layout";
import { type Complexity, Rule, RuleError } from "./rule";

/** What `load` reads through; the real filesystem by default. */
export interface LoadOptions {
	fs?: Fs;
}

/** How a review cuts the work up. */
export interface ReviewOptions {
	/** How much a block may hold; the default budget when not given. */
	budget?: Budget;
	/** Matches globs to paths; the real matcher by default. */
	glob?: Glob;
}

/** Rules of one complexity, and the files every one of them matches. */
interface Rectangle {
	complexity: Complexity;
	rules: Rule[];
	files: ChangedFile[];
}

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
	 * The blocks a change divides into: rules that match the same files, of
	 * the same complexity, gathered so one subagent reads each of those files
	 * once and judges it against all of them. A gathering wider or deeper than
	 * `budget` allows is cut until it fits. A rule matching nothing gets no
	 * block: there is nothing to say about it.
	 */
	review(files: ChangedFile[], opts: ReviewOptions = {}): Block[] {
		const budget = opts.budget ?? Budget.default();
		const glob = opts.glob ?? new NodeGlob();
		const blocks: Block[] = [];
		for (const { complexity, rules, files: matched } of this.rectangles(
			files,
			glob,
		)) {
			for (const held of split(rules, budget.rules(complexity))) {
				const most = budget.files(complexity, held.length);
				for (const part of split(matched, most)) {
					blocks.push(new Block(blocks.length + 1, held, part));
				}
			}
		}
		return blocks;
	}

	/**
	 * The rules that share a complexity and a set of matched files, in id
	 * order. Every rule in one applies to every file in it, so a block cut
	 * from it is square and nothing needs saying about which rule reads which
	 * file.
	 */
	private rectangles(files: ChangedFile[], glob: Glob): Rectangle[] {
		const found = new Map<string, Rectangle>();
		for (const rule of this.all) {
			const matched = files.filter((file) => rule.matches(file.path, glob));
			if (matched.length === 0) {
				continue;
			}
			// keyed on the files matched rather than the glob that matched them,
			// so `**/*.ts` and `**/*.{ts,md}` are one rectangle when no `.md`
			// file changed, which is the common case
			const key = [rule.complexity, ...matched.map((file) => file.path)].join(
				"\n",
			);
			const rectangle = found.get(key);
			if (rectangle === undefined) {
				found.set(key, {
					complexity: rule.complexity,
					rules: [rule],
					files: matched,
				});
			} else {
				rectangle.rules.push(rule);
			}
		}
		return [...found.values()];
	}
}

/**
 * `items` in as few parts as `most` allows, spread evenly rather than filled
 * to `most`, so the last part is not left with a stray item or two.
 */
function split<T>(items: readonly T[], most: number): T[][] {
	const parts = Math.ceil(items.length / most);
	const size = Math.ceil(items.length / parts);
	return Array.from({ length: parts }, (_, part) =>
		items.slice(part * size, (part + 1) * size),
	);
}
