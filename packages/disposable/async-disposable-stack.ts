/** Something holding a resource whose release has to be awaited. */
export interface AsyncDisposable {
	disposeAsync(): Promise<void>;
}

/** A stack of async disposables, released in reverse order of registration. */
export interface AsyncDisposableStack extends AsyncDisposable {
	readonly disposed: boolean;
	use<T extends AsyncDisposable>(resource: T): T;
	adopt<T>(value: T, dispose: (value: T) => Promise<void>): T;
	defer(onDispose: () => Promise<void>): void;
	disposeAsync(): Promise<void>;
}
