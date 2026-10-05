import { type Fs, NodeFs } from "webappwiz/system";
import { CASE_FILE, CASES_DIR } from "./layout";
import { SourceFile } from "./source-file";

/** A file labeled as following a rule or breaking it. */
export interface Case {
	/** Where it came from: `evals/cart.bad.ts`. */
	name: string;
	kind: "good" | "bad";
	file: SourceFile;
}

export interface CasesOptions {
	fs?: Fs;
}

/**
 * A rule's labeled cases: the files in its `evals/`, labeled by name. What a
 * rule's tests check it against, and what `wiz scry eval` scores it on.
 */
export class Cases {
	private constructor(readonly all: readonly Case[]) {}

	/** The cases of the rule in `dir`, its own directory. */
	static async load(dir: string, opts: CasesOptions = {}): Promise<Cases> {
		const fs = opts.fs ?? new NodeFs();
		const evals: Case[] = [];
		const names = await fs
			.readdir(`${dir}/${CASES_DIR}`)
			.catch((): string[] => []);
		for (const name of names.toSorted()) {
			const match = CASE_FILE.exec(name)?.groups;
			if (match?.kind === "good" || match?.kind === "bad") {
				evals.push({
					name: `${CASES_DIR}/${name}`,
					kind: match.kind,
					file: new SourceFile(
						`${match.name}${match.ext ?? ""}`,
						await fs.read(`${dir}/${CASES_DIR}/${name}`),
					),
				});
			}
		}
		return new Cases(evals);
	}

	get good(): Case[] {
		return this.all.filter((each) => each.kind === "good");
	}

	get bad(): Case[] {
		return this.all.filter((each) => each.kind === "bad");
	}
}
