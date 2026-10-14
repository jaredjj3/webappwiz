import { Lang, parse, type SgNode } from "@ast-grep/napi";
import type { Logger } from "webappwiz/log";
import type { Fs } from "webappwiz/system";
import type { ConfigPaths } from "../load-config";

/**
 * Moves the `scry` key of a wiz config, `.wiz/config.ts` or the user's
 * `~/.config/wiz/config.ts`, into the scry config beside it, where scry
 * reads its settings now. The value moves as it was written, comments and
 * all, with the comments above the key; a wiz config left holding nothing
 * is removed, its own comments moving too. Leaves both alone, saying so,
 * when the scry config is already there.
 */
export async function moveConfig(
	paths: ConfigPaths,
	{ fs, log }: { fs: Fs; log: Logger },
): Promise<void> {
	if (!(await fs.exists(paths.wiz))) {
		return;
	}
	const text = await fs.read(paths.wiz);
	const root = parse(Lang.TypeScript, text).root();
	const exported = root
		.children()
		.find((node) => node.kind() === "export_statement")
		?.field("value");
	// `export default { ... }` or `export default defineConfig({ ... })`
	const object =
		exported?.kind() === "call_expression"
			? exported.field("arguments")?.children()[1]
			: exported;
	const entries = (object?.children() ?? []).filter(
		(node) =>
			node.kind() === "pair" || node.kind() === "shorthand_property_identifier",
	);
	const pair = entries.find((node) =>
		/^["']?scry["']?$/.test((node.field("key") ?? node).text()),
	);
	if (pair === undefined) {
		return;
	}
	const value = pair.field("value");
	if (value === null) {
		log.info(
			`${paths.wiz} sets scry from elsewhere in the file: move it into ${paths.scry} by hand`,
		);
		return;
	}
	if (await fs.exists(paths.scry)) {
		log.info(
			`${paths.wiz} still sets scry, and ${paths.scry} exists: move what you still want into ${paths.scry} by hand`,
		);
		return;
	}
	const above = leading(pair);
	const comments = above.map((node) => node.text());
	const typed = /from\s+["']@webappwiz\/cli\/config["']/.test(text);
	if (entries.length === 1) {
		comments.unshift(
			...root
				.children()
				.filter((node) => node.kind() === "comment")
				.map((node) => node.text()),
		);
	}
	const body = dedent(value.text(), indentOf(text, pair));
	await fs.mkdir(paths.scry.slice(0, paths.scry.lastIndexOf("/")), {
		recursive: true,
	});
	await fs.write(
		paths.scry,
		[
			...(typed
				? ['import type { ScryConfig } from "@webappwiz/scry/config";', ""]
				: []),
			...comments,
			typed
				? `export default ${body} satisfies ScryConfig;`
				: `export default ${body};`,
			"",
		].join("\n"),
	);
	if (entries.length === 1) {
		await fs.rm(paths.wiz);
		log.info(`moved ${paths.wiz} to ${paths.scry}: it set only scry`);
		return;
	}
	await fs.write(paths.wiz, cut(text, above[0] ?? pair, pair));
	log.info(`moved scry from ${paths.wiz} to ${paths.scry}`);
}

/** The comments right above `node`, each on its own line, first to last. */
function leading(node: SgNode): SgNode[] {
	const found: SgNode[] = [];
	for (let at = node.prev(); at?.kind() === "comment"; at = at.prev()) {
		found.unshift(at);
	}
	return found;
}

/** The whitespace `node`'s line starts with. */
function indentOf(text: string, node: SgNode): string {
	const start = node.range().start.index;
	const line = text.slice(text.lastIndexOf("\n", start - 1) + 1, start);
	return /^\s*$/.test(line) ? line : "";
}

/** `text` with `indent` taken off the start of each line after the first. */
function dedent(text: string, indent: string): string {
	return indent === ""
		? text
		: text
				.split("\n")
				.map((line, index) =>
					index > 0 && line.startsWith(indent)
						? line.slice(indent.length)
						: line,
				)
				.join("\n");
}

/**
 * `text` without `from` through `to` and the comma after it, taking the
 * lines whole when nothing else is on them.
 */
function cut(text: string, from: SgNode, to: SgNode): string {
	let start = from.range().start.index;
	let end = to.range().end.index;
	end += /^\s*,/.exec(text.slice(end))?.[0].length ?? 0;
	const before = text.slice(text.lastIndexOf("\n", start - 1) + 1, start);
	const after = /^[ \t]*\n/.exec(text.slice(end));
	if (/^\s*$/.test(before) && after !== null) {
		start -= before.length;
		end += after[0].length;
	} else {
		end += /^[ \t]*/.exec(text.slice(end))?.[0].length ?? 0;
	}
	return text.slice(0, start) + text.slice(end);
}
