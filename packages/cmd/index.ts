// The type only: a cli is built by `cli()` or `group()`, and a function that
// takes one, to mount a set of commands on it, needs to be able to say so.
export type { Cli } from "./cli";
export { cli } from "./cli";
export type { Middleware, Next } from "./middleware";
