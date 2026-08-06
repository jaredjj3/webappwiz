import type { Disposable, DisposableStack } from "./disposable-stack";
import { disposables } from "./disposables";

export class Disposer implements DisposableStack {
	private resources = [] as Disposable[];
	private _disposed = false;

	get disposed(): boolean {
		return this._disposed;
	}

	use<T extends Disposable>(disposable: T): T {
		this.assertOpen();
		this.resources.push(disposable);
		return disposable;
	}

	adopt<T>(value: T, dispose: (value: T) => void): T {
		this.assertOpen();
		this.resources.push(disposables.callback(() => dispose(value)));
		return value;
	}

	defer(onDispose: () => void): void {
		this.assertOpen();
		this.resources.push(disposables.callback(onDispose));
	}

	/** Releases in reverse order, so a resource outlives whatever it depends on. */
	dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		let resource = this.resources.pop();
		while (resource) {
			resource.dispose();
			resource = this.resources.pop();
		}
	}

	private assertOpen(): void {
		if (this._disposed) {
			throw new Error("cannot register a resource on a disposed Disposer");
		}
	}
}
