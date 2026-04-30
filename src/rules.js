import {
  algebraicFromCoords,
  capturePieceAt,
  cloneLayout,
  colorName,
  findKing,
  findPieceById,
  inBounds,
  makePiece,
  updateWinnerFromBoard,
} from "./chess.js";

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
    if (!inBounds(middleRow, middleCol, board) || board[middleRow][middleCol]) {
      return moves;
    }
  }

  pushStepMove(board, moves, piece, row, col, toRow, toCol);
  return moves;
}

function nearestOpenStartingSquare(state, color, type) {
  const homeRow = state.layout.homeRow[color];
  const pawnRow = state.layout.pawnRow[color];
  const preferredCols = {
    q: [state.layout.kingCol - 1],
    r: [state.layout.rookCols.queen, state.layout.rookCols.king],
    b: [state.layout.kingCol - 2, state.layout.kingCol + 1],
    n: [state.layout.kingCol - 3, state.layout.kingCol + 2],
    p: Array.from({ length: state.board.length }, (_, index) => index),
  };

  const row = type === "p" ? pawnRow : homeRow;
  for (const col of preferredCols[type] ?? []) {
    if (!state.board[row][col]) {
      return { row, col };
    }
  }

  for (let altRow = 0; altRow < state.board.length; altRow += 1) {
    for (let altCol = 0; altCol < state.board[altRow].length; altCol += 1) {
      if (!state.board[altRow][altCol]) {
        return { row: altRow, col: altCol };
      }
    }
  }

  return null;
}

