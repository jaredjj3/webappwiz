#!/usr/bin/env bun
import { NodeFs, NodeGlob } from "@webappwiz/sys";
import { SystemClock } from "@webappwiz/time";
import { webappwiz } from "./commands";

await webappwiz.run({
	fs: new NodeFs(),
	clock: new SystemClock(),
	glob: new NodeGlob(),
});
