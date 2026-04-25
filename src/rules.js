import { algebraicFromCoords, colorName, findKing, inBounds } from "./chess.js";

export const RARITY_CONFIG = {
  common: {
    label: "Common",
    weight: 2,
    colorVar: "--rarity-common",
  },
  uncommon: {
    label: "Uncommon",
    weight: 1,
    colorVar: "--rarity-uncommon",
  },
  rare: {
    label: "Rare",
    weight: 1 / 3,
    colorVar: "--rarity-rare",
  },
  legendary: {
    label: "Legendary",
    weight: 0.1,
    colorVar: "--rarity-legendary",
  },
};

function addOrthogonalStepMoves(board, moves, piece, row, col, pushStepMove) {
  for (const [dRow, dCol] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    pushStepMove(board, moves, piece, row, col, row + dRow, col + dCol);
  }
  return moves;
}

function addDiagonalStepMoves(board, moves, piece, row, col, pushStepMove) {
  for (const [dRow, dCol] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    pushStepMove(board, moves, piece, row, col, row + dRow, col + dCol);
  }
  return moves;
}

function addKnightMoves(board, moves, piece, row, col, pushStepMove) {
  for (const [dRow, dCol] of [
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
  ]) {
    pushStepMove(board, moves, piece, row, col, row + dRow, col + dCol);
  }
  return moves;
}

function addLongKingStep(board, moves, piece, row, col, dRow, dCol, pushStepMove) {
  const toRow = row + dRow;
  const toCol = col + dCol;
  const stepCount = Math.max(Math.abs(dRow), Math.abs(dCol));
  const rowStep = Math.sign(dRow);
  const colStep = Math.sign(dCol);

  for (let step = 1; step < stepCount; step += 1) {
    const middleRow = row + rowStep * step;
    const middleCol = col + colStep * step;
    if (!inBounds(middleRow, middleCol) || board[middleRow][middleCol]) {
      return moves;
    }
  }

  pushStepMove(board, moves, piece, row, col, toRow, toCol);
  return moves;
}

function nearestOpenStartingSquare(state, color, type) {
  const homeRow = color === "w" ? 7 : 0;
  const pawnRow = color === "w" ? 6 : 1;
  const preferredCols = {
    q: [3],
    r: [0, 7],
    b: [2, 5],
    n: [1, 6],
    p: [0, 1, 2, 3, 4, 5, 6, 7],
  };

  const row = type === "p" ? pawnRow : homeRow;
  for (const col of preferredCols[type] ?? []) {
    if (!state.board[row][col]) {
      return { row, col };
    }
  }

  for (let altRow = 0; altRow < 8; altRow += 1) {
    for (let altCol = 0; altCol < 8; altCol += 1) {
      if (!state.board[altRow][altCol]) {
        return { row: altRow, col: altCol };
      }
    }
  }

  return null;
}

function furthestPawn(state, color) {
  let best = null;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (!piece || piece.color !== color || piece.type !== "p") {
        continue;
      }

      const progress = color === "w" ? 7 - row : row;
      if (!best || progress > best.progress) {
        best = { row, col, progress };
      }
    }
  }
  return best;
}

function pickRandomInt(min, max, randomFn = Math.random) {
  return min + Math.floor(randomFn() * (max - min + 1));
}

export function rollDuration(duration, randomFn = Math.random) {
  const values = [];
  for (let value = duration.min; value <= duration.max; value += 1) {
    if (duration.parity === "even" && value % 2 !== 0) {
      continue;
    }
    if (duration.parity === "odd" && value % 2 === 0) {
      continue;
    }
    values.push(value);
  }

  if (!values.length) {
    throw new Error(`No valid move duration for range ${duration.min}-${duration.max} with parity ${duration.parity}.`);
  }

  return values[pickRandomInt(0, values.length - 1, randomFn)];
}

function pluralizeMoves(count) {
  return `${count} move${count === 1 ? "" : "s"}`;
}

