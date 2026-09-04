import { NodeFs, NodeGlob } from "webappwiz/system";
import { wiz } from "./wiz";

await wiz.run({ fs: new NodeFs(), glob: new NodeGlob() });
