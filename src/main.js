import {
  PIECE_SYMBOLS,
  algebraicFromCoords,
  applyMoveToState,
  collectMoves,
  colorName,
  createInitialBoard,
  createInitialLayout,
  isKingThreatened,
  moveSummary,
  simulateMove,
} from "./chess.js";
import {
  getDraftIndicatorText,
  INITIAL_RULE_DRAFT_INTERVAL,
  rollDraftInterval,
  shouldOpenDraft,
} from "./draftTiming.js";
import { buildDraftChoices, getRarityDetails, getRuleStatusLine } from "./rules.js";

const state = createGameState();

const boardEl = document.querySelector("#board");
const boardViewportEl = document.querySelector("#board-viewport");
const turnIndicatorEl = document.querySelector("#turn-indicator");
const draftIndicatorEl = document.querySelector("#draft-indicator");
const warningBannerEl = document.querySelector("#warning-banner");
const moveHintsEl = document.querySelector("#move-hints");
const activeRulesEl = document.querySelector("#active-rules");
const capturedWhiteEl = document.querySelector("#captured-white");
const capturedBlackEl = document.querySelector("#captured-black");
const moveLogEl = document.querySelector("#move-log");
const draftModalEl = document.querySelector("#draft-modal");
const draftTitleEl = document.querySelector("#draft-title");
const draftCopyEl = document.querySelector("#draft-copy");
const draftOptionsEl = document.querySelector("#draft-options");
const restartButtonEl = document.querySelector("#restart-button");

restartButtonEl.addEventListener("click", () => {
  Object.assign(state, createGameState());
  render();
});

boardEl.addEventListener("click", (event) => {
  const square = event.target.closest("[data-square]");
  if (!square || state.pendingDraft || state.winner) {
    return;
  }

  const row = Number(square.dataset.row);
  const col = Number(square.dataset.col);
  handleSquareClick(row, col);
});

function createGameState() {
  return {
    board: createInitialBoard(),
    turn: "w",
    winner: null,
    selection: null,
    moveOptions: [],
    activeRules: [],
    captured: { w: [], b: [] },
    pendingExtraTurns: { w: 0, b: 0 },
    moveLog: [],
    ply: 0,
    movesSinceDraft: 0,
    ruleDraftInterval: INITIAL_RULE_DRAFT_INTERVAL,
    layout: createInitialLayout(),
    nextRulePicker: "b",
    pendingDraft: null,
    enPassantTarget: null,
    lastCaptured: null,
  };
}

function handleSquareClick(row, col) {
  const selectedMove = state.moveOptions.find(
    (move) => move.to.row === row && move.to.col === col,
  );

  if (selectedMove) {
    makeMove(selectedMove);
    return;
  }

  const piece = state.board[row][col];
  if (!piece || piece.color !== state.turn) {
    state.selection = null;
    state.moveOptions = [];
    render();
    return;
  }

  state.selection = { row, col };
  state.moveOptions = annotateMoves(collectMoves(state, row, col));
  render();
}

function annotateMoves(moves) {
  return moves.map((move) => {
    const simulated = simulateMove(state, move);
    const selfThreat = isKingThreatened(simulated, move.piece.color);
    const enemyColor = move.piece.color === "w" ? "b" : "w";
    const enemyThreat = isKingThreatened(simulated, enemyColor);
    return {
      ...move,
      selfThreat,
      enemyThreat,
      takesKing: move.capture?.type === "k",
    };
  });
}

