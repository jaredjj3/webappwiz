#!/usr/bin/env bun
import { NodeFs, NodeGlob } from "webappwiz/system";
import { SystemClock } from "webappwiz/time";
import { webappwiz } from "./webappwiz";

await webappwiz.run({
	fs: new NodeFs(),
	clock: new SystemClock(),
	glob: new NodeGlob(),
});
