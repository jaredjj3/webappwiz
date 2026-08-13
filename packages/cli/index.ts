#!/usr/bin/env bun
import { ConsoleLogger } from "@webappwiz/log";
import { NodeFs, NodeGlob, NodePs } from "@webappwiz/sys";
import { SystemClock } from "@webappwiz/time";
import { webappwiz } from "./webappwiz";

const ps = new NodePs();

await webappwiz.run(
	{
		log: new ConsoleLogger(),
		fs: new NodeFs(),
		ps,
		clock: new SystemClock(),
		glob: new NodeGlob(),
	},
	ps.args,
);
