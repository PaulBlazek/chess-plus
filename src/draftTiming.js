import { colorName } from "./chess.js";

export const INITIAL_RULE_DRAFT_INTERVAL = 2;
export const RULE_DRAFT_INTERVAL_OPTIONS = [4, 6];

export function rollDraftInterval(randomFn = Math.random) {
  const index = Math.floor(randomFn() * RULE_DRAFT_INTERVAL_OPTIONS.length);
  return RULE_DRAFT_INTERVAL_OPTIONS[index];
}

export function shouldOpenDraft(state, moverColor) {
  const turnPassedToOpponent = state.turn !== moverColor;
  return (
    !state.winner &&
    !state.pendingDraft &&
    state.movesSinceDraft >= state.ruleDraftInterval &&
    moverColor === state.nextRulePicker &&
    turnPassedToOpponent
  );
}

export function getDraftIndicatorText(state) {
  if (state.pendingDraft) {
    return `${colorName(state.pendingDraft.picker)} is choosing now`;
  }

  const pickerName = colorName(state.nextRulePicker);
  const remainingMoves = state.ruleDraftInterval - state.movesSinceDraft;
  if (remainingMoves > 0) {
    return `${pickerName} picks in about ${remainingMoves} more move${remainingMoves === 1 ? "" : "s"}`;
  }

  if (state.turn === state.nextRulePicker) {
    return `${pickerName} picks after this turn`;
  }

  return `${pickerName} picks after their next turn`;
}
