import { useState, useEffect } from "react";
import { Anchor, Crosshair, RotateCcw, Trophy, Skull, Ship, Flag } from "lucide-react";

const BOARD_SIZE = 10;
const SHIPS = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 },
];
const COLS = "ABCDEFGHIJ";

// ---------- board helpers ----------
function createEmptyBoard() {
  return Array(BOARD_SIZE)
    .fill(null)
    .map(() =>
      Array(BOARD_SIZE)
        .fill(null)
        .map(() => ({ ship: null, hit: false }))
    );
}

function canPlaceShip(board, row, col, size, horizontal) {
  for (let i = 0; i < size; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    if (r >= BOARD_SIZE || c >= BOARD_SIZE) return false;
    if (board[r][c].ship !== null) return false;
  }
  return true;
}

function placeShipsRandomly() {
  const board = createEmptyBoard();
  SHIPS.forEach((ship, shipIndex) => {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 2000) {
      attempts++;
      const row = Math.floor(Math.random() * BOARD_SIZE);
      const col = Math.floor(Math.random() * BOARD_SIZE);
      const horizontal = Math.random() > 0.5;
      if (canPlaceShip(board, row, col, ship.size, horizontal)) {
        for (let i = 0; i < ship.size; i++) {
          const r = horizontal ? row : row + i;
          const c = horizontal ? col + i : col;
          board[r][c] = { ship: shipIndex, hit: false };
        }
        placed = true;
      }
    }
  });
  return board;
}

function isShipSunk(board, shipIndex) {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].ship === shipIndex && !board[r][c].hit) return false;
    }
  }
  return true;
}

function allShipsSunk(board) {
  return SHIPS.every((_, i) => isShipSunk(board, i));
}

// ---------- AI logic ----------
// Given active hits (cells of ships not yet sunk), produce a prioritized target queue.
function computeTargets(hits, board) {
  if (hits.length === 0) return [];

  const hitsByShip = {};
  hits.forEach((h) => {
    if (!hitsByShip[h.ship]) hitsByShip[h.ship] = [];
    hitsByShip[h.ship].push(h);
  });

  const targets = [];
  const seen = new Set();
  const inBounds = (r, c) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
  const add = (r, c) => {
    const k = `${r},${c}`;
    if (inBounds(r, c) && !board[r][c].hit && !seen.has(k)) {
      targets.push([r, c]);
      seen.add(k);
    }
  };

  for (const shipHits of Object.values(hitsByShip)) {
    if (shipHits.length === 1) {
      const { row, col } = shipHits[0];
      add(row - 1, col);
      add(row + 1, col);
      add(row, col - 1);
      add(row, col + 1);
    } else {
      const rows = shipHits.map((h) => h.row);
      const cols = shipHits.map((h) => h.col);
      if (rows.every((r) => r === rows[0])) {
        const row = rows[0];
        add(row, Math.min(...cols) - 1);
        add(row, Math.max(...cols) + 1);
      } else if (cols.every((c) => c === cols[0])) {
        const col = cols[0];
        add(Math.min(...rows) - 1, col);
        add(Math.max(...rows) + 1, col);
      }
    }
  }
  return targets;
}

function pickAITarget(aiTargets, playerBoard) {
  const valid = aiTargets.filter(([r, c]) => !playerBoard[r][c].hit);
  if (valid.length > 0) return valid[0];

  // Hunt with checkerboard parity (min ship size = 2)
  const candidates = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!playerBoard[r][c].hit && (r + c) % 2 === 0) candidates.push([r, c]);
    }
  }
  if (candidates.length === 0) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!playerBoard[r][c].hit) candidates.push([r, c]);
      }
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ---------- UI ----------
function BoardView({ board, renderCell }) {
  return (
    <div className="inline-block bg-slate-900 p-2 rounded-md border border-slate-700/50 shadow-lg">
      <div className="flex">
        <div className="w-5" />
        {COLS.split("").map((c) => (
          <div
            key={c}
            className="w-8 text-center text-[10px] text-slate-500 font-mono uppercase tracking-wider"
          >
            {c}
          </div>
        ))}
      </div>
      {board.map((row, r) => (
        <div key={r} className="flex">
          <div className="w-5 flex items-center justify-end pr-1 text-[10px] text-slate-500 font-mono">
            {r + 1}
          </div>
          {row.map((cell, c) => renderCell(cell, r, c))}
        </div>
      ))}
    </div>
  );
}

