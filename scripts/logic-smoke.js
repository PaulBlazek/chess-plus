import { applyMoveToState, collectMoves, createInitialBoard, isKingThreatened } from "../src/chess.js";
import { rollDuration, RULE_LIBRARY } from "../src/rules.js";

const state = {
  board: createInitialBoard(),
  turn: "w",
  winner: null,
  activeRules: [],
  captured: { w: [], b: [] },
  pendingExtraTurns: { w: 0, b: 0 },
  moveLog: [],
  ply: 0,
  movesSinceDraft: 0,
  ruleDraftInterval: 4,
  nextRulePicker: "b",
  pendingDraft: null,
  enPassantTarget: null,
  lastCaptured: null,
};

const pawnMoves = collectMoves(state, 6, 4);
if (!pawnMoves.some((move) => move.to.row === 4 && move.to.col === 4)) {
  throw new Error("Expected the e2 pawn to have a double-step move.");
}

const doubleTime = RULE_LIBRARY.find((rule) => rule.id === "double-time");
doubleTime.apply(state, "w");
const ePawnDouble = pawnMoves.find((move) => move.to.row === 4 && move.to.col === 4);
applyMoveToState(state, ePawnDouble);
if (state.pendingExtraTurns.w !== 1) {
  throw new Error("Double Time did not schedule an extra turn.");
}

const backstep = RULE_LIBRARY.find((rule) => rule.id === "backstep-pawns");
backstep.apply(state, "b");
const backMoves = collectMoves(state, 4, 4);
if (!backMoves.some((move) => move.to.row === 5 && move.to.col === 4)) {
  throw new Error("Backstep Pawns did not add a backward move.");
}

const sprintState = {
  board: createInitialBoard(),
  turn: "w",
  winner: null,
  activeRules: [],
  captured: { w: [], b: [] },
  pendingExtraTurns: { w: 0, b: 0 },
  moveLog: [],
  ply: 0,
  movesSinceDraft: 0,
  ruleDraftInterval: 4,
  nextRulePicker: "b",
  pendingDraft: null,
  enPassantTarget: null,
  lastCaptured: null,
};

const royalSprint = RULE_LIBRARY.find((rule) => rule.id === "royal-sprint");
royalSprint.apply(sprintState, "w");
const sprintMoves = collectMoves(sprintState, 7, 4);
if (sprintMoves.some((move) => move.to.row === 5 && move.to.col === 4)) {
  throw new Error("Royal Sprint should not let a king move through a blocking piece.");
}

const ceasefire = RULE_LIBRARY.find((rule) => rule.id === "ceasefire");
for (let i = 0; i < 10; i += 1) {
  if (rollDuration(ceasefire.duration) % 2 !== 0) {
    throw new Error("Ceasefire should only roll an even-numbered duration.");
  }
}

const cavalryDoctrine = RULE_LIBRARY.find((rule) => rule.id === "cavalry-doctrine");
for (let i = 0; i < 10; i += 1) {
  if (rollDuration(cavalryDoctrine.duration) % 2 !== 1) {
    throw new Error("Cavalry Doctrine should only roll an odd-numbered duration.");
  }
}

const knightedKings = RULE_LIBRARY.find((rule) => rule.id === "knighted-kings");
for (let i = 0; i < 10; i += 1) {
  const duration = rollDuration(knightedKings.duration);
  if (duration < 3 || duration > 8 || duration % 2 !== 0) {
    throw new Error("Knighted Kings should only roll an even duration between 3 and 8.");
  }
}

if (isKingThreatened(state, "w")) {
  throw new Error("White king should not be threatened in the smoke test line.");
}

console.log("logic smoke test passed");
