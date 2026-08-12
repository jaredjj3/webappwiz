import type { Fs } from "./fs/fs";

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
