import { dirname } from "node:path";
import { ConsoleLogger, type Logger } from "webappwiz/log";
import { type Fs, NodeFs } from "webappwiz/system";

/** Where one kind of document lives in a project. */
export interface Layout {
	/** Under the project root: one directory per document, named after it. */
	root: string;
	/** The file each of those directories holds. */
	file: string;
	/** What a message calls one of them. */
	noun: string;
}

/**
 * One document and the files that travel with it, by path under its
 * directory: `SKILL.md` or `RULE.md`, and any `scripts/` or `references/`
 * beside it.
 */
export type Bundle = Record<string, string>;

/** What `update` did: the documents it refreshed, and the files that changed. */
export interface Refreshed {
	names: string[];
	/** Under the project root, only the ones whose contents differ. */
	changed: string[];
}

/** What `Documents` reads and writes through; the real ones by default. */
export interface DocumentsOptions {
	log?: Logger;
	fs?: Fs;
}

/** The `version:` in a document's frontmatter, or null when it has none. */
export function versionOf(md: string): string | null {
	// frontmatter only, so a `version:` inside a fenced example in the body is
	// not mistaken for the real one
	const frontmatter = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
	return frontmatter.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? null;
}

/**
 * Documents a package bundles and a project installs copies of: skills under
 * `.agents/skills`, rules under `.wiz/scry`. Each copy's frontmatter carries
 * the version it came from, so a stale copy is visible rather than merely
 * wrong, and refreshing is copying again.
 */
export class Documents {
	private log: Logger;
	private fs: Fs;

	constructor(
		/** Name to bundle, each holding the layout's file. */
		private bundles: Record<string, Bundle>,
		private layout: Layout,
		opts: DocumentsOptions = {},
	) {
		this.log = opts.log ?? new ConsoleLogger();
		this.fs = opts.fs ?? new NodeFs();
		// a bundle without its document is a packaging mistake, so it fails
		// here rather than halfway through installing
		for (const name of Object.keys(bundles)) {
			this.document(name);
		}
	}

	/** Every document on offer, name and text, in name order. */
	available(): Array<[string, string]> {
		return Object.keys(this.bundles)
			.toSorted((left, right) => left.localeCompare(right))
			.map((name) => [name, this.document(name)]);
	}

	/** Where a project keeps its copy of `name`. */
	path(dir: string, name: string): string {
		return `${dir}/${this.layout.root}/${name}/${this.layout.file}`;
	}

	/** The names a project has a copy of, ours or not, in name order. */
	async installed(dir: string): Promise<string[]> {
		const names = await this.fs
			.readdir(`${dir}/${this.layout.root}`)
			.catch((): string[] => []); // no such directory is just "none installed"
		const present: string[] = [];
		for (const name of names.toSorted()) {
			if (await this.fs.exists(this.path(dir, name))) {
				present.push(name);
			}
		}
		return present;
	}

	/** The version a project's copy came from; null when there is no copy. */
	async installedVersion(dir: string, name: string): Promise<string | null> {
		return this.fs
			.read(this.path(dir, name))
			.then(versionOf)
			.catch((): null => null); // not installed, or not readable: same answer here
	}

	/**
	 * Installs one bundled document and what travels with it, or throws
	 * naming what there is. Returns the files whose contents changed, under
	 * the project root.
	 */
	async add(name: string, dir: string): Promise<string[]> {
		if (this.bundles[name] === undefined) {
			const have = this.available().map(([known]) => known);
			throw new Error(
				`no such ${this.layout.noun}: ${name} (have ${have.join(", ")})`,
			);
		}
		return this.copy(name, dir);
	}

	/**
	 * Refreshes the bundled documents a project already has. Never adds one: a
	 * document someone chose not to install should not arrive by way of an
	 * update.
	 */
	async update(dir: string): Promise<Refreshed> {
		const installed = await this.installed(dir);
		const names = this.available()
			.map(([name]) => name)
			.filter((name) => installed.includes(name));
		const changed: string[] = [];
		for (const name of names) {
			changed.push(...(await this.copy(name, dir)));
		}
		return { names, changed };
	}

	/** The layout's file out of a bundle, which every bundle has to hold. */
	private document(name: string): string {
		const doc = this.bundles[name]?.[this.layout.file];
		if (doc === undefined) {
			throw new Error(`${this.layout.noun} ${name} has no ${this.layout.file}`);
		}
		return doc;
	}

	private async copy(name: string, dir: string): Promise<string[]> {
		// a copy, not a merge: replacing whatever is there is what makes the
		// version in a document's frontmatter mean anything
		const changed: string[] = [];
		for (const [file, text] of Object.entries(
			this.bundles[name] ?? {},
		).toSorted()) {
			const relative = `${this.layout.root}/${name}/${file}`;
			const target = `${dir}/${relative}`;
			const before = await this.fs.read(target).catch((): null => null); // not there yet
			await this.fs.mkdir(dirname(target));
			await this.fs.write(target, text);
			this.log.info(`wrote ${target}`);
			if (before !== text) {
				changed.push(relative);
			}
		}
		return changed;
	}
}
