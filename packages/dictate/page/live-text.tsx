import { useReactive } from "@webappwiz/react";
import type { DictationController } from "./dictation-controller";

export interface LiveTextProps {
	dictation: DictationController;
}

/** The take under way as it is heard, until it is kept and listed. */
export function LiveText({ dictation }: LiveTextProps) {
	const phase = useReactive(dictation, (each) => each.state.phase, ["changed"]);
	const live = useReactive(dictation, (each) => each.state.live, ["changed"]);
	if (phase !== "recording" && phase !== "transcribing" && live === "") {
		return null;
	}
	return (
		<p className="live" data-empty={live === ""} aria-live="polite">
			{live === "" ? "Listening…" : live}
		</p>
	);
}
