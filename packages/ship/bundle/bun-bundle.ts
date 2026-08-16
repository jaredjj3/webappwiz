import { type Fs, NodeFs, NodePs, type Ps, walk } from "@webappwiz/system";
import type { Bundle } from "./bundle";

interface Manifest {
	scripts?: Record<string, string>;
	exports?: Record<string, string | { default?: string }>;
}

/**
 * Relative specifiers in an emitted declaration, whether imported or exported,
 * and the `import("./x")` form a inferred type can carry.
 */
const SPECIFIER = /(from\s*"|import\(")(\.[^"]*)(")/g;

/** A specifier that already names a file, which is left alone. */
const EXTENSION = /\.[a-z]+$/;

/** What a `BunBundle` builds through; the real system by default. */
export interface BunBundleOptions {
	fs?: Fs;
	ps?: Ps;
}

/**
 * Builds a package into `dist/`: one bundle per entry point, with the
 * declarations beside them. What goes out is JavaScript, so a consumer needs
 * neither Bun nor a bundler nor a compiler pass over somebody else's source.
 *
 * A package whose output is more than its own source says so with a `build`
 * script in its manifest, and that runs instead.
 */
export class BunBundle implements Bundle {
	private readonly fs: Fs;
	private readonly ps: Ps;

	constructor(opts: BunBundleOptions = {}) {
		this.fs = opts.fs ?? new NodeFs();
		this.ps = opts.ps ?? new NodePs();
	}

	async build(dir: string): Promise<void> {
		const manifest: Manifest = JSON.parse(
			await this.fs.read(`${dir}/package.json`),
		);
		if (manifest.scripts?.build !== undefined) {
			await this.run(["bun", "run", "build"], dir);
			return;
		}
		const entries = sources(manifest);
		if (entries.length === 0) {
			return; // nothing is exported, so there is nothing to build
		}
		// Splitting is what keeps a package with more than one entry point from
		// carrying two copies of everything they share. Two copies means two
		// classes, and a value built by one failing `instanceof` inside the other.
		await this.run(
			[
				"bun",
				"build",
				...entries,
				"--outdir",
				"dist",
				"--target",
				"node",
				"--packages",
				"external",
				"--splitting",
			],
			dir,
		);
		await this.run(
			[
				"bunx",
				"tsc",
				// tsc refuses files on the command line while a tsconfig.json is in
				// reach, and the workspace one says `noEmit`.
				"--ignoreConfig",
				"--emitDeclarationOnly",
				"--declaration",
				"--outDir",
				"dist",
				"--module",
				"preserve",
				"--moduleResolution",
				"bundler",
				"--target",
				"esnext",
				"--lib",
				"esnext,dom",
				"--types",
				"bun",
				"--strict",
				"--skipLibCheck",
				...entries,
				...(await this.ambient(dir)),
			],
			dir,
		);
		await this.point(dir);
	}

	async clean(dir: string): Promise<void> {
		await this.fs.rm(`${dir}/dist`, { recursive: true, force: true });
	}

	/**
	 * The declaration files a package keeps at its root, which say what its
	 * non-code imports are. Nothing loads the workspace tsconfig during a build,
	 * so anything ambient has to be handed over by name or tsc will not believe
	 * in it: `rules` imports each rule's markdown, and `md.d.ts` is what says
	 * markdown is a string.
	 */
	private async ambient(dir: string): Promise<string[]> {
		const entries = await this.fs.readdir(dir);
		return entries
			.filter((entry) => entry.endsWith(".d.ts"))
			.map((entry) => `./${entry}`);
	}

	/**
	 * Points every relative specifier in the emitted declarations at a `.js`
	 * file. tsc writes them bare, which a consumer resolving as node16 rejects
	 * outright, and which with `skipLibCheck` on it does not report at all: the
	 * references quietly fail and every export becomes `any`, so the types are
	 * lost without anybody being told. A `.js` specifier resolves to the
	 * declaration beside it under both node16 and bundler resolution, so the one
	 * output serves either.
	 */
	private async point(dir: string): Promise<void> {
		for await (const path of walk(`${dir}/dist`, { fs: this.fs })) {
			if (!path.endsWith(".d.ts")) {
				continue;
			}
			const before = await this.fs.read(path);
			const after = before.replace(
				SPECIFIER,
				(match, head: string, specifier: string, tail: string) =>
					EXTENSION.test(specifier) ? match : `${head}${specifier}.js${tail}`,
			);
			if (after !== before) {
				await this.fs.write(path, after);
			}
		}
	}

	private async run(argv: string[], cwd: string): Promise<void> {
		const { exitCode } = await this.ps.spawn(argv, { cwd });
		if (exitCode !== 0) {
			throw new Error(`\`${argv.join(" ")}\` failed in ${cwd}`);
		}
	}
}

/**
 * The source behind every entry point the manifest exports. `dist` mirrors the
 * source tree, so the manifest already says where each one came from and
 * nothing needs a second list to fall out of step with.
 */
function sources(manifest: Manifest): string[] {
	const found = new Set<string>();
	for (const entry of Object.values(manifest.exports ?? {})) {
		const output = typeof entry === "string" ? entry : entry.default;
		if (output?.startsWith("./dist/") === true && output.endsWith(".js")) {
			found.add(`./${output.slice("./dist/".length, -".js".length)}.ts`);
		}
	}
	return [...found];
}