function createTimedRule(baseRule, owner, extra = {}) {
  const remainingMoves = extra.remainingMoves ?? rollDuration(baseRule.duration);
  return {
    id: baseRule.id,
    kind: baseRule.kind,
    rarity: baseRule.rarity,
    unique: Boolean(baseRule.unique),
    owner,
    name: baseRule.name,
    description: baseRule.activeDescription ?? baseRule.description,
    remainingMoves,
    duration: { ...baseRule.duration },
    ...extra,
  };
}

function formatDraftDescription(rule, rolledDuration) {
  if (typeof rolledDuration === "number") {
    return `${rule.description} This offer lasts ${pluralizeMoves(rolledDuration)}.`;
  }
  return rule.description;
}

function createDraftOption(rule, randomFn = Math.random) {
  const rolledDuration = rule.duration ? rollDuration(rule.duration, randomFn) : null;
  return {
    ...rule,
    offeredDuration: rolledDuration,
    description: formatDraftDescription(rule, rolledDuration),
  };
}

function describeDuration(rule) {
  if (typeof rule.remainingMoves === "number") {
    return `${rule.remainingMoves} ${rule.remainingMoves === 1 ? "move" : "moves"} left`;
  }
  if (typeof rule.remainingTriggers === "number") {
    return `${rule.remainingTriggers} ${rule.remainingTriggers === 1 ? "trigger" : "triggers"} left`;
  }
  return "Permanent";
}

export function getRuleStatusLine(rule) {
  const owner = rule.owner ? `${colorName(rule.owner)} picked` : "Global";
  return `${owner} | ${describeDuration(rule)}`;
}

export function getRarityDetails(rarity) {
  return RARITY_CONFIG[rarity] ?? RARITY_CONFIG.common;
}

function weightedPick(pool, randomFn = Math.random) {
  const totalWeight = pool.reduce(
    (sum, rule) => sum + getRarityDetails(rule.rarity).weight,
    0,
  );
  let roll = randomFn() * totalWeight;
  for (const rule of pool) {
    roll -= getRarityDetails(rule.rarity).weight;
    if (roll <= 0) {
      return rule;
    }
  }
  return pool.at(-1);
}

function weightedSample(pool, count, randomFn = Math.random) {
  const remaining = [...pool];
  const picks = [];
  while (remaining.length && picks.length < count) {
    const choice = weightedPick(remaining, randomFn);
    picks.push(choice);
    const index = remaining.findIndex((rule) => rule.id === choice.id);
    remaining.splice(index, 1);
  }
  return picks;
}

