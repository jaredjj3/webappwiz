import type { Fs } from "@webappwiz/sys";

/**
 * Every file under `dir`, depth-first. Dotfiles and `node_modules` are skipped:
 * both commands want the project's own files, not its installed copies of them.
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
