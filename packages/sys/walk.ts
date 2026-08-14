import type { Fs } from "./fs/fs";
import { NodeFs } from "./fs/node-fs";

/**
 * Yields the path of every file under `dir`, recursively. Dotfiles and
 * `node_modules` are skipped, so what comes back is a project's own source.
 */
export async function* walk(dir: string, fs?: Fs): AsyncGenerator<string> {
	const files = fs ?? new NodeFs();
	for (const entry of await files.readdir(dir)) {
		if (entry.startsWith(".") || entry === "node_modules") {
			continue;
		}
		const path = `${dir}/${entry}`;
		if ((await files.stat(path)).isDirectory()) {
			yield* walk(path, files);
		} else {
			yield path;
		}
	}
}
