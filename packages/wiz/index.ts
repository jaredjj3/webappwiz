import { ConsoleLogger } from "@webappwiz/log";
import { NodeFs, NodeGlob, NodePs } from "@webappwiz/sys";
import { SystemClock } from "@webappwiz/time";
import { wiz } from "./wiz";

const ps = new NodePs();

await wiz.run(
	{
		log: new ConsoleLogger(),
		fs: new NodeFs(),
		ps,
		clock: new SystemClock(),
		glob: new NodeGlob(),
	},
	ps.args,
);
