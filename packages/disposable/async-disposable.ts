/** Something holding a resource whose release has to be awaited. */
export interface AsyncDisposable {
	disposeAsync(): Promise<void>;
}
