const FILES = "abcdefgh";

export const PIECE_SYMBOLS = {
  wp: "♙",
  wr: "♖",
  wn: "♘",
  wb: "♗",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  br: "♜",
  bn: "♞",
  bb: "♝",
  bq: "♛",
  bk: "♚",
};

export function createInitialBoard() {
  const backRank = ["r", "n", "b", "q", "k", "b", "n", "r"];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));

  for (let col = 0; col < 8; col += 1) {
    board[0][col] = makePiece(backRank[col], "b");
    board[1][col] = makePiece("p", "b");
    board[6][col] = makePiece("p", "w");
    board[7][col] = makePiece(backRank[col], "w");
  }

  return board;
}

export function makePiece(type, color) {
  return { type, color, hasMoved: false };
}

export function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

export function inBounds(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function algebraicFromCoords(row, col) {
  return `${FILES[col]}${8 - row}`;
}

export function coordsFromKey(key) {
  const [row, col] = key.split(",").map(Number);
  return { row, col };
}

export function colorName(color) {
  return color === "w" ? "White" : "Black";
}

export function findKing(board, color) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row][col];
      if (piece?.type === "k" && piece.color === color) {
        return { row, col };
      }
    }
  }
  return null;
}

function pushStepMove(board, moves, piece, fromRow, fromCol, toRow, toCol, extra = {}) {
  if (!inBounds(toRow, toCol)) {
    return;
  }
  const occupant = board[toRow][toCol];
  if (!occupant) {
    moves.push({
      from: { row: fromRow, col: fromCol },
      to: { row: toRow, col: toCol },
      piece,
      capture: null,
      ...extra,
    });
    return;
  }
  if (occupant.color !== piece.color) {
    moves.push({
      from: { row: fromRow, col: fromCol },
      to: { row: toRow, col: toCol },
      piece,
      capture: occupant,
      ...extra,
    });
  }
}

function pushSlidingMoves(board, moves, piece, fromRow, fromCol, directions) {
  for (const [dRow, dCol] of directions) {
    let row = fromRow + dRow;
    let col = fromCol + dCol;
    while (inBounds(row, col)) {
      const occupant = board[row][col];
      if (!occupant) {
        moves.push({
          from: { row: fromRow, col: fromCol },
          to: { row, col },
          piece,
          capture: null,
        });
      } else {
        if (occupant.color !== piece.color) {
          moves.push({
            from: { row: fromRow, col: fromCol },
            to: { row, col },
            piece,
            capture: occupant,
          });
        }
        break;
      }
      row += dRow;
      col += dCol;
    }
  }
}

function baseMovesForPiece(state, row, col) {
  const board = state.board;
  const piece = board[row][col];
  if (!piece) {
    return [];
  }

  const moves = [];
  const direction = piece.color === "w" ? -1 : 1;

  switch (piece.type) {
    case "p": {
      const oneAheadRow = row + direction;
      if (inBounds(oneAheadRow, col) && !board[oneAheadRow][col]) {
        moves.push({
          from: { row, col },
          to: { row: oneAheadRow, col },
          piece,
          capture: null,
          promotion: oneAheadRow === 0 || oneAheadRow === 7 ? "q" : null,
        });

        const twoAheadRow = row + direction * 2;
        if (
          !piece.hasMoved &&
          inBounds(twoAheadRow, col) &&
          !board[twoAheadRow][col]
        ) {
          moves.push({
            from: { row, col },
            to: { row: twoAheadRow, col },
            piece,
            capture: null,
            doubleStep: true,
          });
        }
      }

      for (const targetCol of [col - 1, col + 1]) {
        if (!inBounds(oneAheadRow, targetCol)) {
          continue;
        }

        const target = board[oneAheadRow][targetCol];
        if (target && target.color !== piece.color) {
          moves.push({
            from: { row, col },
            to: { row: oneAheadRow, col: targetCol },
            piece,
            capture: target,
            promotion: oneAheadRow === 0 || oneAheadRow === 7 ? "q" : null,
          });
        }

        const enPassant = state.enPassantTarget;
        if (
          enPassant &&
          enPassant.row === oneAheadRow &&
          enPassant.col === targetCol &&
          state.board[row][targetCol]?.color !== piece.color &&
          state.board[row][targetCol]?.type === "p"
        ) {
          moves.push({
            from: { row, col },
            to: { row: oneAheadRow, col: targetCol },
            piece,
            capture: state.board[row][targetCol],
            enPassant: true,
          });
        }
      }
      break;
    }
    case "r":
      pushSlidingMoves(board, moves, piece, row, col, [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]);
      break;
    case "b":
      pushSlidingMoves(board, moves, piece, row, col, [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]);
      break;
    case "q":
      pushSlidingMoves(board, moves, piece, row, col, [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]);
      break;
    case "n":
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
      break;
    case "k": {
      for (const [dRow, dCol] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ]) {
        pushStepMove(board, moves, piece, row, col, row + dRow, col + dCol);
      }

      if (!piece.hasMoved) {
        const rank = piece.color === "w" ? 7 : 0;
        const rookTargets = [
          { rookCol: 7, path: [5, 6], kingTo: 6 },
          { rookCol: 0, path: [1, 2, 3], kingTo: 2 },
        ];

        for (const candidate of rookTargets) {
          const rook = board[rank][candidate.rookCol];
          const pathClear = candidate.path.every((pathCol) => !board[rank][pathCol]);
          if (rook?.type === "r" && rook.color === piece.color && !rook.hasMoved && pathClear) {
            moves.push({
              from: { row, col },
              to: { row: rank, col: candidate.kingTo },
              piece,
              capture: null,
              castle: candidate.rookCol === 7 ? "king" : "queen",
            });
          }
        }
      }
      break;
    }
    default:
      break;
  }

  return moves;
}

