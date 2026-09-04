#!/usr/bin/env bun
import { NodeFs, NodeGlob } from "webappwiz/system";
import { webappwiz } from "./webappwiz";

await webappwiz().run({ fs: new NodeFs(), glob: new NodeGlob() });
