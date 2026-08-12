import { color, type MemoryLogger } from "@webappwiz/log";
import { type Cli, cli } from "./cli";

/** A program whose one command sits under a group, for the help tests. */
export function withSkills(log: MemoryLogger): Cli {
	const wiz = cli("wiz", log);
	wiz
		.group("skills")
		.description("manage skills")
		.command("add")
		.description("add one");
	return wiz;
}

/** Everything written to the logger so far, uncoloured, as one string. */
export function help(log: MemoryLogger): string {
	return log.entries.map((entry) => color.strip(entry.message)).join("\n");
}
