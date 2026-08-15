// judge-ignore-file one-dir-per-interface: this is the package entry point named in
// package.json exports, not a barrel sitting inside an interface's directory

export { AsyncDisposer } from "./async-disposer";
export type { AsyncResource } from "./async-resource";
export { disposables } from "./disposables";
export { Disposer } from "./disposer";
export type { Resource } from "./resource";
