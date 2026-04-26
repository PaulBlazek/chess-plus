import {
  algebraicFromCoords,
  applyMoveToState,
  collectMoves,
  createInitialBoard,
  createInitialLayout,
  isKingThreatened,
} from "../src/chess.js";
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
  layout: createInitialLayout(),
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
applyMoveToState(state, ePawnDouble, {
  turnContext: {
    isBonusTurn: false,
    moverColor: "w",
  },
});
if (state.pendingExtraTurns.w !== 1) {
  throw new Error("Double Time did not schedule an extra turn.");
}

const bonusMove = collectMoves(state, 7, 6).find((move) => move.to.row === 5 && move.to.col === 5);
applyMoveToState(state, bonusMove, {
  turnContext: {
    isBonusTurn: true,
    moverColor: "w",
  },
});
if (state.pendingExtraTurns.w !== 1) {
  throw new Error("Double Time should not chain from the bonus turn it created.");
}
state.pendingExtraTurns.w -= 1;
if (state.pendingExtraTurns.w !== 0) {
  throw new Error("Bonus turn bookkeeping should be spendable after use.");
}

const blackPawnMove = collectMoves(state, 1, 4).find((move) => move.to.row === 3 && move.to.col === 4);
applyMoveToState(state, blackPawnMove, {
  turnContext: {
    isBonusTurn: false,
    moverColor: "b",
  },
});
if (state.pendingExtraTurns.b !== 1) {
  throw new Error("Double Time should affect both players.");
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
  layout: createInitialLayout(),
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

const queensGiftState = {
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
  layout: createInitialLayout(),
  nextRulePicker: "b",
  pendingDraft: null,
  enPassantTarget: null,
  lastCaptured: null,
};
const queensGift = RULE_LIBRARY.find((rule) => rule.id === "queens-gift");
queensGiftState.board[6][4] = null;
queensGiftState.board[4][4] = { type: "p", color: "w", hasMoved: true };
queensGiftState.board[1][3] = null;
queensGiftState.board[3][3] = { type: "p", color: "b", hasMoved: true };
queensGift.apply(queensGiftState, "w");
if (queensGiftState.board[4][4]?.type !== "q" || queensGiftState.board[3][3]?.type !== "q") {
  throw new Error("Queen's Gift should promote a pawn for both players when both have one.");
}

const expansionState = {
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
  layout: createInitialLayout(),
  nextRulePicker: "b",
  pendingDraft: null,
  enPassantTarget: null,
  lastCaptured: null,
};
const expansionRule = RULE_LIBRARY.find((rule) => rule.id === "board-expansion");
expansionRule.apply(expansionState, "w");
if (expansionState.board.length !== 10 || expansionState.board[1][1]?.type !== "r") {
  throw new Error("Board Expansion should wrap the board in a new empty border.");
}
if (
  algebraicFromCoords(0, 0, expansionState.board, expansionState.layout) !== "-a9" ||
  algebraicFromCoords(9, 9, expansionState.board, expansionState.layout) !== "i0" ||
  algebraicFromCoords(1, 1, expansionState.board, expansionState.layout) !== "a8"
) {
  throw new Error("Board Expansion should preserve original labels and add new outer coordinates.");
}
const whitePawnAdvance = collectMoves(expansionState, 7, 1).find(
  (move) => move.to.row === 6 && move.to.col === 1,
);
if (!whitePawnAdvance) {
  throw new Error("Pieces should still have valid moves after Board Expansion.");
}

const reinforcementsState = {
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
  layout: createInitialLayout(),
  nextRulePicker: "b",
  pendingDraft: null,
  enPassantTarget: null,
  lastCaptured: null,
};
reinforcementsState.board[1][3] = null;
reinforcementsState.board[6][4] = null;
const reinforcements = RULE_LIBRARY.find((rule) => rule.id === "reinforcements");
reinforcements.apply(reinforcementsState, "w");
if (
  reinforcementsState.board[1][3]?.type !== "p" ||
  reinforcementsState.board[1][3]?.color !== "b" ||
  reinforcementsState.board[6][4]?.type !== "p" ||
  reinforcementsState.board[6][4]?.color !== "w"
) {
  throw new Error("Reinforcements should refill empty squares on both reserve pawn ranks.");
}

const openGravesState = {
  board: createInitialBoard(),
  turn: "w",
  winner: null,
  activeRules: [],
  captured: {
    w: [{ type: "n", color: "w", hasMoved: true }],
    b: [{ type: "b", color: "b", hasMoved: true }],
  },
  pendingExtraTurns: { w: 0, b: 0 },
  moveLog: [],
  ply: 0,
  movesSinceDraft: 0,
  ruleDraftInterval: 4,
  layout: createInitialLayout(),
  nextRulePicker: "b",
  pendingDraft: null,
  enPassantTarget: null,
  lastCaptured: null,
};
const openGraves = RULE_LIBRARY.find((rule) => rule.id === "open-the-graves");
openGravesState.board[7][1] = null;
openGravesState.board[0][2] = null;
openGraves.apply(openGravesState, "w");
if (
  openGravesState.captured.w.length !== 0 ||
  openGravesState.captured.b.length !== 0 ||
  openGravesState.board[7][1]?.type !== "n" ||
  openGravesState.board[0][2]?.type !== "b"
) {
  throw new Error("Open the Graves should revive captured pieces onto empty home-side rows.");
}

if (isKingThreatened(state, "w")) {
  throw new Error("White king should not be threatened in the smoke test line.");
}

console.log("logic smoke test passed");
