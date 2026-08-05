import fs from "node:fs/promises";
import { normalize } from "node:path";
import type { Fs, RmOptions, StatResult } from "./fs";

export class NodeFs implements Fs {
	async exists(path: string): Promise<boolean> {
		return fs.access(normalize(path)).then(
			() => true,
			() => false,
		);
	}

	async mkdir(path: string): Promise<void> {
		await fs.mkdir(normalize(path), { recursive: true });
	}

	read(path: string): Promise<string> {
		return fs.readFile(normalize(path), "utf-8");
	}

	write(path: string, data: string): Promise<void> {
		return fs.writeFile(normalize(path), data);
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
