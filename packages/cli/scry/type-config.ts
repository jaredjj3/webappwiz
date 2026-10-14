import { Lang, parse } from "@ast-grep/napi";
import type { Logger } from "webappwiz/log";
import type { Fs } from "webappwiz/system";

/**
 * Types a scry config that calls `defineConfig` by a type-only import of
 * `ScryConfig` and `satisfies` instead, so it runs where `@webappwiz/scry`
 * is not installed. Rewrites only an `export default defineConfig({ ... })`
 * whose file imports `defineConfig` alone and uses it nowhere else, saying
 * to do it by hand otherwise; `defineConfig` still works meanwhile.
 */
export async function typeConfig(
	path: string,
	{ fs, log }: { fs: Fs; log: Logger },
): Promise<void> {
	if (!(await fs.exists(path))) {
		return;
	}
	const text = await fs.read(path);
	const root = parse(Lang.TypeScript, text).root();
	const uses = root.findAll({
		rule: { kind: "identifier", regex: "^defineConfig$" },
	});
	if (uses.length === 0) {
		return;
	}
	const imported = root
		.children()
		.find(
			(node) =>
				node.kind() === "import_statement" && DEFINE_CONFIG.test(node.text()),
		);
	const call = root
		.children()
		.find((node) => node.kind() === "export_statement")
		?.field("value");
	const args = (call?.field("arguments")?.children() ?? []).filter((node) =>
		node.isNamed(),
	);
	if (
		imported === undefined ||
		call?.kind() !== "call_expression" ||
		call.field("function")?.text() !== "defineConfig" ||
		args.length !== 1 ||
		uses.length !== 2
	) {
		log.info(
			`${path} calls defineConfig: type it with \`satisfies ScryConfig\` by hand`,
		);
		return;
	}
	await fs.write(
		path,
		root.commitEdits([
			imported.replace(
				'import type { ScryConfig } from "@webappwiz/scry/config";',
			),
			call.replace(`${args[0]?.text()} satisfies ScryConfig`),
		]),
	);
	log.info(`typed ${path} with \`satisfies ScryConfig\``);
}

/** An import of `defineConfig` alone from scry's config. */
const DEFINE_CONFIG =
	/^import\s*\{\s*defineConfig\s*\}\s*from\s*["']@webappwiz\/scry\/config["'];?$/;
