import type { Guide } from "../guide";

/** Turns a guide module path into the guide it default-exports. */
export interface GuideLoader {
	load(path: string): Promise<Guide>;
}
