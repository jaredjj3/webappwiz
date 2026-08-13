import { ConsoleLogger } from "@webappwiz/log";
import { NodeFs, NodePs } from "@webappwiz/sys";
import { SystemClock } from "@webappwiz/time";
import { wiz } from "./wiz";

await wiz.run({
	log: new ConsoleLogger(),
	fs: new NodeFs(),
	ps: new NodePs(),
	clock: new SystemClock(),
});
