#!/usr/bin/env bun
import { cli } from "@webappwiz/cmd";
import { ConsoleLogger } from "@webappwiz/log";
import { NodeFs } from "@webappwiz/sys";
import { commands } from "./commands";

const log = new ConsoleLogger();
const app = cli("webappwiz", log);

await commands(app, log, new NodeFs());
await app.run();
