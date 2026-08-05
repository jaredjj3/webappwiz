import { cli, t } from "@webappwiz/cli";
import { fix } from "./fix";
import { log } from "./log";
import { path } from "./path";

const wiz = cli("wiz", log);

wiz
	.command("fix")
	.description("format, lint, and typecheck the workspace")
	.option("check", t.boolean, {
		default: false,
		description: "report problems without writing fixes (for CI)",
	})
	.action(fix);

wiz
	.command("path")
	.description("manage bin/ on your shell PATH")
	.option("add", t.boolean, {
		default: false,
		description: "add bin/ to your PATH",
	})
	.option("remove", t.boolean, {
		default: false,
		description: "remove bin/ from your PATH",
	})
	.action(path);

await wiz.run();
