import { readdir } from "node:fs/promises";
import { color, type Logger } from "@webappwiz/log";

const packages = `${import.meta.dir}/../packages`;

export async function test(log: Logger): Promise<void> {
	const dirs = (await readdir(packages, { withFileTypes: true }))
		.filter((e) => e.isDirectory())
		.map((e) => e.name)
		.sort();

	const failed: string[] = [];
	for (const dir of dirs) {
		log.info(`\n${dir}:`);
		// one run per package, cwd'd into it, so each picks up its own bunfig.toml
		const { exitCode } = await Bun.$`bun test`
			.cwd(`${packages}/${dir}`)
			.nothrow();
		if (exitCode !== 0) {
			failed.push(dir);
		}
	}

	log.info(
		`\ntests: ${failed.length === 0 ? color.green("success") : color.red(`failed (${failed.join(", ")})`)}`,
	);
	if (failed.length > 0) {
		throw new Error("Tests failed");
	}
}