export const RULE_LIBRARY = [
  {
    id: "backstep-pawns",
    kind: "permanent",
    rarity: "common",
    unique: true,
    name: "Backstep Pawns",
    description: "All pawns gain one-square backward moves and backward captures.",
    apply(state, owner) {
      state.activeRules.push({
        id: this.id,
        kind: this.kind,
        rarity: this.rarity,
        unique: this.unique,
        owner,
        name: this.name,
        description: this.description,
        modifyMoves({ state: innerState, piece, row, col, moves, pushStepMove }) {
          if (piece.type !== "p") {
            return moves;
          }
          const backward = piece.color === "w" ? 1 : -1;
          const backRow = row + backward;
          if (inBounds(backRow, col) && !innerState.board[backRow][col]) {
            moves.push({
              from: { row, col },
              to: { row: backRow, col },
              piece,
              capture: null,
            });
          }
          for (const targetCol of [col - 1, col + 1]) {
            if (!inBounds(backRow, targetCol)) {
              continue;
            }
            const target = innerState.board[backRow][targetCol];
            if (target && target.color !== piece.color) {
              moves.push({
                from: { row, col },
                to: { row: backRow, col: targetCol },
                piece,
                capture: target,
              });
            }
          }
          return moves;
        },
      });
      return `${colorName(owner)} unlocked backward pawns for both armies.`;
    },
  },
  {
    id: "knighted-kings",
    kind: "temporary",
    rarity: "rare",
    unique: true,
    name: "Knighted Kings",
    duration: {
      min: 3,
      max: 8,
      parity: "even",
    },
    description: "Kings gain knight jumps in addition to their normal move.",
    activeDescription: "Kings gain knight jumps in addition to their normal move.",
    apply(state, owner) {
      const activeRule = createTimedRule(this, owner, {
        remainingMoves: this.offeredDuration,
        modifyMoves({ state: innerState, piece, row, col, moves, pushStepMove }) {
          if (piece.type !== "k") {
            return moves;
          }
          return addKnightMoves(innerState.board, moves, piece, row, col, pushStepMove);
        },
      });
      state.activeRules.push(activeRule);
      return `${colorName(owner)} gave both kings a knight leap for ${activeRule.remainingMoves} moves.`;
    },
  },
  {
    id: "diagonal-rooks",
    kind: "permanent",
    rarity: "common",
    unique: true,
    name: "Diagonal Rooks",
    description: "Rooks may also step one square diagonally, and those diagonal steps can capture.",
    apply(state, owner) {
      state.activeRules.push({
        id: this.id,
        kind: this.kind,
        rarity: this.rarity,
        unique: this.unique,
        owner,
        name: this.name,
        description: this.description,
        modifyMoves({ state: innerState, piece, row, col, moves, pushStepMove }) {
          if (piece.type !== "r") {
            return moves;
          }
          return addDiagonalStepMoves(innerState.board, moves, piece, row, col, pushStepMove);
        },
      });
      return `${colorName(owner)} taught the rooks to cut corners.`;
    },
  },
  {
    id: "orthogonal-bishops",
    kind: "permanent",
    rarity: "common",
    unique: true,
    name: "Orthogonal Bishops",
    description: "Bishops may also step one square orthogonally, and those orthogonal steps can capture.",
    apply(state, owner) {
      state.activeRules.push({
        id: this.id,
        kind: this.kind,
        rarity: this.rarity,
        unique: this.unique,
        owner,
        name: this.name,
        description: this.description,
        modifyMoves({ state: innerState, piece, row, col, moves, pushStepMove }) {
          if (piece.type !== "b") {
            return moves;
          }
          return addOrthogonalStepMoves(innerState.board, moves, piece, row, col, pushStepMove);
        },
      });
      return `${colorName(owner)} added close-range bishop sidesteps.`;
    },
  },
  {
    id: "double-time",
    kind: "temporary",
    rarity: "uncommon",
    unique: true,
    name: "Double Time",
    description: "The chooser gets an extra move after each of their next 2 turns.",
    apply(state, owner) {
      state.activeRules.push({
        id: this.id,
        kind: this.kind,
        rarity: this.rarity,
        unique: this.unique,
        owner,
        name: this.name,
        description: this.description,
        remainingTriggers: 2,
        afterMove({ state: innerState, rule, movingPiece }) {
          if (movingPiece.color !== owner || rule.remainingTriggers <= 0) {
            return;
          }
          innerState.pendingExtraTurns[owner] += 1;
          rule.remainingTriggers -= 1;
        },
        expired({ rule }) {
          return rule.remainingTriggers <= 0;
        },
      });
      return `${colorName(owner)} will chain two extra turns over their next moves.`;
    },
  },
  {
    id: "ceasefire",
    kind: "temporary",
    rarity: "uncommon",
    unique: true,
    name: "Ceasefire",
    duration: {
      min: 2,
      max: 6,
      parity: "even",
    },
    description: "Captures are forbidden.",
    activeDescription: "Captures are forbidden.",
    apply(state, owner) {
      const activeRule = createTimedRule(this, owner, {
        remainingMoves: this.offeredDuration,
        allowsMove({ move }) {
          return !move.capture;
        },
      });
      state.activeRules.push(activeRule);
      return `${colorName(owner)} called a ${activeRule.remainingMoves}-move ceasefire. Nobody can capture.`;
    },
  },
  {
    id: "royal-sprint",
    kind: "temporary",
    rarity: "rare",
    unique: true,
    name: "Royal Sprint",
    duration: {
      min: 4,
      max: 8,
      parity: "even",
    },
    description: "Kings may step up to two squares in any direction, but they cannot move through pieces.",
    activeDescription: "Kings may step up to two squares in any direction, but they cannot move through pieces.",
    apply(state, owner) {
      const activeRule = createTimedRule(this, owner, {
        remainingMoves: this.offeredDuration,
        modifyMoves({ state: innerState, piece, row, col, moves, pushStepMove }) {
          if (piece.type !== "k") {
            return moves;
          }
          for (const [dRow, dCol] of [
            [2, 0],
            [-2, 0],
            [0, 2],
            [0, -2],
            [2, 2],
            [2, -2],
            [-2, 2],
            [-2, -2],
          ]) {
            addLongKingStep(innerState.board, moves, piece, row, col, dRow, dCol, pushStepMove);
          }
          return moves;
        },
      });
      state.activeRules.push(activeRule);
      return `${colorName(owner)} triggered a royal sprint for ${activeRule.remainingMoves} moves.`;
    },
  },
  {
    id: "cavalry-doctrine",
    kind: "temporary",
    rarity: "common",
    unique: true,
    name: "Cavalry Doctrine",
    duration: {
      min: 3,
      max: 7,
      parity: "odd",
    },
    description: "The chooser's knights may also step diagonally one square.",
    activeDescription: "The chooser's knights may also step diagonally one square.",
    apply(state, owner) {
      const activeRule = createTimedRule(this, owner, {
        remainingMoves: this.offeredDuration,
        modifyMoves({ state: innerState, piece, row, col, moves, pushStepMove }) {
          if (piece.type !== "n" || piece.color !== owner) {
            return moves;
          }
          return addDiagonalStepMoves(innerState.board, moves, piece, row, col, pushStepMove);
        },
      });
      state.activeRules.push(activeRule);
      return `${colorName(owner)} boosted their knights for ${activeRule.remainingMoves} moves.`;
    },
  },
  {
    id: "heavy-weather",
    kind: "temporary",
    rarity: "uncommon",
    unique: true,
    name: "Heavy Weather",
    duration: {
      min: 4,
      max: 7,
      parity: "both",
    },
    description: "Each move must either be a capture or a pawn move.",
    activeDescription: "Each move must either be a capture or a pawn move.",
    apply(state, owner) {
      const activeRule = createTimedRule(this, owner, {
        remainingMoves: this.offeredDuration,
        allowsMove({ move }) {
          return Boolean(move.capture) || move.piece.type === "p";
        },
      });
      state.activeRules.push(activeRule);
      return `${colorName(owner)} dragged the board into messy weather for ${activeRule.remainingMoves} moves.`;
    },
  },
  {
    id: "pawnstorm",
    kind: "instant",
    rarity: "common",
    unique: false,
    name: "Pawnstorm",
    description: "Every pawn you own tries to advance one square immediately if the square is empty.",
    apply(state, owner) {
      const direction = owner === "w" ? -1 : 1;
      let moved = 0;
      const rows = owner === "w" ? [...Array(8).keys()] : [...Array(8).keys()].reverse();

      for (const row of rows) {
        for (let col = 0; col < 8; col += 1) {
          const piece = state.board[row][col];
          if (!piece || piece.color !== owner || piece.type !== "p") {
            continue;
          }
          const nextRow = row + direction;
          if (inBounds(nextRow, col) && !state.board[nextRow][col]) {
            state.board[nextRow][col] = piece;
            state.board[row][col] = null;
            piece.hasMoved = true;
            if (nextRow === 0 || nextRow === 7) {
              piece.type = "q";
            }
            moved += 1;
          }
        }
      }

      return moved
        ? `${colorName(owner)} launched a pawnstorm and advanced ${moved} pawn${moved === 1 ? "" : "s"}.`
        : `${colorName(owner)} called a pawnstorm, but none of their pawns had room to move.`;
    },
  },
  {
    id: "recall",
    kind: "instant",
    rarity: "rare",
    unique: false,
    name: "Recall",
    description: "Return your most recently captured non-king piece to the nearest open starting square.",
    canApply(state, owner) {
      return [...state.captured[owner]].reverse().some((piece) => piece.type !== "k");
    },
    apply(state, owner) {
      const revived = [...state.captured[owner]].reverse().find((piece) => piece.type !== "k");
      if (!revived) {
        return `${colorName(owner)} reached for a recall, but nothing eligible was gone.`;
      }
      const square = nearestOpenStartingSquare(state, owner, revived.type);
      if (!square) {
        return `${colorName(owner)} had no room to place the recalled piece.`;
      }
      const index = state.captured[owner].lastIndexOf(revived);
      state.captured[owner].splice(index, 1);
      state.board[square.row][square.col] = { ...revived, hasMoved: true };
      return `${colorName(owner)} recalled a ${revived.type.toUpperCase()} to ${algebraicFromCoords(square.row, square.col)}.`;
    },
  },
  {
    id: "queens-gift",
    kind: "instant",
    rarity: "legendary",
    unique: false,
    name: "Queen's Gift",
    description: "Your most advanced pawn immediately promotes into a queen where it stands.",
    canApply(state, owner) {
      return Boolean(furthestPawn(state, owner));
    },
    apply(state, owner) {
      const pawn = furthestPawn(state, owner);
      if (!pawn) {
        return `${colorName(owner)} had no pawn ready for a queen's gift.`;
      }
      state.board[pawn.row][pawn.col].type = "q";
      return `${colorName(owner)} promoted a front-line pawn in place.`;
    },
  },
  {
    id: "royal-relocation",
    kind: "instant",
    rarity: "uncommon",
    unique: false,
    name: "Royal Relocation",
    description: "Swap your king with your nearest rook.",
    canApply(state, owner) {
      return Boolean(findKing(state.board, owner));
    },
    apply(state, owner) {
      const king = findKing(state.board, owner);
      if (!king) {
        return `${colorName(owner)} no longer had a king to relocate.`;
      }

      let rookTarget = null;
      for (let row = 0; row < 8; row += 1) {
        for (let col = 0; col < 8; col += 1) {
          const piece = state.board[row][col];
          if (!piece || piece.color !== owner || piece.type !== "r") {
            continue;
          }
          const distance = Math.abs(row - king.row) + Math.abs(col - king.col);
          if (!rookTarget || distance < rookTarget.distance) {
            rookTarget = { row, col, distance };
          }
        }
      }

      if (!rookTarget) {
        return `${colorName(owner)} tried to relocate the crown, but there was no rook left.`;
      }

      const kingPiece = state.board[king.row][king.col];
      const rookPiece = state.board[rookTarget.row][rookTarget.col];
      state.board[king.row][king.col] = rookPiece;
      state.board[rookTarget.row][rookTarget.col] = kingPiece;
      return `${colorName(owner)} swapped king and rook positions instantly.`;
    },
  },
];

export function buildDraftChoices(state, randomFn = Math.random) {
  const alreadyActive = new Set(state.activeRules.map((rule) => rule.id));
  const pool = RULE_LIBRARY.filter((rule) => {
    if (rule.unique && alreadyActive.has(rule.id)) {
      return false;
    }
    return typeof rule.canApply === "function" ? rule.canApply(state, state.nextRulePicker) : true;
  });
  return weightedSample(pool, 3, randomFn).map((rule) => createDraftOption(rule, randomFn));
}
