import { cli, t } from "@webappwiz/cli";
import { ConsoleLogger } from "@webappwiz/log";
import { fix } from "./fix";
import { path } from "./path";
import { test } from "./test";

const log = new ConsoleLogger();

const wiz = cli("wiz", log);

wiz
	.command("fix")
	.description("format, lint, and typecheck the workspace")
	.option("check", t.boolean(), {
		default: false,
		description: "report problems without writing fixes (for CI)",
	})
	.action((opts) => fix(opts, log));

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
	.action((opts) => path(opts, log));

wiz
	.command("test")
	.description("run each package's tests")
	.action(() => test(log));

await wiz.run();