function furthestPawn(state, color) {
  let best = null;
  for (let row = 0; row < state.board.length; row += 1) {
    for (let col = 0; col < state.board[row].length; col += 1) {
      const piece = state.board[row][col];
      if (!piece || piece.color !== color || piece.type !== "p") {
        continue;
      }

      const progress = color === "w" ? state.board.length - 1 - row : row;
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

function shuffle(items, randomFn = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = pickRandomInt(0, index, randomFn);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
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

function hasAdvanceablePawn(state, color) {
  const direction = color === "w" ? -1 : 1;
  for (let row = 0; row < state.board.length; row += 1) {
    for (let col = 0; col < state.board[row].length; col += 1) {
      const piece = state.board[row][col];
      if (!piece || piece.color !== color || piece.type !== "p") {
        continue;
      }
      const nextRow = row + direction;
      if (inBounds(nextRow, col, state.board) && !state.board[nextRow][col]) {
        return true;
      }
    }
  }
  return false;
}

function hasReserveOpenings(state) {
  const reserveRows = [state.layout.pawnRow.b, state.layout.pawnRow.w];
  return reserveRows.some((row) => state.board[row].some((piece) => !piece));
}

function hasGraveyardRoom(state, color) {
  const targetRows = [state.layout.homeRow[color], state.layout.pawnRow[color]];
  const emptySquares = targetRows.reduce(
    (count, row) => count + state.board[row].filter((piece) => !piece).length,
    0,
  );
  return state.captured[color].length > 0 && emptySquares > 0;
}

function hasNonKingPiece(state, color) {
  for (let row = 0; row < state.board.length; row += 1) {
    for (let col = 0; col < state.board[row].length; col += 1) {
      const piece = state.board[row][col];
      if (piece && piece.color === color && piece.type !== "k") {
        return true;
      }
    }
  }
  return false;
}

function expandBoardState(state) {
  const oldBoard = state.board;
  const nextSize = oldBoard.length + 2;
  const expanded = Array.from({ length: nextSize }, () => Array(nextSize).fill(null));
  for (let row = 0; row < oldBoard.length; row += 1) {
    for (let col = 0; col < oldBoard[row].length; col += 1) {
      expanded[row + 1][col + 1] = oldBoard[row][col];
    }
  }
  state.board = expanded;
  state.layout = cloneLayout(state.layout);
  state.layout.homeRow.w += 1;
  state.layout.homeRow.b += 1;
  state.layout.pawnRow.w += 1;
  state.layout.pawnRow.b += 1;
  state.layout.kingCol += 1;
  state.layout.rookCols = {
    queen: state.layout.rookCols.queen + 1,
    king: state.layout.rookCols.king + 1,
  };
  if (state.enPassantTarget) {
    state.enPassantTarget = {
      row: state.enPassantTarget.row + 1,
      col: state.enPassantTarget.col + 1,
    };
  }
}

function describeDuration(rule) {
  if (typeof rule.remainingMoves === "number") {
    return `${rule.remainingMoves} ${rule.remainingMoves === 1 ? "move" : "moves"} left`;
  }
  if (rule.remainingTriggersByColor) {
    return `White ${rule.remainingTriggersByColor.w} | Black ${rule.remainingTriggersByColor.b} bonus turns left`;
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
          if (inBounds(backRow, col, innerState.board) && !innerState.board[backRow][col]) {
            moves.push({
              from: { row, col },
              to: { row: backRow, col },
              piece,
              capture: null,
            });
          }
          for (const targetCol of [col - 1, col + 1]) {
            if (!inBounds(backRow, targetCol, innerState.board)) {
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
    id: "board-expansion",
    kind: "permanent",
    rarity: "rare",
    unique: false,
    name: "Board Expansion",
    description: "Add one empty tile to every edge of the board, expanding it outward in all four directions.",
    apply(state, owner) {
      expandBoardState(state);
      return `${colorName(owner)} expanded the battlefield to ${state.board.length} by ${state.board.length}.`;
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
    id: "he-has-a-bomb",
    kind: "temporary",
    rarity: "common",
    unique: false,
    name: "He Has a Bomb",
    duration: {
      min: 4,
      max: 8,
      parity: "even",
    },
    description: "Choose one of your non-king pieces. When the timer ends, that piece and all adjacent pieces explode.",
    activeDescription: "A chosen non-king piece will explode with all adjacent pieces when the timer ends.",
    targeting: {
      prompt: "Choose one of your non-king pieces to carry the bomb.",
    },
    canApply(state, owner) {
      return hasNonKingPiece(state, owner);
    },
    canTarget({ piece, owner }) {
      return Boolean(piece) && piece.color === owner && piece.type !== "k";
    },
    apply(state, owner, context = {}) {
      const targetPiece = context.target?.piece;
      if (!targetPiece) {
        return `${colorName(owner)} could not arm a piece with the bomb.`;
      }

      targetPiece.bombCount = (targetPiece.bombCount ?? 0) + 1;
      const activeRule = createTimedRule(this, owner, {
        remainingMoves: this.offeredDuration,
        targetPieceId: targetPiece.id,
        onExpire({ state: innerState, rule }) {
          const piecePosition = findPieceById(innerState.board, rule.targetPieceId);
          if (!piecePosition) {
            for (const color of ["w", "b"]) {
              const capturedPiece = innerState.captured[color].find(
                (piece) => piece.id === rule.targetPieceId,
              );
              if (capturedPiece?.bombCount) {
                capturedPiece.bombCount = Math.max(0, capturedPiece.bombCount - 1);
              }
            }
            return;
          }

          const affectedSquares = [];
          for (let dRow = -1; dRow <= 1; dRow += 1) {
            for (let dCol = -1; dCol <= 1; dCol += 1) {
              const row = piecePosition.row + dRow;
              const col = piecePosition.col + dCol;
              if (inBounds(row, col, innerState.board) && innerState.board[row][col]) {
                affectedSquares.push({ row, col });
              }
            }
          }

          if (piecePosition.piece.bombCount) {
            piecePosition.piece.bombCount = Math.max(0, piecePosition.piece.bombCount - 1);
          }

          for (const square of affectedSquares) {
            capturePieceAt(innerState, square.row, square.col);
          }
          updateWinnerFromBoard(innerState);
        },
      });
      state.activeRules.push(activeRule);
      return `${colorName(owner)} planted a bomb set to blow in ${activeRule.remainingMoves} moves.`;
    },
  },
  {
    id: "double-time",
    kind: "temporary",
    rarity: "rare",
    unique: true,
    name: "Double Time",
    description: "Both players get an extra move after each of their next 2 normal turns. Bonus turns do not chain into more bonus turns.",
    apply(state, owner) {
      state.activeRules.push({
        id: this.id,
        kind: this.kind,
        rarity: this.rarity,
        unique: this.unique,
        owner,
        name: this.name,
        description: this.description,
        remainingTriggersByColor: { w: 2, b: 2 },
        afterMove({ state: innerState, rule, movingPiece, turnContext }) {
          if (turnContext?.isBonusTurn) {
            return;
          }
          const color = movingPiece.color;
          if (rule.remainingTriggersByColor[color] <= 0) {
            return;
          }
          innerState.pendingExtraTurns[color] += 1;
          rule.remainingTriggersByColor[color] -= 1;
        },
        expired({ rule }) {
          return rule.remainingTriggersByColor.w <= 0 && rule.remainingTriggersByColor.b <= 0;
        },
      });
      return `${colorName(owner)} accelerated both sides for their next 2 normal turns each.`;
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
    description: "Each move must either be a capture, a pawn move, or a king move.",
    activeDescription: "Each move must either be a capture, a pawn move, or a king move.",
    apply(state, owner) {
      const activeRule = createTimedRule(this, owner, {
        remainingMoves: this.offeredDuration,
        allowsMove({ move }) {
          return Boolean(move.capture) || move.piece.type === "p" || move.piece.type === "k";
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
    canApply(state, owner) {
      return hasAdvanceablePawn(state, owner);
    },
    apply(state, owner) {
      const direction = owner === "w" ? -1 : 1;
      let moved = 0;
      const rows = owner === "w"
        ? [...Array(state.board.length).keys()]
        : [...Array(state.board.length).keys()].reverse();

      for (const row of rows) {
        for (let col = 0; col < state.board[row].length; col += 1) {
          const piece = state.board[row][col];
          if (!piece || piece.color !== owner || piece.type !== "p") {
            continue;
          }
          const nextRow = row + direction;
          if (inBounds(nextRow, col, state.board) && !state.board[nextRow][col]) {
            state.board[nextRow][col] = piece;
            state.board[row][col] = null;
            piece.hasMoved = true;
            if (nextRow === 0 || nextRow === state.board.length - 1) {
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
    id: "reinforcements",
    kind: "instant",
    rarity: "rare",
    unique: false,
    name: "Reinforcements",
    description: "Place new pawns for both sides on every empty square of Black's 2nd rank and White's 7th rank.",
    canApply(state) {
      return hasReserveOpenings(state);
    },
    apply(state, owner) {
      const blackRank = state.layout.pawnRow.b;
      const whiteRank = state.layout.pawnRow.w;
      let placed = 0;

      for (let col = 0; col < state.board[blackRank].length; col += 1) {
        if (!state.board[blackRank][col]) {
          state.board[blackRank][col] = makePiece("p", "b");
          placed += 1;
        }
      }

      for (let col = 0; col < state.board[whiteRank].length; col += 1) {
        if (!state.board[whiteRank][col]) {
          state.board[whiteRank][col] = makePiece("p", "w");
          placed += 1;
        }
      }

      return placed
        ? `${colorName(owner)} called in reinforcements and deployed ${placed} new pawn${placed === 1 ? "" : "s"}.`
        : `${colorName(owner)} called in reinforcements, but both reserve ranks were already full.`;
    },
  },
  {
    id: "open-the-graves",
    kind: "instant",
    rarity: "legendary",
    unique: false,
    name: "Open the Graves",
    description: "All currently captured pieces return on random empty squares in the first two rows on their own side.",
    canApply(state) {
      return hasGraveyardRoom(state, "w") || hasGraveyardRoom(state, "b");
    },
    apply(state, owner) {
      let revived = 0;

      for (const color of ["w", "b"]) {
        const targetRows = [state.layout.homeRow[color], state.layout.pawnRow[color]];
        const openSquares = [];
        for (const row of targetRows) {
          for (let col = 0; col < state.board[row].length; col += 1) {
            if (!state.board[row][col]) {
              openSquares.push({ row, col });
            }
          }
        }

        const shuffledSquares = shuffle(openSquares);
        const fallenPieces = [...state.captured[color]];
        const revivalCount = Math.min(fallenPieces.length, shuffledSquares.length);

        for (let index = 0; index < revivalCount; index += 1) {
          const piece = fallenPieces[index];
          const square = shuffledSquares[index];
          state.board[square.row][square.col] = {
            ...piece,
            hasMoved: true,
          };
          const capturedIndex = state.captured[color].indexOf(piece);
          if (capturedIndex >= 0) {
            state.captured[color].splice(capturedIndex, 1);
          }
          revived += 1;
        }
      }

      return revived
        ? `${colorName(owner)} opened the graves and revived ${revived} fallen piece${revived === 1 ? "" : "s"}.`
        : `${colorName(owner)} opened the graves, but there was no room for the dead to return.`;
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
      return (
        [...state.captured[owner]].reverse().some((piece) => piece.type !== "k") &&
        Boolean(
          [...state.captured[owner]]
            .reverse()
            .find((piece) => piece.type !== "k" && nearestOpenStartingSquare(state, owner, piece.type)),
        )
      );
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
      return `${colorName(owner)} recalled a ${revived.type.toUpperCase()} to ${algebraicFromCoords(
        square.row,
        square.col,
        state.board,
        state.layout,
      )}.`;
    },
  },
  {
    id: "queens-gift",
    kind: "instant",
    rarity: "legendary",
    unique: false,
    name: "Queen's Gift",
    description: "Each player promotes their most advanced pawn into a queen where it stands, if they have one.",
    canApply(state) {
      return Boolean(furthestPawn(state, "w") || furthestPawn(state, "b"));
    },
    apply(state, owner) {
      const promotedColors = [];
      for (const color of ["w", "b"]) {
        const pawn = furthestPawn(state, color);
        if (!pawn) {
          continue;
        }
        state.board[pawn.row][pawn.col].type = "q";
        promotedColors.push(colorName(color));
      }
      if (!promotedColors.length) {
        return `${colorName(owner)} called for a queen's gift, but neither side had a pawn ready.`;
      }
      if (promotedColors.length === 2) {
        return `${colorName(owner)} crowned a front-line pawn for both sides.`;
      }
      return `${colorName(owner)} crowned a front-line pawn for ${promotedColors[0]}.`;
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
      if (!findKing(state.board, owner)) {
        return false;
      }
      for (let row = 0; row < state.board.length; row += 1) {
        for (let col = 0; col < state.board[row].length; col += 1) {
          const piece = state.board[row][col];
          if (piece?.color === owner && piece.type === "r") {
            return true;
          }
        }
      }
      return false;
    },
    apply(state, owner) {
      const king = findKing(state.board, owner);
      if (!king) {
        return `${colorName(owner)} no longer had a king to relocate.`;
      }

      let rookTarget = null;
      for (let row = 0; row < state.board.length; row += 1) {
        for (let col = 0; col < state.board[row].length; col += 1) {
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