function makeMove(move) {
  const moverColor = move.piece.color;
  const isBonusTurn = state.pendingExtraTurns[state.turn] > 0;
  const beforeMove = {
    ...state,
    board: state.board.map((row) => row.map((piece) => (piece ? { ...piece } : null))),
  };

  applyMoveToState(state, move, {
    turnContext: {
      isBonusTurn,
      moverColor,
    },
  });
  state.ply += 1;
  state.movesSinceDraft += 1;
  state.moveLog.unshift({
    index: state.ply,
    text: `${colorName(move.piece.color)}: ${moveSummary(move, beforeMove)}`,
  });

  state.selection = null;
  state.moveOptions = [];

  if (!state.winner) {
    if (isBonusTurn) {
      state.pendingExtraTurns[state.turn] -= 1;
      if (state.pendingExtraTurns[state.turn] <= 0) {
        state.pendingExtraTurns[state.turn] = 0;
        state.turn = state.turn === "w" ? "b" : "w";
      }
    } else if (state.pendingExtraTurns[state.turn] > 0) {
      // A normal turn can cash in one queued bonus move and keep the turn.
    } else {
      state.turn = state.turn === "w" ? "b" : "w";
    }
  }

  if (shouldOpenDraft(state, moverColor)) {
    openDraft();
  }

  render();
}

function openDraft() {
  const options = buildDraftChoices(state);
  if (!options.length) {
    state.movesSinceDraft = 0;
    state.ruleDraftInterval = rollDraftInterval();
    state.nextRulePicker = state.nextRulePicker === "w" ? "b" : "w";
    return;
  }

  state.pendingDraft = {
    picker: state.nextRulePicker,
    options,
  };
}

function resolveDraft(ruleId) {
  const draft = state.pendingDraft;
  if (!draft) {
    return;
  }

  const rule = draft.options.find((option) => option.id === ruleId);
  if (!rule) {
    return;
  }

  const note = rule.apply(state, draft.picker);
  state.moveLog.unshift({
    index: `R${state.ply}`,
    text: `Rule: ${rule.name} - ${note}`,
  });
  state.movesSinceDraft = 0;
  state.ruleDraftInterval = rollDraftInterval();
  state.nextRulePicker = draft.picker === "w" ? "b" : "w";
  state.pendingDraft = null;
  state.selection = null;
  state.moveOptions = [];
  render();
}

function renderBoard() {
  const tileSize = state.board.length <= 8 ? 0 : 64;
  const boardPixelSize = tileSize ? state.board.length * tileSize : 0;
  const hints = new Map(
    state.moveOptions.map((move) => [
      `${move.to.row},${move.to.col}`,
      move,
    ]),
  );

  boardEl.innerHTML = "";
  boardEl.style.gridTemplateColumns = `repeat(${state.board.length}, minmax(0, 1fr))`;
  boardEl.style.minWidth = boardPixelSize ? `${boardPixelSize}px` : "";
  boardEl.style.minHeight = boardPixelSize ? `${boardPixelSize}px` : "";
  boardViewportEl.classList.toggle("is-scrollable", state.board.length > 8);

  for (let row = 0; row < state.board.length; row += 1) {
    for (let col = 0; col < state.board[row].length; col += 1) {
      const squareEl = document.createElement("button");
      squareEl.type = "button";
      squareEl.className = `square ${(row + col) % 2 === 0 ? "light" : "dark"}`;
      squareEl.dataset.square = `${row},${col}`;
      squareEl.dataset.row = String(row);
      squareEl.dataset.col = String(col);

      if (state.selection?.row === row && state.selection?.col === col) {
        squareEl.classList.add("selected");
      }

      const hintedMove = hints.get(`${row},${col}`);
      if (hintedMove) {
        squareEl.classList.add(hintedMove.capture ? "capture" : "valid");
        if (hintedMove.selfThreat) {
          squareEl.classList.add("risky");
        }
        if (hintedMove.takesKing) {
          squareEl.classList.add("king-take");
        }
      }

      const piece = state.board[row][col];
      if (piece) {
        squareEl.textContent = PIECE_SYMBOLS[`${piece.color}${piece.type}`];
      }

      const coordsEl = document.createElement("span");
      coordsEl.className = "coords";
      coordsEl.textContent = algebraicFromCoords(row, col, state.board, state.layout);
      squareEl.append(coordsEl);
      boardEl.append(squareEl);
    }
  }
}

