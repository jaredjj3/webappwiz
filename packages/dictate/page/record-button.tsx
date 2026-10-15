import { useReactive } from "@webappwiz/react";
import type { DictationController, Phase } from "./dictation-controller";

const LABELS: Record<Phase, string> = {
	idle: "Record",
	starting: "Asking for the mic…",
	recording: "Stop",
	transcribing: "Transcribing…",
};

export interface RecordButtonProps {
	dictation: DictationController;
}

/** Starts and stops a take. */
export function RecordButton({ dictation }: RecordButtonProps) {
	const phase = useReactive(dictation, (each) => each.state.phase, ["changed"]);
	return (
		<button
			type="button"
			className="record"
			data-phase={phase}
			disabled={phase === "starting" || phase === "transcribing"}
			onClick={() => dictation.toggle()}
		>
			{LABELS[phase]}
		</button>
	);
}
