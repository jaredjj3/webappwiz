/**
 * Fs is the filesystem seam. Typically, this is assigned the variable name `fs`.
 */
export interface Fs {
	exists(path: string): Promise<boolean>;
	mkdir(path: string, options?: MkdirOptions): Promise<void>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	rename(from: string, to: string): Promise<void>;
	readdir(path: string): Promise<string[]>;
	stat(path: string): Promise<StatResult>;
	rm(path: string, options?: RmOptions): Promise<void>;
}

export interface MkdirOptions {
	/**
	 * Defaults to true. Pass false for a create-or-throw: the failure is what
	 * makes `mkdir` usable as a mutex.
	 */
	recursive?: boolean;
}

export interface RmOptions {
	recursive?: boolean;
	force?: boolean;
}

export interface StatResult {
	isDirectory(): boolean;
	/** Bytes on disk. Zero for a directory. */
	size: number;
}
