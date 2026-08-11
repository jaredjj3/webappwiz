import type { Disposable } from "./disposable";

/** Ways of getting a `Disposable` when you do not have an object to hand. */
export class disposables {
	private constructor() {}

	static noop(): Disposable {
		return disposables.callback(() => {});
	}

	static callback(dispose: () => void): Disposable {
		return { dispose };
	}

	static nullable(disposable: Disposable | null): Disposable {
		return disposable ?? disposables.noop();
	}
}
