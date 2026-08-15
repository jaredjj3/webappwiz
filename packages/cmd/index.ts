// The type only: a cli is built by `cli()` or `group()`, and anything that
// passes one around, a `mount()` signature say, needs to be able to say so.
export type { Cli } from "./cli";
export { cli } from "./cli";
export type { Deps } from "./deps";
export type { Middleware, Next } from "./middleware";
