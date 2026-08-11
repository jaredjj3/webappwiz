/** Something holding a resource that must be released. */
export interface Disposable {
	dispose(): void;
}
