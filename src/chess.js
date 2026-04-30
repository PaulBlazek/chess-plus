const FILES = "abcdefghijklmnopqrstuvwxyz";
let nextPieceId = 1;

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

export function createInitialLayout() {
  return {
    homeRow: { w: 7, b: 0 },
    pawnRow: { w: 6, b: 1 },
    kingCol: 4,
    rookCols: { queen: 0, king: 7 },
  };
}

export function cloneLayout(layout) {
  return {
    homeRow: { ...layout.homeRow },
    pawnRow: { ...layout.pawnRow },
    kingCol: layout.kingCol,
    rookCols: { ...layout.rookCols },
  };
}

export function makePiece(type, color, extra = {}) {
  return { id: nextPieceId++, type, color, hasMoved: false, ...extra };
}

export function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

export function inBounds(row, col, boardOrSize = 8) {
  const size = Array.isArray(boardOrSize) ? boardOrSize.length : boardOrSize;
  return row >= 0 && row < size && col >= 0 && col < size;
}

function fileLabel(col) {
  let value = col;
  let label = "";
  do {
    label = FILES[value % 26] + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

function shiftedFileLabel(col, offset) {
  const shifted = col - offset;
  if (shifted >= 0) {
    return fileLabel(shifted);
  }
  return `-${fileLabel(Math.abs(shifted) - 1)}`;
}

export function algebraicFromCoords(row, col, board = 8, layout = null) {
  const size = Array.isArray(board) ? board.length : board;
  const expansionOffset =
    layout?.kingCol != null ? layout.kingCol - 4 : Math.max(0, Math.floor((size - 8) / 2));
  const topRank = 8 + expansionOffset;
  return `${shiftedFileLabel(col, expansionOffset)}${topRank - row}`;
}

export function coordsFromKey(key) {
  const [row, col] = key.split(",").map(Number);
  return { row, col };
}

export function colorName(color) {
  if (color === "draw") {
    return "Draw";
  }
  return color === "w" ? "White" : "Black";
}

export function findPieceById(board, pieceId) {
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      const piece = board[row][col];
      if (piece?.id === pieceId) {
        return { row, col, piece };
      }
    }
  }
  return null;
}

export function findKing(board, color) {
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      const piece = board[row][col];
      if (piece?.type === "k" && piece.color === color) {
        return { row, col };
      }
    }
  }
  return null;
}

function pushStepMove(board, moves, piece, fromRow, fromCol, toRow, toCol, extra = {}) {
  if (!inBounds(toRow, toCol, board)) {
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
    while (inBounds(row, col, board)) {
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
      const lastRow = board.length - 1;
      if (inBounds(oneAheadRow, col, board) && !board[oneAheadRow][col]) {
        moves.push({
          from: { row, col },
          to: { row: oneAheadRow, col },
          piece,
          capture: null,
          promotion: oneAheadRow === 0 || oneAheadRow === lastRow ? "q" : null,
        });

        const twoAheadRow = row + direction * 2;
        if (
          !piece.hasMoved &&
          inBounds(twoAheadRow, col, board) &&
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
        if (!inBounds(oneAheadRow, targetCol, board)) {
          continue;
        }

        const target = board[oneAheadRow][targetCol];
        if (target && target.color !== piece.color) {
          moves.push({
            from: { row, col },
            to: { row: oneAheadRow, col: targetCol },
            piece,
            capture: target,
            promotion: oneAheadRow === 0 || oneAheadRow === lastRow ? "q" : null,
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
        const rank = state.layout.homeRow[piece.color];
        const kingCol = state.layout.kingCol;
        const rookTargets = [
          {
            rookCol: state.layout.rookCols.king,
            path: [kingCol + 1, kingCol + 2],
            kingTo: kingCol + 2,
          },
          {
            rookCol: state.layout.rookCols.queen,
            path: [kingCol - 1, kingCol - 2, kingCol - 3],
            kingTo: kingCol - 2,
          },
        ];

        if (row === rank && col === kingCol) {
          for (const candidate of rookTargets) {
          const rook = board[rank][candidate.rookCol];
          const pathClear = candidate.path.every((pathCol) => !board[rank][pathCol]);
          if (rook?.type === "r" && rook.color === piece.color && !rook.hasMoved && pathClear) {
            moves.push({
              from: { row, col },
              to: { row: rank, col: candidate.kingTo },
              piece,
              capture: null,
              castle:
                candidate.rookCol === state.layout.rookCols.king ? "king" : "queen",
            });
          }
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
  for (let row = 0; row < state.board.length; row += 1) {
    for (let col = 0; col < state.board[row].length; col += 1) {
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
    layout: cloneLayout(state.layout),
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
        rule.beforeMove({ state, rule, move, movingPiece, turnContext: options.turnContext });
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
    const rank = state.layout.homeRow[movingPiece.color];
    if (move.castle === "king") {
      const rookFrom = state.layout.rookCols.king;
      const rookTo = state.layout.kingCol + 1;
      const rook = board[rank][rookFrom];
      board[rank][rookFrom] = null;
      board[rank][rookTo] = rook;
      if (rook) {
        rook.hasMoved = true;
      }
    } else {
      const rookFrom = state.layout.rookCols.queen;
      const rookTo = state.layout.kingCol - 1;
      const rook = board[rank][rookFrom];
      board[rank][rookFrom] = null;
      board[rank][rookTo] = rook;
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
        rule.afterMove({
          state,
          rule,
          move,
          movingPiece,
          capturedPiece,
          turnContext: options.turnContext,
        });
      }
    }
  }

  if (!options.simulation) {
    for (const rule of state.activeRules) {
      if (typeof rule.afterPly === "function") {
        rule.afterPly({
          state,
          rule,
          move,
          movingPiece,
          capturedPiece,
          turnContext: options.turnContext,
        });
      }
    }

    state.activeRules = state.activeRules.filter((rule) => {
      if (typeof rule.expired === "function") {
        const shouldExpire = rule.expired({ state, rule });
        if (shouldExpire && typeof rule.onExpire === "function") {
          rule.onExpire({ state, rule });
        }
        return !shouldExpire;
      }
      if (typeof rule.remainingMoves === "number") {
        rule.remainingMoves -= 1;
        if (rule.remainingMoves <= 0 && typeof rule.onExpire === "function") {
          rule.onExpire({ state, rule });
        }
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

export function capturePieceAt(state, row, col) {
  if (!inBounds(row, col, state.board)) {
    return null;
  }
  const piece = state.board[row][col];
  if (!piece) {
    return null;
  }
  state.board[row][col] = null;
  state.captured[piece.color].push(piece);
  return piece;
}

export function updateWinnerFromBoard(state) {
  const whiteKing = findKing(state.board, "w");
  const blackKing = findKing(state.board, "b");
  if (!whiteKing && !blackKing) {
    state.winner = "draw";
  } else if (!whiteKing) {
    state.winner = "b";
  } else if (!blackKing) {
    state.winner = "w";
  }
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

  const from = algebraicFromCoords(
    move.from.row,
    move.from.col,
    stateBeforeMove.board,
    stateBeforeMove.layout,
  );
  const to = algebraicFromCoords(
    move.to.row,
    move.to.col,
    stateBeforeMove.board,
    stateBeforeMove.layout,
  );
  const selfCheck = isKingThreatened(simulateMove(stateBeforeMove, move), move.piece.color);
  const warning = selfCheck ? " !" : "";
  return `${pieceLetter}${from}${captureMark}${to}${suffix}${warning}`;
}
