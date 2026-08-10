#!/usr/bin/env bun
import { cli } from "@webappwiz/cmd";
import { ConsoleLogger } from "@webappwiz/log";
import { NodeFs } from "@webappwiz/sys";
import { t } from "@webappwiz/t";
import { skills } from "./skills";
import { update } from "./update";

const log = new ConsoleLogger();
const fs = new NodeFs();

// Every @webappwiz package is released in lockstep, so this one's version is
// the version — of the packages to pin, and of the skills bundled here.
const { version } = JSON.parse(
	await fs.read(`${import.meta.dir}/package.json`),
);

const app = cli("webappwiz", log);

app
	.command("update")
	.description("pin every @webappwiz/* dependency in a tree to one version")
	.arg("dir", t.string(), {
		default: ".",
		description: "directory to scan recursively (default: .)",
	})
	.option("version", t.string(), {
		default: version,
		description: "version to pin to",
	})
	.action((opts) => update(opts, log, fs));

app
	.command("skills")
	.description("copy webappwiz agent skills into a project's .agents/skills")
	.arg("dir", t.string(), {
		default: ".",
		description: "project to sync into (default: .)",
	})
	.arg("skill", t.string(), {
		default: "",
		description: "only this skill (default: all)",
	})
	.action((opts) => skills(opts, log, fs));

await app.run();
