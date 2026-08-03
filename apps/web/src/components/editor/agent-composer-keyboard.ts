export interface AgentComposerKeyEvent {
	key: string;
	shiftKey: boolean;
	isComposing: boolean;
	keyCode: number;
}

export function shouldSubmitAgentComposer({
	key,
	shiftKey,
	isComposing,
	keyCode,
}: AgentComposerKeyEvent): boolean {
	return (
		key === "Enter" && !shiftKey && !isComposing && keyCode !== 229
	);
}
