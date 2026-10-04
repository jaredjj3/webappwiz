import { Markdown } from "webappwiz/md";
import { type Fs, type Glob, NodeFs, NodeGlob } from "webappwiz/system";
import { CASE_FILE, CASES_DIR, RULE_FILE } from "./layout";
import { RuleDocument } from "./rule-document";
import { SourceFile } from "./source-file";

/** A file labeled as following a rule or breaking it. */
export interface Case {
	/** Where it came from: `evals/cart.bad.ts`, or `RULE.md bad 2`. */
	name: string;
	kind: "good" | "bad";
	file: SourceFile;
}

export interface CasesOptions {
	fs?: Fs;
	glob?: Glob;
}

/**
 * A rule's labeled cases: the files in its `evals/`, labeled by name, and the
 * code blocks under its `RULE.md`'s `## Good` and `## Bad`. What a rule's
 * tests check it against, and what `wiz scry measure` scores it on.
 */
export class Cases {
	private constructor(readonly all: readonly Case[]) {}

	/** The cases of the rule in `dir`, its own directory. */
	static async load(dir: string, opts: CasesOptions = {}): Promise<Cases> {
		const fs = opts.fs ?? new NodeFs();
		const glob = opts.glob ?? new NodeGlob();
		const document = RuleDocument.parse(await fs.read(`${dir}/${RULE_FILE}`), {
			path: `${dir}/${RULE_FILE}`,
		});
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
		return new Cases([...examples(document, glob), ...evals]);
	}

	get good(): Case[] {
		return this.all.filter((each) => each.kind === "good");
	}

	get bad(): Case[] {
		return this.all.filter((each) => each.kind === "bad");
	}
}

/**
 * The code blocks under `## Good` and `## Bad`, each named for a file the
 * rule reads, so a rule about tests reads its examples as tests.
 */
function examples(document: RuleDocument, glob: Glob): Case[] {
	const md = Markdown.parse(document.document);
	return (["good", "bad"] as const).flatMap((kind) =>
		md.has(kind)
			? md
					.section(kind)
					.codeBlocks()
					.map((block, index) => {
						const ext = block.lang || "txt";
						const path =
							[`example.${ext}`, `example.test.${ext}`, `testing.${ext}`].find(
								(candidate) => glob.matches(document.files, candidate),
							) ?? `example.${ext}`;
						return {
							name: `${RULE_FILE} ${kind} ${index + 1}`,
							kind,
							file: new SourceFile(path, `${block.code}\n`),
						};
					})
			: [],
	);
}
