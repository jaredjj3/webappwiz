import { cli } from "@webappwiz/cmd";
import { type CommandDeps, commands } from "./commands";

/** Everything `webappwiz` is run with. */
export type WebappwizDeps = CommandDeps;

export const webappwiz = cli<WebappwizDeps>("webappwiz");

commands(webappwiz);