function renderStatus() {
  turnIndicatorEl.textContent = state.winner
    ? `${colorName(state.winner)} wins`
    : colorName(state.turn);

  draftIndicatorEl.textContent = getDraftIndicatorText(state);

  const warnings = [];
  if (isKingThreatened(state, "w")) {
    warnings.push("White king is exposed.");
  }
  if (isKingThreatened(state, "b")) {
    warnings.push("Black king is exposed.");
  }
  if (state.winner) {
    warnings.unshift(`${colorName(state.winner)} captured the king and wins.`);
  }
  warningBannerEl.textContent = warnings.join(" ");

  if (state.selection && state.moveOptions.length) {
    const riskyMoves = state.moveOptions.filter((move) => move.selfThreat).length;
    const kingTakes = state.moveOptions.filter((move) => move.takesKing).length;
    const parts = [];
    if (riskyMoves) {
      parts.push(`${riskyMoves} move${riskyMoves === 1 ? "" : "s"} leave your king exposed`);
    }
    if (kingTakes) {
      parts.push(`${kingTakes} move${kingTakes === 1 ? "" : "s"} can capture the king`);
    }
    moveHintsEl.textContent = parts.length
      ? parts.join(" | ")
      : "Choose any highlighted destination.";
  } else {
    moveHintsEl.textContent =
      "Select a piece to see pseudo-legal moves. Check is advisory only.";
  }
}

function renderRules() {
  if (!state.activeRules.length) {
    activeRulesEl.className = "rule-list empty-state";
    activeRulesEl.textContent = "No active rule effects yet.";
    return;
  }

  activeRulesEl.className = "rule-list";
  activeRulesEl.innerHTML = "";
  for (const rule of state.activeRules) {
    const item = document.createElement("div");
    const rarity = getRarityDetails(rule.rarity);
    item.className = `rule-chip rarity-${rule.rarity ?? "common"}`;
    item.innerHTML = `
      <div class="rule-heading">
        <strong>${rule.name}</strong>
        <div class="badge-row">
          <span class="rarity-badge">${rarity.label}</span>
          ${rule.unique ? '<span class="rule-tag">Unique</span>' : ""}
        </div>
      </div>
      <div>${rule.description}</div>
      <div class="rule-meta">${getRuleStatusLine(rule)}</div>
    `;
    activeRulesEl.append(item);
  }
}

function renderCaptured() {
  capturedWhiteEl.textContent = state.captured.w
    .map((piece) => PIECE_SYMBOLS[`${piece.color}${piece.type}`])
    .join(" ");
  capturedBlackEl.textContent = state.captured.b
    .map((piece) => PIECE_SYMBOLS[`${piece.color}${piece.type}`])
    .join(" ");
}

function renderMoveLog() {
  moveLogEl.innerHTML = "";
  for (const move of state.moveLog) {
    const item = document.createElement("li");
    item.textContent = typeof move.index === "number" ? `${move.index}. ${move.text}` : move.text;
    moveLogEl.append(item);
  }
}

function renderDraft() {
  if (!state.pendingDraft) {
    draftModalEl.classList.add("hidden");
    draftModalEl.setAttribute("aria-hidden", "true");
    return;
  }

  const { picker, options } = state.pendingDraft;
  draftModalEl.classList.remove("hidden");
  draftModalEl.setAttribute("aria-hidden", "false");
  draftTitleEl.textContent = `${colorName(picker)} chooses a new rule`;
  draftCopyEl.textContent =
    "Pick one of the three offers. Effects are modular and can stack with existing rule changes, so things may get delightfully strange.";

  draftOptionsEl.innerHTML = "";
  for (const option of options) {
    const rarity = getRarityDetails(option.rarity);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `draft-card rarity-${option.rarity ?? "common"}`;
    button.innerHTML = `
      <div class="draft-topline">
        <span class="draft-kind">${option.kind}</span>
        <div class="badge-row">
          <span class="rarity-badge">${rarity.label}</span>
          ${option.unique ? '<span class="rule-tag">Unique</span>' : ""}
        </div>
      </div>
      <strong>${option.name}</strong>
      <span>${option.description}</span>
    `;
    button.addEventListener("click", () => resolveDraft(option.id));
    draftOptionsEl.append(button);
  }
}

function render() {
  renderBoard();
  renderStatus();
  renderRules();
  renderCaptured();
  renderMoveLog();
  renderDraft();
}

render();
