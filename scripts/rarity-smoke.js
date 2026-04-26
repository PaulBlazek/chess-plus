import { createInitialLayout } from "../src/chess.js";
import { buildDraftChoices, RARITY_CONFIG, RULE_LIBRARY } from "../src/rules.js";

if (RARITY_CONFIG.common.weight !== 2) {
  throw new Error("Common rarity weight should be 2.");
}

if (RARITY_CONFIG.uncommon.weight !== 1) {
  throw new Error("Uncommon rarity weight should be 1.");
}

if (RARITY_CONFIG.rare.weight !== 1 / 3) {
  throw new Error("Rare rarity weight should be one third.");
}

if (RARITY_CONFIG.legendary.weight !== 0.1) {
  throw new Error("Legendary rarity weight should be 0.1.");
}

if (!RULE_LIBRARY.every((rule) => rule.rarity && RARITY_CONFIG[rule.rarity])) {
  throw new Error("Every rule should declare a known rarity.");
}

if (!RULE_LIBRARY.every((rule) => typeof rule.unique === "boolean")) {
  throw new Error("Every rule should declare whether it is unique.");
}

const state = {
  activeRules: [
    { id: "backstep-pawns" },
    { id: "diagonal-rooks" },
    { id: "orthogonal-bishops" },
  ],
  nextRulePicker: "w",
  captured: { w: [], b: [] },
  board: Array.from({ length: 8 }, () => Array(8).fill(null)),
  layout: createInitialLayout(),
};

const choices = buildDraftChoices(state, () => 0);
if (choices.length !== 3) {
  throw new Error("Draft builder should return three weighted choices when enough rules exist.");
}

const ids = new Set(choices.map((rule) => rule.id));
if (ids.size !== choices.length) {
  throw new Error("Draft choices should not repeat the same rule.");
}

if (choices.some((rule) => rule.id === "backstep-pawns")) {
  throw new Error("Active unique rules should not appear in the draft.");
}

const timedOffer = choices.find((rule) => typeof rule.offeredDuration === "number");
if (!timedOffer) {
  throw new Error("At least one deterministic weighted offer should include a rolled duration.");
}

const appliedState = {
  ...state,
  activeRules: [],
  pendingExtraTurns: { w: 0, b: 0 },
};
timedOffer.apply(appliedState, "w");
const activeVersion = appliedState.activeRules.find((rule) => rule.id === timedOffer.id);
if (!activeVersion) {
  throw new Error("Picking a timed offer should activate that rule.");
}

if (activeVersion.remainingMoves !== timedOffer.offeredDuration) {
  throw new Error("Timed rules should keep the duration shown in the draft offer.");
}

console.log("rarity smoke test passed");
