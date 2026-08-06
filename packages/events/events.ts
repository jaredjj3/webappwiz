export type EventListener<T> = (event: T) => void;
export type EventUnlistener = () => void;
export type TypeEventListener<T, E> = (type: T, event: E) => void;

export type EventListenerOptions = {
	once?: boolean;
};

/**
 * The read side of a `Dispatcher`. Hand this out to whoever needs to react to
 * something; keep the dispatcher itself with whoever raises it.
 */
export interface Events<T extends Record<string, unknown>> {
	on<K extends keyof T>(
		type: K,
		listener: EventListener<T[K]>,
		opts?: EventListenerOptions,
	): EventUnlistener;

	all<K extends keyof T>(
		listener: TypeEventListener<K, T[K]>,
		opts?: EventListenerOptions,
	): EventUnlistener;
}
