import type { Fs } from "./fs/fs";

/**
 * Yields the path of every file under `dir`, recursively. Dotfiles and
 * `node_modules` are skipped, so what comes back is a project's own source.
 */
export async function* walk(fs: Fs, dir: string): AsyncGenerator<string> {
	for (const entry of await fs.readdir(dir)) {
		if (entry.startsWith(".") || entry === "node_modules") {
			continue;
		}
		const path = `${dir}/${entry}`;
		if ((await fs.stat(path)).isDirectory()) {
			yield* walk(fs, path);
		} else {
			yield path;
		}
	}
}
