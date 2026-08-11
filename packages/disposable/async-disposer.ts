import type {
	AsyncDisposable,
	AsyncDisposableStack,
} from "./async-disposable-stack";

export class AsyncDisposer implements AsyncDisposableStack {
	private resources = [] as AsyncDisposable[];
	private _disposed = false;

	get disposed(): boolean {
		return this._disposed;
	}

	use<T extends AsyncDisposable>(disposable: T): T {
		this.assertOpen();
		this.resources.push(disposable);
		return disposable;
	}

	adopt<T>(value: T, disposeAsync: (value: T) => Promise<void>): T {
		this.assertOpen();
		this.resources.push({ disposeAsync: () => disposeAsync(value) });
		return value;
	}

	defer(onDispose: () => Promise<void>): void {
		this.assertOpen();
		this.resources.push({ disposeAsync: onDispose });
	}

	/** Safe to call twice. */
	disposeAsync = async (): Promise<void> => {
		// An arrow so it survives being passed as a callback: this is usually
		// handed straight to a shutdown hook.
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		let resource = this.resources.pop();
		while (resource) {
			await resource.disposeAsync();
			resource = this.resources.pop();
		}
	};

	private assertOpen(): void {
		if (this._disposed) {
			throw new Error("cannot register a resource on a disposed AsyncDisposer");
		}
	}
}
