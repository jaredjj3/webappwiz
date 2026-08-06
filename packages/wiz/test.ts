import { color, type Logger } from "@webappwiz/log";
import type { Fs, Ps } from "@webappwiz/sys";

const packages = `${import.meta.dir}/..`;

export async function test(log: Logger, fs: Fs, ps: Ps): Promise<void> {
	const entries = await fs.readdir(packages);
	const dirs: string[] = [];
	for (const entry of entries.sort()) {
		if ((await fs.stat(`${packages}/${entry}`)).isDirectory()) {
			dirs.push(entry);
		}
	}

	const start = performance.now();
	const failed: string[] = [];
	for (const dir of dirs) {
		log.info(`\n${color.blue(`${dir}:`)}`);
		// one run per package, cwd'd into it, so each picks up its own bunfig.toml
		const { exitCode } = await ps.spawn(
			["bun", "test", "--pass-with-no-tests"],
			{
				cwd: `${packages}/${dir}`,
			},
		);
		if (exitCode !== 0) {
			failed.push(dir);
		}
	}

	const ms = (performance.now() - start).toFixed(2);
	log.info(
		`\ntests: ${failed.length === 0 ? color.green("success") : color.red(`fail (${failed.join(", ")})`)} ${color.gray(`[${color.bold(`${ms}ms`)}]`)}`,
	);
	if (failed.length > 0) {
		throw new Error("Tests failed");
	}
}
