import type { Guide } from "../guide";
import type { GuideLoader } from "./guide-loader";

/** Hands back the guide it was built with, whatever path it is asked for. */
export class FakeGuideLoader implements GuideLoader {
	readonly paths: string[] = [];

	constructor(private readonly guide: Guide) {}

	async load(path: string): Promise<Guide> {
		this.paths.push(path);
		return this.guide;
	}
}
