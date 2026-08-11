#!/usr/bin/env bun
import { cli } from "@webappwiz/cmd";
import { ConsoleLogger } from "@webappwiz/log";
import { NodeFs, NodePs } from "@webappwiz/sys";
import { commands } from "./commands";

const log = new ConsoleLogger();
const app = cli("webappwiz", log);

await commands(app, log, new NodeFs(), new NodePs());
await app.run();
