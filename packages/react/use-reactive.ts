import type { Eventful, EventMapOf } from "@webappwiz/events";
import { useRef, useState } from "react";
import { ReactiveExternalStore } from "./external-store/reactive-external-store";
import { useExternalStore } from "./use-external-store";

/**
 * Reads a projection of an `Eventful` source, re-rendering when any of the
 * named events changes what `select` returns.
 *
 * The store is built once per mount. `select` is read through a ref, so an
 * inline arrow that closes over fresh props still sees the latest values, but
 * `source` and `events` are captured on the first render: pass a stable source
 * (a controller or singleton, not a per-render object) and a fixed event list.
 * Remount against a new source with a `key` if it ever needs to change.
 */
export function useReactive<
	Source extends Eventful<Record<string, unknown>>,
	State,
>(
	source: Source,
	// lint-ignore objects-over-callbacks: a projection run to compute what the hook returns, which the guide calls fine; the ref only keeps a fresh inline arrow from re-subscribing
	select: (source: Source) => State,
	events: Array<string & keyof EventMapOf<Source>>,
): State {
	const selectRef = useRef(select);
	selectRef.current = select;

	const [store] = useState(
		() =>
			new ReactiveExternalStore(
				source,
				(source: Source) => selectRef.current(source),
				events,
			),
	);

	return useExternalStore(store);
}
