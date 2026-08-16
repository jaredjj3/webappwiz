// rule-ignore-file one-dir-per-interface: this is the package entry point named in
// package.json exports, not a barrel sitting inside an interface's directory
export { Dispatcher } from "./dispatcher";
export type { Eventful, EventMapOf } from "./eventful";
export type {
	AnyListener,
	Events,
	Listener,
	ListenerOptions,
	Unlisten,
} from "./events";
export { NoopEvents } from "./noop-events";
