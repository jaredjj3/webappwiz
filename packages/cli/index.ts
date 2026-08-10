#!/usr/bin/env bun
import { cli } from "@webappwiz/cmd";
import { ConsoleLogger } from "@webappwiz/log";
import { NodeFs } from "@webappwiz/sys";
import { t } from "@webappwiz/t";
import * as skills from "./skills";
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

const group = app
	.group("skills")
	.description("manage webappwiz agent skills in .agents/skills");

group
	.command("add")
	.description("add a skill to a project")
	.arg("skill", t.string(), { description: "skill name" })
	.arg("dir", t.string(), {
		default: ".",
		description: "project to add it to (default: .)",
	})
	.action((opts) => skills.add(opts, log, fs));

group
	.command("update")
	.description("refresh the skills a project already has")
	.arg("dir", t.string(), {
		default: ".",
		description: "project to refresh (default: .)",
	})
	.action((opts) => skills.update(opts, log, fs));

await app.run();
