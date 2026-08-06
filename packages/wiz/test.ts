import { color, type Logger } from "@webappwiz/log";
import type { Fs, Ps } from "@webappwiz/sys";

const packages = `${import.meta.dir}/..`;

export async function test(
	opts: { package: string },
	log: Logger,
	fs: Fs,
	ps: Ps,
): Promise<void> {
	const entries = await fs.readdir(packages);
	const all: string[] = [];
	for (const entry of entries.sort()) {
		if ((await fs.stat(`${packages}/${entry}`)).isDirectory()) {
			all.push(entry);
		}
	}
	const dirs =
		opts.package === "" ? all : all.filter((d) => d === opts.package);
	if (dirs.length === 0) {
		throw new Error(`no such package: ${opts.package}`);
	}

	const start = performance.now();
	const failed: string[] = [];
	for (const dir of dirs) {
		log.info(`\n${color.blue(`${dir}:`)}`);
		// one run per package, cwd'd into it, so each picks up its own bunfig.toml
		const { exitCode } = await ps.spawn(
			// --concurrent: the suites are mostly waiting on git and the filesystem
			["bun", "test", "--pass-with-no-tests", "--concurrent"],
			{
				cwd: `${packages}/${dir}`,
			},
		);
		if (exitCode !== 0) {
			failed.push(dir);
		}
	}

	const ms = performance.now() - start;
	const elapsed =
		ms < 1000 ? `${ms.toFixed(2)}ms` : `${(ms / 1000).toFixed(2)}s`;
	log.info(
		`\ntests: ${failed.length === 0 ? color.green("success") : color.red(`fail (${failed.join(", ")})`)} ${color.gray(`[${color.bold(elapsed)}]`)}`,
	);
	if (failed.length > 0) {
		throw new Error("Tests failed");
	}
}
