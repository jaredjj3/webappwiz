/**
 * A mutex whose scope is wider than one process, so a holder that dies has to
 * be recoverable rather than merely garbage-collected.
 */
export interface Lock {
	/** Blocks until the lock is held. */
	acquire(): Promise<void>;
	release(): Promise<void>;
	/** Releases the lock only if this process is the one holding it. */
	releaseIfOurs(): Promise<void>;
}
