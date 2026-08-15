// judge-ignore-file one-dir-per-interface: this is the package entry point named in
// package.json exports, not a barrel sitting inside an interface's directory
export type { ExternalStore } from "./external-store/external-store";
export { ReactiveExternalStore } from "./external-store/reactive-external-store";
export {
	type AppendOnlyDisposer,
	type DisposerEffectCallback,
	useDisposerEffect,
} from "./use-disposer-effect";
export { useExternalStore } from "./use-external-store";
export { useReactive } from "./use-reactive";
export { useResource } from "./use-resource";
