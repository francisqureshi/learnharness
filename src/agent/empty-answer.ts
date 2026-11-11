import type { AgentTurnContext, AgentTurnDecision } from "@earendil-works/pi-agent-core";

export class EmptyAnswerError extends Error {
	constructor() {
		super("The model returned no answer, even after one automatic retry. Your reply is saved. Please retry when ready.");
		this.name = "EmptyAnswerError";
	}
}

/** One recovery request per learner run, using the existing native loop so
 * admission, cancellation, usage and completed tool results retain their meaning. */
export function emptyAnswerRecovery() {
	let firstEmpty: AgentTurnContext["message"] | undefined;
	let delivered = false;
	return (turn: AgentTurnContext, signal?: AbortSignal): AgentTurnDecision | undefined => {
		const message = turn.message;
		// A transport failure on the recovery request must not leave the first
		// empty success blocking the existing trailing-failure Retry contract.
		if (firstEmpty && message.stopReason === "error") {
			firstEmpty.stopReason = "error";
			firstEmpty.errorMessage = "The model returned no answer.";
		}
		if (message.content.some(block => block.type === "text" && block.text.trim()) ||
			turn.toolResults.some(result => result.toolName === "send_to_user" && !result.isError)) delivered = true;
		if (signal?.aborted || delivered || message.stopReason !== "stop" ||
			message.content.some(block => block.type === "toolCall")) return;
		if (!firstEmpty) {
			firstEmpty = message;
			return { action: "continue" };
		}
		const error = new EmptyAnswerError();
		// The native message is shared with the agent state. Preserve its usage
		// and identity, but persist a failure so Retry also works after reload.
		for (const attempt of [firstEmpty, message]) {
			attempt.stopReason = "error";
			attempt.errorMessage = error.message;
		}
		throw error;
	};
}
