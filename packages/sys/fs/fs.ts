/**
 * Fs is the filesystem seam. Typically, this is assigned the variable name `fs`.
 */
export interface Fs {
	exists(path: string): Promise<boolean>;
	mkdir(path: string): Promise<void>;
	read(path: string): Promise<string>;
	write(path: string, data: string): Promise<void>;
	readdir(path: string): Promise<string[]>;
	stat(path: string): Promise<StatResult>;
	rm(path: string, options?: RmOptions): Promise<void>;
}

export interface RmOptions {
	recursive?: boolean;
	force?: boolean;
}

export interface StatResult {
	isDirectory(): boolean;
}
