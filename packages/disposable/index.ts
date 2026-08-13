// judge-ignore-file one-dir-per-interface: this is the package entry point named in
// package.json exports, not a barrel sitting inside an interface's directory
export type { AsyncDisposable } from "./async-disposable";
export { AsyncDisposer } from "./async-disposer";
export type { Disposable } from "./disposable";
export { disposables } from "./disposables";
export { Disposer } from "./disposer";
