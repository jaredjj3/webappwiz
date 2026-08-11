import { Disposer } from "@webappwiz/disposable";
import { type DependencyList, useEffect } from "react";

/** A `Disposer` that can take on resources but cannot be disposed by the effect. */
export type AppendOnlyDisposer = Pick<
	Disposer,
	"disposed" | "use" | "adopt" | "defer"
>;

export type DisposerEffectCallback = (disposer: AppendOnlyDisposer) => void;

/**
 * Runs an effect that acquires resources, disposing everything it registered
 * when the effect is torn down.
 */
export function useDisposerEffect(
	effect: DisposerEffectCallback,
	deps: DependencyList,
): void {
	useEffect(() => {
		const disposer = new Disposer();
		effect(disposer);
		return () => {
			disposer.dispose();
		};
		// biome-ignore lint/correctness/useExhaustiveDependencies: deps are forwarded by the caller
	}, deps);
}
