import fs from "node:fs/promises";
import { normalize } from "node:path";
import type { Fs, MkdirOptions, RmOptions, StatResult } from "./fs";

export class NodeFs implements Fs {
	async exists(path: string): Promise<boolean> {
		return fs.access(normalize(path)).then(
			() => true,
			() => false,
		);
	}

	async mkdir(path: string, options?: MkdirOptions): Promise<void> {
		await fs.mkdir(normalize(path), {
			recursive: options?.recursive ?? true,
		});
	}

	read(path: string): Promise<string> {
		return fs.readFile(normalize(path), "utf-8");
	}

	write(path: string, data: string): Promise<void> {
		return fs.writeFile(normalize(path), data);
	}

	rename(from: string, to: string): Promise<void> {
		return fs.rename(normalize(from), normalize(to));
	}

	readdir(path: string): Promise<string[]> {
		return fs.readdir(normalize(path));
	}

	stat(path: string): Promise<StatResult> {
		return fs.stat(normalize(path));
	}

	rm(path: string, options?: RmOptions): Promise<void> {
		return fs.rm(normalize(path), options);
	}
}
