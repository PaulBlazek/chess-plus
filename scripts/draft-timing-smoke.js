import {
  getDraftIndicatorText,
  INITIAL_RULE_DRAFT_INTERVAL,
  rollDraftInterval,
  shouldOpenDraft,
} from "../src/draftTiming.js";

if (INITIAL_RULE_DRAFT_INTERVAL !== 2) {
  throw new Error("The opening draft interval should be 2 moves.");
}

const baseState = {
  winner: null,
  pendingDraft: null,
  movesSinceDraft: 6,
  ruleDraftInterval: 6,
  nextRulePicker: "b",
  turn: "w",
};

if (!shouldOpenDraft(baseState, "b")) {
  throw new Error("Black should draft after ending their own turn once the timer is ready.");
}

if (shouldOpenDraft({ ...baseState, turn: "b" }, "b")) {
  throw new Error("Draft should not open while the picker still has another move.");
}

if (shouldOpenDraft({ ...baseState, nextRulePicker: "w" }, "b")) {
  throw new Error("Draft should not open off the wrong player's turn.");
}

const waitingText = getDraftIndicatorText({
  winner: null,
  pendingDraft: null,
  movesSinceDraft: 6,
  ruleDraftInterval: 6,
  nextRulePicker: "b",
  turn: "b",
});

if (waitingText !== "Black picks after this turn") {
  throw new Error(`Unexpected draft status text: ${waitingText}`);
}

const openingText = getDraftIndicatorText({
  winner: null,
  pendingDraft: null,
  movesSinceDraft: 1,
  ruleDraftInterval: INITIAL_RULE_DRAFT_INTERVAL,
  nextRulePicker: "b",
  turn: "b",
});

if (openingText !== "Black picks in about 1 more move") {
  throw new Error(`Unexpected opening draft status text: ${openingText}`);
}

for (let i = 0; i < 20; i += 1) {
  const interval = rollDraftInterval();
  if (interval !== 4 && interval !== 6) {
    throw new Error(`Draft interval should only be 4 or 6, got ${interval}.`);
  }
}

console.log("draft timing smoke test passed");
