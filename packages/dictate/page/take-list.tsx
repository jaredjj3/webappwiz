import { useReactive } from "@webappwiz/react";
import type { DictateApi } from "./dictate-api";
import type { DictationController } from "./dictation-controller";

export interface TakeListProps {
	dictation: DictationController;
	api: DictateApi;
}

/** Every take so far, newest first: its transcript, and its audio to play back. */
export function TakeList({ dictation, api }: TakeListProps) {
	const takes = useReactive(dictation, (each) => each.state.takes, ["changed"]);
	if (takes.length === 0) {
		return <p className="empty">No takes yet.</p>;
	}
	return (
		<ol className="takes">
			{takes.map((take) => (
				<li key={take.id}>
					<p className="transcript">{take.transcript}</p>
					{/* biome-ignore lint/a11y/useMediaCaption: a take is the user's own voice, with its transcript right above */}
					<audio controls preload="none" src={api.audioUrl(take.id)} />
				</li>
			))}
		</ol>
	);
}
