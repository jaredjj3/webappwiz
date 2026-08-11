import type { Disposable } from "@webappwiz/disposable";
import { useRef, useState } from "react";
import { useDisposerEffect } from "./use-disposer-effect";

/**
 * Owns a disposable for the lifetime of a single mount. The factory builds the
 * resource; it is disposed when the component unmounts or when the factory's
 * identity changes (a constructor argument changed), at which point a fresh
 * instance is built.
 *
 * Takes a factory rather than a prebuilt instance so a disposed instance is
 * never handed back. Constructing at render but disposing in effect cleanup
 * desyncs when React runs a mount/unmount/mount cycle that reuses the fiber's
 * hook state (route prefetch, offscreen): the unmount disposes the memoized
 * instance and the remount re-adopts that same, now-disposed instance.
 *
 * Construction happens at render, not in the effect. This is load-bearing for
 * deep resource graphs: a dependent resource built later in the same render
 * must read the rebuilt instance immediately. Building in the effect and
 * swapping it in afterwards returns a one-render-stale instance after a
 * dependency change, so a downstream resource gets wired against the previous
 * (disposed) upstream during the rebuild cascade.
 *
 * REQUIREMENT: the factory and the disposable's constructor must be
 * render-pure. They may wire up in-memory state and pure helper objects, but
 * must not acquire resources that need cleanup (timers, event or DOM
 * subscriptions, workers, audio nodes, network, global mutation). Because
 * construction happens at render, a render React abandons before commit (an
 * interrupted concurrent render, a throw elsewhere in the tree) builds an
 * instance whose disposing effect never runs, and anything acquired there
 * leaks. Acquire such resources after commit, via `useDisposerEffect`.
 */
export function useDisposable<T extends Disposable>(factory: () => T): T {
	const [generation, setGeneration] = useState(0);

	// Instances disposed by a prior effect cleanup. Checked below so a disposed
	// instance is never handed back, even for a single committed render: React
	// can reuse this fiber's hook state across an unmount/remount (route
	// prefetch, offscreen) and the preserved memo would return the dead one.
	const retiredRef = useRef<WeakSet<Disposable>>(new WeakSet());

	// A manual ref memo rather than useMemo, so the instance is never
	// spuriously recomputed: it is rebuilt only when the factory changes, the
	// generation bumps, or the memoized instance has been retired.
	const memo = useRef<{
		factory: () => T;
		generation: number;
		instance: T;
	} | null>(null);
	if (
		memo.current === null ||
		memo.current.factory !== factory ||
		memo.current.generation !== generation ||
		retiredRef.current.has(memo.current.instance)
	) {
		memo.current = { factory, generation, instance: factory() };
	}
	const instance = memo.current.instance;

	useDisposerEffect(
		(disposer) => {
			if (retiredRef.current.has(instance)) {
				// The effect re-attached onto an instance a prior run already
				// disposed, with no intervening render to rebuild it (StrictMode
				// effect replay, some remount shapes). Bump the generation to
				// force a render so the memo rebuilds, rather than re-adopting
				// the dead instance.
				setGeneration((generation) => generation + 1);
				return;
			}
			disposer.use(instance);
			disposer.defer(() => retiredRef.current.add(instance));
		},
		[instance],
	);

	return instance;
}
