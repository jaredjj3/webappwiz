import { commands } from "@webappwiz/cli/commands";
import { cli } from "@webappwiz/cmd";
import { Lint } from "@webappwiz/lint";
import { ConsoleLogger } from "@webappwiz/log";
import { Git, Github, Registry, Ship, Workspace } from "@webappwiz/ship";
import { NodeFs, NodePs } from "@webappwiz/sys";
import { t } from "@webappwiz/t";
import { Fix } from "./fix";
import { Path } from "./path";
import { ship } from "./ship";
import { test } from "./test";

const log = new ConsoleLogger();
const fs = new NodeFs();
const ps = new NodePs();

const wiz = cli("wiz", log);

wiz
	.command("fix")
	.description("format, lint, and typecheck the workspace")
	.option("check", t.boolean(), {
		default: false,
		description: "report problems without writing fixes (for CI)",
	})
	.action((opts) => new Fix(log, ps, new Lint(log, fs, ps)).run(opts));

wiz
	.command("path")
	.description("manage bin/ on your shell PATH")
	.option("add", t.boolean(), {
		default: false,
		description: "add bin/ to your PATH",
	})
	.option("remove", t.boolean(), {
		default: false,
		description: "remove bin/ from your PATH",
	})
	.action((opts) => new Path(log, fs, ps).run(opts));

wiz
	.command("ship")
	.description("release every package in the workspace at one version")
	.arg("bump", t.string(), { description: "patch, minor, or major" })
	.action(async (opts) => {
		const workspace = await Workspace.at(fs, ps.cwd());
		const release = new Ship(
			log,
			workspace,
			new Git(ps, workspace.root),
			new Registry(ps),
			new Github(ps),
		);
		const fix = new Fix(log, ps, new Lint(log, fs, ps));
		await ship(opts, log, ps, release, fix);
	});

wiz
	.command("test")
	.description("run the workspace tests")
	.arg("package", t.string(), {
		default: "",
		description: "only test this package (default: all)",
	})
	.action((opts) => test(opts, fs, ps));

await commands(
	wiz.group("cli").description("run @webappwiz/cli against a project"),
	log,
	fs,
	ps,
);

await wiz.run();
