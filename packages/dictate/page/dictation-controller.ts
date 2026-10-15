import type { Resource } from "webappwiz/disposable";
import { Dispatcher, type Eventful } from "webappwiz/events";
import type { TakeSummary } from "../dictate-service";
import type { DictateApi } from "./dictate-api";
import type { Microphone, Recording } from "./microphone";

/** Where the mic is in a take: waiting, asking for it, listening, or being transcribed. */
export type Phase = "idle" | "starting" | "recording" | "transcribing";

/** What the page shows. */
export interface DictationState {
	phase: Phase;
	/** Why the last start or take failed, until the next one. */
	error: string | undefined;
	/** Newest first. */
	takes: TakeSummary[];
}

/** Records a take, sends it off to be transcribed, and keeps the list of takes. */
export class DictationController
	implements Eventful<{ changed: undefined }>, Resource
{
	private readonly dispatcher = new Dispatcher<{ changed: undefined }>();
	readonly events = this.dispatcher.events;
	private current: DictationState = {
		phase: "idle",
		error: undefined,
		takes: [],
	};
	private recording: Recording | undefined;

	constructor(
		private readonly microphone: Microphone,
		private readonly api: DictateApi,
	) {}

	get state(): DictationState {
		return this.current;
	}

	/** Lists the takes the server already has. */
	async load(): Promise<void> {
		try {
			this.set({ takes: await this.api.list() });
		} catch (error) {
			this.set({ error: message(error) });
		}
	}

	/** Starts a take when idle, ends and transcribes it while recording. */
	async toggle(): Promise<void> {
		if (this.current.phase === "idle") {
			await this.start();
		} else if (this.current.phase === "recording") {
			await this.stop();
		}
	}

	dispose(): void {
		this.recording?.dispose();
		this.recording = undefined;
		this.dispatcher.dispose();
	}

	private async start(): Promise<void> {
		this.set({ phase: "starting", error: undefined });
		try {
			this.recording = await this.microphone.start();
			this.set({ phase: "recording" });
		} catch (error) {
			this.set({ phase: "idle", error: message(error) });
		}
	}

	private async stop(): Promise<void> {
		const recording = this.recording;
		this.recording = undefined;
		if (recording === undefined) {
			return;
		}
		this.set({ phase: "transcribing" });
		try {
			const take = await this.api.record(await recording.stop());
			this.set({ phase: "idle", takes: [take, ...this.current.takes] });
		} catch (error) {
			this.set({ phase: "idle", error: message(error) });
		}
	}

	private set(change: Partial<DictationState>): void {
		this.current = { ...this.current, ...change };
		this.dispatcher.dispatch("changed");
	}
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
