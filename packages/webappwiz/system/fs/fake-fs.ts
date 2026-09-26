import { dirname, normalize } from "node:path";
import type { Fs, MkdirOptions, RmOptions, StatResult } from "./fs";

const DIRECTORY = Symbol("directory");

/** An in-memory {@link Fs} for tests. */
export class FakeFs implements Fs {
	readonly store = new Map<string, string | Uint8Array | typeof DIRECTORY>();

	async exists(path: string): Promise<boolean> {
		return this.store.has(normalize(path));
	}

	async mkdir(path: string, opts?: MkdirOptions): Promise<void> {
		const target = normalize(path);
		if (opts?.recursive === false && this.store.has(target)) {
			throw new Error(`Path already exists: ${path}`);
		}
		this.store.set(target, DIRECTORY);
		if (opts?.recursive !== false) {
			// every missing ancestor too, as `mkdir -p` makes them
			for (
				let dir = dirname(target);
				!this.store.has(dir);
				dir = dirname(dir)
			) {
				this.store.set(dir, DIRECTORY);
				if (dir === dirname(dir)) {
					break;
				}
			}
		}
	}

	async read(path: string): Promise<string> {
		const content = this.file(path);
		return typeof content === "string"
			? content
			: new TextDecoder().decode(content);
	}

	async write(path: string, data: string): Promise<void> {
		this.store.set(normalize(path), data);
	}

	async readBytes(path: string): Promise<Uint8Array> {
		const content = this.file(path);
		return typeof content === "string"
			? new TextEncoder().encode(content)
			: content.slice();
	}

	async writeBytes(path: string, data: Uint8Array): Promise<void> {
		this.store.set(normalize(path), data.slice());
	}

	async rename(from: string, to: string): Promise<void> {
		const source = normalize(from);
		const entry = this.store.get(source);
		if (entry === undefined) {
			throw new Error(`Path does not exist: ${from}`);
		}
		const target = normalize(to);
		// a directory takes everything under it along, as a real rename does
		for (const [key, value] of [...this.store]) {
			if (key === source || key.startsWith(`${source}/`)) {
				this.store.delete(key);
				this.store.set(target + key.slice(source.length), value);
			}
		}
	}

	async readdir(path: string): Promise<string[]> {
		const dir = normalize(path);
		return [...this.store.keys()]
			.filter((key) => key !== dir && dirname(key) === dir)
			.map((key) => key.slice(dir.endsWith("/") ? dir.length : dir.length + 1));
	}

	async stat(path: string): Promise<StatResult> {
		const entry = this.store.get(normalize(path));
		if (entry === undefined) {
			throw new Error(`Path does not exist: ${path}`);
		}
		return {
			isDirectory: () => entry === DIRECTORY,
			size: entry === DIRECTORY ? 0 : Buffer.byteLength(entry),
		};
	}

	async rm(path: string, opts?: RmOptions): Promise<void> {
		const target = normalize(path);
		if (!opts?.force && !this.store.has(target)) {
			throw new Error(`Path does not exist: ${path}`);
		}
		this.store.delete(target);
		if (opts?.recursive) {
			for (const key of this.store.keys()) {
				if (key.startsWith(`${target}/`)) {
					this.store.delete(key);
				}
			}
		}
	}

	private file(path: string): string | Uint8Array {
		const content = this.store.get(normalize(path));
		if (content === undefined || content === DIRECTORY) {
			throw new Error(`File does not exist: ${path}`);
		}
		return content;
	}
}
