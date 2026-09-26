#!/usr/bin/env bun
import { NodeFs } from "webappwiz/system";
import { webappwiz } from "./webappwiz";

await webappwiz().run({ fs: new NodeFs() });
