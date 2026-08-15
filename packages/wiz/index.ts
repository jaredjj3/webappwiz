import { ConsoleLogger } from "@webappwiz/log";
import { Check, WEBAPPWIZ_RULES } from "@webappwiz/rules";
import { NodeFs, NodeGlob, NodePs } from "@webappwiz/sys";
import { SystemClock } from "@webappwiz/time";
import { Fixer } from "./fixer";
import { wiz } from "./wiz";

// The real dependencies are named here rather than defaulted inside `run`,
// because the `Fixer` is assembled from them before the cli ever sees them.
const log = new ConsoleLogger();
const fs = new NodeFs();
const ps = new NodePs();
const glob = new NodeGlob();

await wiz.run({
	log,
	fs,
	ps,
	glob,
	clock: new SystemClock(),
	fixer: new Fixer(new Check(WEBAPPWIZ_RULES.rules, { log, fs, ps, glob }), {
		log,
		ps,
	}),
});
