/** Something holding a resource that must be released. */
export interface Disposable {
	dispose(): void;
}

/** A stack of disposables, released in reverse order of registration. */
export interface DisposableStack extends Disposable {
	readonly disposed: boolean;
	use<T extends Disposable>(resource: T): T;
	adopt<T>(value: T, dispose: (value: T) => void): T;
	defer(onDispose: () => void): void;
	dispose(): void;
}
