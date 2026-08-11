// style-ignore-file one-dir-per-interface: this is the package entry point named in
// package.json exports, not a barrel sitting inside an interface's directory
export { Dispatcher } from "./dispatcher";
export type {
	EventListener,
	EventListenerOptions,
	Events,
	EventUnlistener,
	TypeEventListener,
} from "./events";
export { NoopEvents } from "./noop-events";