export function collectMoves(state, row, col) {
  const piece = state.board[row][col];
  if (!piece) {
    return [];
  }

  let moves = baseMovesForPiece(state, row, col);
  for (const rule of state.activeRules) {
    if (typeof rule.modifyMoves === "function") {
      moves = rule.modifyMoves({
        state,
        rule,
        piece,
        row,
        col,
        moves,
        pushStepMove,
      });
    }
  }

  return moves.filter((move) =>
    state.activeRules.every((rule) =>
      typeof rule.allowsMove === "function"
        ? rule.allowsMove({ state, rule, move })
        : true,
    ),
  );
}

export function createMoveMap(state, color = state.turn) {
  const moveMap = new Map();
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = state.board[row][col];
      if (!piece || piece.color !== color) {
        continue;
      }
      const moves = collectMoves(state, row, col);
      if (moves.length) {
        moveMap.set(`${row},${col}`, moves);
      }
    }
  }
  return moveMap;
}

export function simulateMove(state, move) {
  const clone = {
    ...state,
    board: cloneBoard(state.board),
    captured: {
      w: [...state.captured.w],
      b: [...state.captured.b],
    },
    activeRules: state.activeRules,
    enPassantTarget: state.enPassantTarget ? { ...state.enPassantTarget } : null,
    pendingExtraTurns: { ...state.pendingExtraTurns },
  };

  applyMoveToState(clone, move, { simulation: true });
  return clone;
}

export function isSquareThreatened(state, row, col, attackerColor) {
  const moveMap = createMoveMap({ ...state, turn: attackerColor }, attackerColor);
  for (const moves of moveMap.values()) {
    for (const move of moves) {
      if (move.to.row === row && move.to.col === col) {
        return true;
      }
    }
  }
  return false;
}

export function isKingThreatened(state, color) {
  const king = findKing(state.board, color);
  if (!king) {
    return false;
  }
  const attackerColor = color === "w" ? "b" : "w";
  return isSquareThreatened(state, king.row, king.col, attackerColor);
}

export function applyMoveToState(state, move, options = {}) {
  const board = state.board;
  const movingPiece = board[move.from.row][move.from.col];
  if (!movingPiece) {
    return null;
  }

  if (!options.simulation) {
    for (const rule of state.activeRules) {
      if (typeof rule.beforeMove === "function") {
        rule.beforeMove({ state, rule, move, movingPiece });
      }
    }
  }

  let capturedPiece = null;
  if (move.enPassant) {
    capturedPiece = board[move.from.row][move.to.col];
    board[move.from.row][move.to.col] = null;
  } else {
    capturedPiece = board[move.to.row][move.to.col];
  }

  board[move.from.row][move.from.col] = null;
  board[move.to.row][move.to.col] = movingPiece;
  movingPiece.hasMoved = true;

  if (move.castle) {
    const rank = movingPiece.color === "w" ? 7 : 0;
    if (move.castle === "king") {
      const rook = board[rank][7];
      board[rank][7] = null;
      board[rank][5] = rook;
      if (rook) {
        rook.hasMoved = true;
      }
    } else {
      const rook = board[rank][0];
      board[rank][0] = null;
      board[rank][3] = rook;
      if (rook) {
        rook.hasMoved = true;
      }
    }
  }

  if (move.promotion) {
    movingPiece.type = move.promotion;
  }

  state.enPassantTarget = move.doubleStep
    ? {
        row: (move.from.row + move.to.row) / 2,
        col: move.from.col,
      }
    : null;

  if (capturedPiece) {
    state.captured[capturedPiece.color].push(capturedPiece);
    state.lastCaptured = {
      piece: { ...capturedPiece },
      capturedOnPly: state.ply,
    };
    if (capturedPiece.type === "k") {
      state.winner = movingPiece.color;
    }
  }

  if (!options.simulation) {
    for (const rule of state.activeRules) {
      if (typeof rule.afterMove === "function") {
        rule.afterMove({ state, rule, move, movingPiece, capturedPiece });
      }
    }
  }

  if (!options.simulation) {
    for (const rule of state.activeRules) {
      if (typeof rule.afterPly === "function") {
        rule.afterPly({ state, rule, move, movingPiece, capturedPiece });
      }
    }

    state.activeRules = state.activeRules.filter((rule) => {
      if (typeof rule.expired === "function") {
        return !rule.expired({ state, rule });
      }
      if (typeof rule.remainingMoves === "number") {
        rule.remainingMoves -= 1;
        return rule.remainingMoves > 0;
      }
      return true;
    });
  }

  return {
    movingPiece,
    capturedPiece,
  };
}

export function moveSummary(move, stateBeforeMove) {
  const pieceLetter = move.piece.type === "p" ? "" : move.piece.type.toUpperCase();
  const captureMark = move.capture ? "x" : "-";
  const suffix = move.promotion ? `=${move.promotion.toUpperCase()}` : "";
  const castleText =
    move.castle === "king" ? "O-O" : move.castle === "queen" ? "O-O-O" : null;

  if (castleText) {
    return castleText;
  }

  const from = algebraicFromCoords(move.from.row, move.from.col);
  const to = algebraicFromCoords(move.to.row, move.to.col);
  const selfCheck = isKingThreatened(simulateMove(stateBeforeMove, move), move.piece.color);
  const warning = selfCheck ? " !" : "";
  return `${pieceLetter}${from}${captureMark}${to}${suffix}${warning}`;
}