function ShipStatus({ board }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
      {SHIPS.map((ship, i) => {
        const sunk = isShipSunk(board, i);
        return (
          <div
            key={i}
            className={`px-1.5 py-0.5 rounded border font-medium ${
              sunk
                ? "bg-red-900/50 border-red-700/50 text-red-200 line-through"
                : "bg-slate-800 border-slate-700 text-slate-300"
            }`}
          >
            {ship.name} ({ship.size})
          </div>
        );
      })}
    </div>
  );
}

export default function BattleshipGame() {
  const [playerBoard, setPlayerBoard] = useState(() => placeShipsRandomly());
  const [aiBoard, setAiBoard] = useState(() => placeShipsRandomly());
  const [turn, setTurn] = useState("player");
  const [status, setStatus] = useState("Fire when ready, Captain.");
  const [gameOver, setGameOver] = useState(null);
  const [aiHits, setAiHits] = useState([]);
  const [aiTargets, setAiTargets] = useState([]);
  const [lastPlayerShot, setLastPlayerShot] = useState(null);
  const [lastAiShot, setLastAiShot] = useState(null);

  const handlePlayerAttack = (row, col) => {
    if (turn !== "player" || gameOver || aiBoard[row][col].hit) return;

    const newBoard = aiBoard.map((r) => r.map((c) => ({ ...c })));
    newBoard[row][col].hit = true;
    const cell = newBoard[row][col];
    setAiBoard(newBoard);
    setLastPlayerShot([row, col]);

    if (cell.ship !== null) {
      const sunk = isShipSunk(newBoard, cell.ship);
      if (allShipsSunk(newBoard)) {
        setGameOver("player");
        setStatus("Victory! Enemy fleet destroyed.");
        return;
      }
      setStatus(sunk ? `Hit! You sunk their ${SHIPS[cell.ship].name}!` : "Direct hit!");
    } else {
      setStatus("Miss.");
    }
    setTurn("ai");
  };

  // AI turn
  useEffect(() => {
    if (turn !== "ai" || gameOver) return;

    const timer = setTimeout(() => {
      const [r, c] = pickAITarget(aiTargets, playerBoard);
      const newBoard = playerBoard.map((row) => row.map((cell) => ({ ...cell })));
      newBoard[r][c].hit = true;
      const cell = newBoard[r][c];
      setPlayerBoard(newBoard);
      setLastAiShot([r, c]);

      if (cell.ship !== null) {
        const newHits = [...aiHits, { row: r, col: c, ship: cell.ship }];
        const sunk = isShipSunk(newBoard, cell.ship);

        if (allShipsSunk(newBoard)) {
          setGameOver("ai");
          setStatus("Defeat. Your fleet is lost.");
          return;
        }

        if (sunk) {
          setStatus(`Enemy sunk your ${SHIPS[cell.ship].name}!`);
          const remaining = newHits.filter((h) => h.ship !== cell.ship);
          setAiHits(remaining);
          setAiTargets(computeTargets(remaining, newBoard));
        } else {
          setStatus("Enemy scored a hit!");
          setAiHits(newHits);
          setAiTargets(computeTargets(newHits, newBoard));
        }
      } else {
        setStatus("Enemy missed.");
        setAiTargets(computeTargets(aiHits, newBoard));
      }
      setTurn("player");
    }, 850);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, gameOver]);

  const newGame = () => {
    setPlayerBoard(placeShipsRandomly());
    setAiBoard(placeShipsRandomly());
    setTurn("player");
    setStatus("Fire when ready, Captain.");
    setGameOver(null);
    setAiHits([]);
    setAiTargets([]);
    setLastPlayerShot(null);
    setLastAiShot(null);
  };

  const randomizeFleet = () => {
    if (turn !== "player" || gameOver || lastPlayerShot !== null) return;
    setPlayerBoard(placeShipsRandomly());
  };

  const renderEnemyCell = (cell, r, c) => {
    const isLast = lastPlayerShot && lastPlayerShot[0] === r && lastPlayerShot[1] === c;
    const sunk = cell.hit && cell.ship !== null && isShipSunk(aiBoard, cell.ship);

    let bg = "bg-sky-800 active:bg-sky-600";
    let content = null;

    if (cell.hit) {
      if (cell.ship !== null) {
        bg = sunk ? "bg-red-950" : "bg-red-600";
        content = <span className="text-white text-base font-bold leading-none">✕</span>;
      } else {
        bg = "bg-sky-950";
        content = <span className="w-1.5 h-1.5 bg-sky-300 rounded-full block" />;
      }
    }

    const ring = isLast && !gameOver ? " ring-2 ring-amber-400 ring-inset z-10" : "";

    return (
      <button
        key={`${r}-${c}`}
        onClick={() => handlePlayerAttack(r, c)}
        disabled={turn !== "player" || gameOver || cell.hit}
        className={`w-8 h-8 border border-sky-950/80 flex items-center justify-center transition-colors disabled:cursor-not-allowed ${bg}${ring}`}
        aria-label={`${COLS[c]}${r + 1}`}
      />
    );
  };

  const renderPlayerCell = (cell, r, c) => {
    const isLast = lastAiShot && lastAiShot[0] === r && lastAiShot[1] === c;
    const sunk = cell.hit && cell.ship !== null && isShipSunk(playerBoard, cell.ship);

    let bg = "bg-sky-800";
    let content = null;

    if (cell.ship !== null && !cell.hit) {
      bg = "bg-slate-500";
    }
    if (cell.hit) {
      if (cell.ship !== null) {
        bg = sunk ? "bg-red-950" : "bg-red-600";
        content = <span className="text-white text-xs font-bold leading-none">✕</span>;
      } else {
        bg = "bg-sky-950";
        content = <span className="w-1.5 h-1.5 bg-sky-300 rounded-full block" />;
      }
    }

    const ring = isLast ? " ring-2 ring-amber-400 ring-inset z-10" : "";

    return (
      <div
        key={`${r}-${c}`}
        className={`w-8 h-8 border border-sky-950/80 flex items-center justify-center ${bg}${ring}`}
      >
        {content}
      </div>
    );
  };

  // Re-render enemy cells with content (the content needed to be inside button)
  const renderEnemyCellWithContent = (cell, r, c) => {
    const isLast = lastPlayerShot && lastPlayerShot[0] === r && lastPlayerShot[1] === c;
    const sunk = cell.hit && cell.ship !== null && isShipSunk(aiBoard, cell.ship);

    let bg = "bg-sky-800 active:bg-sky-600 hover:bg-sky-700";
    let content = null;

    if (cell.hit) {
      if (cell.ship !== null) {
        bg = sunk ? "bg-red-950" : "bg-red-600";
        content = <span className="text-white text-base font-bold leading-none">✕</span>;
      } else {
        bg = "bg-sky-950";
        content = <span className="w-1.5 h-1.5 bg-sky-300 rounded-full block" />;
      }
    }

    const ring = isLast && !gameOver ? " ring-2 ring-amber-400 ring-inset z-10" : "";

    return (
      <button
        key={`${r}-${c}`}
        onClick={() => handlePlayerAttack(r, c)}
        disabled={turn !== "player" || gameOver || cell.hit}
        className={`w-8 h-8 border border-sky-950/80 flex items-center justify-center transition-colors disabled:cursor-not-allowed ${bg}${ring}`}
        aria-label={`${COLS[c]}${r + 1}`}
      >
        {content}
      </button>
    );
  };

  const firstMoveMade = lastPlayerShot !== null || lastAiShot !== null;

  // End-of-game stats
  const countStats = (board) => {
    let shots = 0;
    let hits = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c].hit) {
          shots++;
          if (board[r][c].ship !== null) hits++;
        }
      }
    }
    return { shots, hits, accuracy: shots ? Math.round((hits / shots) * 100) : 0 };
  };
  const playerStats = countStats(aiBoard); // your shots landed on enemy board
  const aiStats = countStats(playerBoard); // AI shots landed on your board

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 font-sans">
      <div className="max-w-md mx-auto">
        <header className="text-center mb-3">
          <h1 className="text-2xl font-bold flex items-center justify-center gap-2 text-amber-50 tracking-wide">
            <Anchor className="w-5 h-5 text-amber-400" />
            BATTLESHIP
          </h1>
        </header>

        {/* Status banner */}
        <div
          className={`rounded-lg p-3 mb-4 text-center text-sm font-medium border ${
            gameOver === "player"
              ? "bg-emerald-900/40 border-emerald-700 text-emerald-100"
              : gameOver === "ai"
              ? "bg-red-900/40 border-red-700 text-red-100"
              : turn === "ai"
              ? "bg-amber-900/30 border-amber-800/60 text-amber-100"
              : "bg-sky-900/40 border-sky-700/60 text-sky-100"
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            {gameOver === "player" && <Trophy className="w-4 h-4" />}
            {gameOver === "ai" && <Skull className="w-4 h-4" />}
            {!gameOver && turn === "ai" && (
              <span className="inline-block w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            )}
            <span>{status}</span>
          </div>
        </div>

        {/* Enemy board */}
        <section className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs uppercase tracking-widest text-slate-400 flex items-center gap-1.5 font-semibold">
              <Crosshair className="w-3.5 h-3.5" /> Enemy Waters
            </h2>
            <span className="text-[10px] text-slate-500">Tap to fire</span>
          </div>
          <div className="flex justify-center">
            <BoardView board={aiBoard} renderCell={renderEnemyCellWithContent} />
          </div>
          <ShipStatus board={aiBoard} />
        </section>

        {/* Player board */}
        <section className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs uppercase tracking-widest text-slate-400 flex items-center gap-1.5 font-semibold">
              <Ship className="w-3.5 h-3.5" /> Your Fleet
            </h2>
            {!firstMoveMade && !gameOver && (
              <button
                onClick={randomizeFleet}
                className="text-[10px] text-sky-400 hover:text-sky-300 underline"
              >
                Randomize
              </button>
            )}
          </div>
          <div className="flex justify-center">
            <BoardView board={playerBoard} renderCell={renderPlayerCell} />
          </div>
          <ShipStatus board={playerBoard} />
        </section>

        <button
          onClick={newGame}
          className="w-full bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-600 rounded-lg py-2.5 px-4 flex items-center justify-center gap-2 text-sm font-medium transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          New Game
        </button>

        <p className="text-center text-[10px] text-slate-600 mt-4">
          Classic rules · 5 ships · alternating turns
        </p>
      </div>

      {/* Win / Loss flag overlay */}
      {gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div
            className={`relative w-full max-w-sm rounded-2xl border-2 p-6 text-center shadow-2xl ${
              gameOver === "player"
                ? "bg-gradient-to-b from-emerald-900 to-slate-900 border-emerald-500"
                : "bg-gradient-to-b from-red-950 to-slate-900 border-red-600"
            }`}
          >
            <div className="flex justify-center mb-3">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center border-2 ${
                  gameOver === "player"
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                    : "bg-red-500/20 border-red-400 text-red-300"
                }`}
              >
                {gameOver === "player" ? (
                  <Trophy className="w-8 h-8" />
                ) : (
                  <Skull className="w-8 h-8" />
                )}
              </div>
            </div>

            <div
              className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-1 rounded mb-2 ${
                gameOver === "player"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-red-500/20 text-red-200"
              }`}
            >
              <Flag className="w-3 h-3" />
              {gameOver === "player" ? "Victory" : "Defeat"}
            </div>

            <h2 className="text-3xl font-bold text-white mb-1 tracking-wide">
              {gameOver === "player" ? "You Won!" : "You Lost"}
            </h2>
            <p className="text-sm text-slate-300 mb-5">
              {gameOver === "player"
                ? "Enemy fleet sent to the depths."
                : "Your fleet has been destroyed."}
            </p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-5 text-left">
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-2">
                <div className="text-[9px] text-slate-400 uppercase tracking-wider">Shots</div>
                <div className="text-lg font-bold text-white">{playerStats.shots}</div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-2">
                <div className="text-[9px] text-slate-400 uppercase tracking-wider">Hits</div>
                <div className="text-lg font-bold text-white">{playerStats.hits}</div>
              </div>
              <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-2">
                <div className="text-[9px] text-slate-400 uppercase tracking-wider">Acc.</div>
                <div className="text-lg font-bold text-white">{playerStats.accuracy}%</div>
              </div>
            </div>

            <div className="text-[10px] text-slate-400 mb-4">
              Enemy accuracy: {aiStats.accuracy}% ({aiStats.hits}/{aiStats.shots})
            </div>

            <button
              onClick={newGame}
              className={`w-full rounded-lg py-2.5 px-4 flex items-center justify-center gap-2 text-sm font-semibold text-white transition-colors ${
                gameOver === "player"
                  ? "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700"
                  : "bg-red-600 hover:bg-red-500 active:bg-red-700"
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              Play Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
