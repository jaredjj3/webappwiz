import { NodeFs, NodeGlob } from "@webappwiz/system";
import { SystemClock } from "@webappwiz/time";
import { wiz } from "./wiz";

await wiz.run({
	fs: new NodeFs(),
	clock: new SystemClock(),
	glob: new NodeGlob(),
});
