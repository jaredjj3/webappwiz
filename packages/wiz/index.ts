import { cli } from "@webappwiz/cmd";
import { ConsoleLogger } from "@webappwiz/log";
import { NodeFs, NodePs } from "@webappwiz/sys";
import { t } from "@webappwiz/t";
import { fix } from "./fix";
import { path } from "./path";
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
	.action((opts) => fix(opts, log, ps));

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
	.action((opts) => path(opts, log, fs, ps));

wiz
	.command("test")
	.description("run the workspace tests")
	.arg("package", t.string(), {
		default: "",
		description: "only test this package (default: all)",
	})
	.action((opts) => test(opts, fs, ps));

await wiz.run();
