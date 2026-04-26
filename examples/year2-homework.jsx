/**
 * @stele-manifest
 * name: Year 2 Mission HQ
 * version: 1.0.0
 * author: Wombat HQ
 * description: A six-mission Year 2 mid-year homework artifact — Adding Asteroids, Coin Counter, Time Detective, Shape Sleuth, Reading Quest and Spelling Hero. Finish all six and hit "Tell My Teacher" to receive your printable Mission Report PDF.
 * archetype: self-contained
 */

import { useState, useMemo, useEffect } from "react";
import {
  Rocket, Coins, Clock, Shapes, BookOpen, Pencil,
  Star, Trophy, Phone, FileText, Sparkles, Check, X, ChevronRight, ChevronLeft,
} from "lucide-react";

// ============================================================
// Activity data
// ============================================================

const ADD_QUESTIONS = [
  { q: "24 + 13", a: 37, opts: [35, 36, 37, 38] },
  { q: "45 + 27", a: 72, opts: [62, 71, 72, 82] },
  { q: "36 + 18", a: 54, opts: [44, 53, 54, 64] },
];

const COIN_QUESTIONS = [
  {
    coins: ["50c", "20c", "10c", "5c"],
    a: "85c",
    opts: ["75c", "80c", "85c", "95c"],
  },
  {
    coins: ["$1", "50c", "20c"],
    a: "$1.70",
    opts: ["$1.20", "$1.50", "$1.70", "$2.00"],
  },
  {
    coins: ["$2", "$1", "50c"],
    a: "$3.50",
    opts: ["$3.20", "$3.30", "$3.50", "$4.00"],
  },
];

const TIME_QUESTIONS = [
  { hour: 3, minute: 0, a: "3:00", opts: ["2:00", "3:00", "4:00", "12:00"] },
  { hour: 6, minute: 30, a: "6:30", opts: ["5:30", "6:30", "7:30", "6:00"] },
  { hour: 9, minute: 0, a: "9:00", opts: ["8:00", "9:00", "10:00", "3:00"] },
];

// shapes are { kind, isTarget } — kid clicks the ones with isTarget true
const SHAPE_QUESTIONS = [
  {
    target: "Triangle",
    grid: [
      { kind: "square", hit: false },
      { kind: "triangle", hit: true },
      { kind: "circle", hit: false },
      { kind: "triangle", hit: true },
      { kind: "rectangle", hit: false },
      { kind: "triangle", hit: true },
    ],
  },
  {
    target: "Circle",
    grid: [
      { kind: "triangle", hit: false },
      { kind: "circle", hit: true },
      { kind: "square", hit: false },
      { kind: "circle", hit: true },
      { kind: "hexagon", hit: false },
      { kind: "rectangle", hit: false },
    ],
  },
  {
    target: "Rectangle",
    grid: [
      { kind: "rectangle", hit: true },
      { kind: "triangle", hit: false },
      { kind: "circle", hit: false },
      { kind: "rectangle", hit: true },
      { kind: "square", hit: false },
      { kind: "triangle", hit: false },
    ],
  },
];

const STORY = `Wally the wombat lives in a deep burrow under a big gum tree. Every night, when the stars come out, Wally waddles into the bush to munch on grass and tasty roots. He has strong claws to dig his burrow even bigger. Wombats sleep all day because they are nocturnal. Wally's best friend is a kookaburra named Kira who wakes the bush up with a giggle every morning.`;

const READ_QUESTIONS = [
  {
    q: "Where does Wally live?",
    opts: [
      "In a tree house",
      "In a burrow under a gum tree",
      "On a farm",
      "In a pond",
    ],
    a: 1,
  },
  {
    q: "When does Wally come out to eat?",
    opts: ["In the morning", "At lunchtime", "At night", "Never"],
    a: 2,
  },
  {
    q: 'What does the word "nocturnal" mean?',
    opts: [
      "Loves yummy food",
      "Active at night and sleeps in the day",
      "Wakes up super early",
      "Loves to dig",
    ],
    a: 1,
  },
];

const SPELL_QUESTIONS = [
  { scramble: "vrey", answer: "very" },
  { scramble: "frined", answer: "friend" },
  { scramble: "kown", answer: "know" },
];

const TOTAL_QUESTIONS =
  ADD_QUESTIONS.length +
  COIN_QUESTIONS.length +
  TIME_QUESTIONS.length +
  SHAPE_QUESTIONS.length +
  READ_QUESTIONS.length +
  SPELL_QUESTIONS.length;

// ============================================================
// SVG helpers
// ============================================================

function ClockSVG({ hour, minute, size = 140 }) {
  const c = size / 2;
  const r = c - 8;
  const hourAngle = ((hour % 12) + minute / 60) * 30 - 90;
  const minuteAngle = minute * 6 - 90;
  const hourEnd = {
    x: c + Math.cos((hourAngle * Math.PI) / 180) * r * 0.5,
    y: c + Math.sin((hourAngle * Math.PI) / 180) * r * 0.5,
  };
  const minEnd = {
    x: c + Math.cos((minuteAngle * Math.PI) / 180) * r * 0.8,
    y: c + Math.sin((minuteAngle * Math.PI) / 180) * r * 0.8,
  };
  const ticks = [];
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 - 90) * (Math.PI / 180);
    const x = c + Math.cos(a) * (r - 14);
    const y = c + Math.sin(a) * (r - 14);
    ticks.push(
      <text
        key={i}
        x={x}
        y={y + 5}
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill="#475569"
      >
        {i === 0 ? 12 : i}
      </text>
    );
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={r} fill="#fff7ed" stroke="#f59e0b" strokeWidth="4" />
      {ticks}
      <line x1={c} y1={c} x2={hourEnd.x} y2={hourEnd.y} stroke="#0f172a" strokeWidth="6" strokeLinecap="round" />
      <line x1={c} y1={c} x2={minEnd.x} y2={minEnd.y} stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
      <circle cx={c} cy={c} r="6" fill="#dc2626" />
    </svg>
  );
}

function CoinSVG({ value, size = 64 }) {
  const palette = {
    "5c": { fill: "#fef3c7", stroke: "#a16207", text: "#78350f" },
    "10c": { fill: "#fef3c7", stroke: "#a16207", text: "#78350f" },
    "20c": { fill: "#fef3c7", stroke: "#a16207", text: "#78350f" },
    "50c": { fill: "#fde68a", stroke: "#a16207", text: "#78350f" },
    $1: { fill: "#fbbf24", stroke: "#b45309", text: "#78350f" },
    $2: { fill: "#fcd34d", stroke: "#b45309", text: "#78350f" },
  };
  const p = palette[value] || palette["10c"];
  // 50c is the famously dodecagonal coin
  if (value === "50c") {
    const points = [];
    for (let i = 0; i < 12; i++) {
      const a = ((i * 30 - 90) * Math.PI) / 180;
      points.push(`${size / 2 + Math.cos(a) * (size / 2 - 4)},${size / 2 + Math.sin(a) * (size / 2 - 4)}`);
    }
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <polygon points={points.join(" ")} fill={p.fill} stroke={p.stroke} strokeWidth="3" />
        <text x={size / 2} y={size / 2 + 6} textAnchor="middle" fontSize="16" fontWeight="800" fill={p.text}>
          {value}
        </text>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={size / 2 - 4} fill={p.fill} stroke={p.stroke} strokeWidth="3" />
      <text x={size / 2} y={size / 2 + 6} textAnchor="middle" fontSize="16" fontWeight="800" fill={p.text}>
        {value}
      </text>
    </svg>
  );
}

function ShapeSVG({ kind, size = 90, color = "#7c3aed", picked = false }) {
  const stroke = picked ? "#16a34a" : "#1e293b";
  const fill = picked ? "#bbf7d0" : color;
  const strokeWidth = picked ? 5 : 3;
  switch (kind) {
    case "circle":
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={size / 2 - 6} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        </svg>
      );
    case "square":
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <rect x="8" y="8" width={size - 16} height={size - 16} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        </svg>
      );
    case "rectangle":
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <rect x="6" y="22" width={size - 12} height={size - 44} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        </svg>
      );
    case "triangle":
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <polygon
            points={`${size / 2},8 ${size - 8},${size - 8} 8,${size - 8}`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </svg>
      );
    case "hexagon": {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = ((i * 60 - 30) * Math.PI) / 180;
        pts.push(`${size / 2 + Math.cos(a) * (size / 2 - 6)},${size / 2 + Math.sin(a) * (size / 2 - 6)}`);
      }
      return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <polygon points={pts.join(" ")} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        </svg>
      );
    }
    default:
      return null;
  }
}

// Cute wombat mascot
function Wombat({ size = 64, mood = "happy" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {/* body */}
      <ellipse cx="50" cy="65" rx="38" ry="30" fill="#92400e" />
      {/* head */}
      <ellipse cx="50" cy="40" rx="28" ry="24" fill="#a16207" />
      {/* ears */}
      <ellipse cx="28" cy="22" rx="8" ry="9" fill="#a16207" />
      <ellipse cx="72" cy="22" rx="8" ry="9" fill="#a16207" />
      <ellipse cx="28" cy="22" rx="4" ry="5" fill="#fbbf24" />
      <ellipse cx="72" cy="22" rx="4" ry="5" fill="#fbbf24" />
      {/* eyes */}
      <circle cx="40" cy="38" r="4" fill="#1e293b" />
      <circle cx="60" cy="38" r="4" fill="#1e293b" />
      <circle cx="41" cy="36" r="1.5" fill="#fff" />
      <circle cx="61" cy="36" r="1.5" fill="#fff" />
      {/* nose */}
      <ellipse cx="50" cy="48" rx="5" ry="3" fill="#1e293b" />
      {/* mouth */}
      {mood === "happy" ? (
        <path d="M 42 54 Q 50 60 58 54" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round" />
      ) : (
        <circle cx="50" cy="55" r="2.5" fill="#1e293b" />
      )}
      {/* feet */}
      <ellipse cx="35" cy="92" rx="8" ry="4" fill="#78350f" />
      <ellipse cx="65" cy="92" rx="8" ry="4" fill="#78350f" />
    </svg>
  );
}

// ============================================================
// Activity components
// ============================================================

const palette = {
  bg: "#fef3c7",
  card: "#fff",
  ink: "#1e293b",
  muted: "#64748b",
  good: "#16a34a",
  bad: "#dc2626",
  brand: "#7c3aed",
  brand2: "#db2777",
  warm: "#f59e0b",
};

function bigBtn(extra = {}) {
  return {
    fontSize: 22,
    fontWeight: 800,
    padding: "16px 28px",
    borderRadius: 16,
    border: "4px solid #1e293b",
    cursor: "pointer",
    boxShadow: "4px 4px 0 #1e293b",
    background: "#fbbf24",
    color: "#1e293b",
    fontFamily: "inherit",
    ...extra,
  };
}

function FeedbackBubble({ kind, text }) {
  if (!kind) return null;
  const isGood = kind === "good";
  return (
    <div
      style={{
        marginTop: 16,
        padding: "12px 18px",
        borderRadius: 14,
        background: isGood ? "#dcfce7" : "#fee2e2",
        border: `3px solid ${isGood ? palette.good : palette.bad}`,
        color: isGood ? "#14532d" : "#7f1d1d",
        fontSize: 18,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {isGood ? <Sparkles size={22} /> : <X size={22} />}
      {text}
    </div>
  );
}

function MultipleChoice({ question, options, correctIndex, onAnswered, prompt }) {
  const [picked, setPicked] = useState(null);
  function pick(i) {
    if (picked !== null) return;
    setPicked(i);
    setTimeout(() => onAnswered(i === correctIndex), 900);
  }
  return (
    <div>
      {prompt && (
        <div style={{ fontSize: 18, color: palette.muted, marginBottom: 8, fontWeight: 600 }}>
          {prompt}
        </div>
      )}
      <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 16, color: palette.ink }}>
        {question}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {options.map((opt, i) => {
          const isPicked = picked === i;
          const isCorrect = i === correctIndex;
          let bg = "#fff";
          let border = palette.ink;
          if (picked !== null) {
            if (isCorrect) {
              bg = "#bbf7d0";
              border = palette.good;
            } else if (isPicked && !isCorrect) {
              bg = "#fecaca";
              border = palette.bad;
            }
          }
          return (
            <button
              key={i}
              onClick={() => pick(i)}
              disabled={picked !== null}
              style={{
                ...bigBtn({ background: bg, fontSize: 24, padding: "20px 16px", borderColor: border }),
                cursor: picked === null ? "pointer" : "default",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MissionScaffold({ title, icon, color, children, qIndex, qTotal }) {
  return (
    <div
      style={{
        background: palette.card,
        borderRadius: 24,
        border: `5px solid ${color}`,
        padding: 24,
        boxShadow: "6px 6px 0 #1e293b",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div
          style={{
            width: 52,
            height: 52,
            background: color,
            borderRadius: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            border: "3px solid #1e293b",
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: palette.ink }}>{title}</div>
          <div style={{ fontSize: 14, color: palette.muted, fontWeight: 600 }}>
            Question {qIndex + 1} of {qTotal}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

// --- Mission 1: Adding Asteroids ---
function AddingAsteroids({ onDone }) {
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const q = ADD_QUESTIONS[i];
  function answered(ok) {
    const next = correct + (ok ? 1 : 0);
    if (i + 1 >= ADD_QUESTIONS.length) onDone(next);
    else {
      setCorrect(next);
      setI(i + 1);
    }
  }
  return (
    <MissionScaffold
      title="Adding Asteroids"
      icon={<Rocket size={28} />}
      color="#dc2626"
      qIndex={i}
      qTotal={ADD_QUESTIONS.length}
    >
      <div style={{ fontSize: 16, color: palette.muted, marginBottom: 8 }}>
        Captain Wombat needs your maths to blast the asteroid! What's the answer?
      </div>
      <MultipleChoice
        key={i}
        question={`${q.q} = ?`}
        options={q.opts}
        correctIndex={q.opts.indexOf(q.a)}
        onAnswered={answered}
      />
    </MissionScaffold>
  );
}

// --- Mission 2: Coin Counter ---
function CoinCounter({ onDone }) {
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const q = COIN_QUESTIONS[i];
  function answered(ok) {
    const next = correct + (ok ? 1 : 0);
    if (i + 1 >= COIN_QUESTIONS.length) onDone(next);
    else {
      setCorrect(next);
      setI(i + 1);
    }
  }
  return (
    <MissionScaffold
      title="Coin Counter"
      icon={<Coins size={28} />}
      color="#f59e0b"
      qIndex={i}
      qTotal={COIN_QUESTIONS.length}
    >
      <div style={{ fontSize: 16, color: palette.muted, marginBottom: 12 }}>
        Add up the Aussie coins. How much money is here?
      </div>
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          padding: 18,
          background: "#fef3c7",
          borderRadius: 14,
          border: "3px dashed #a16207",
          marginBottom: 16,
        }}
      >
        {q.coins.map((c, idx) => (
          <CoinSVG key={idx} value={c} />
        ))}
      </div>
      <MultipleChoice
        key={i}
        question="What's the total?"
        options={q.opts}
        correctIndex={q.opts.indexOf(q.a)}
        onAnswered={answered}
      />
    </MissionScaffold>
  );
}

// --- Mission 3: Time Detective ---
function TimeDetective({ onDone }) {
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const q = TIME_QUESTIONS[i];
  function answered(ok) {
    const next = correct + (ok ? 1 : 0);
    if (i + 1 >= TIME_QUESTIONS.length) onDone(next);
    else {
      setCorrect(next);
      setI(i + 1);
    }
  }
  return (
    <MissionScaffold
      title="Time Detective"
      icon={<Clock size={28} />}
      color="#0ea5e9"
      qIndex={i}
      qTotal={TIME_QUESTIONS.length}
    >
      <div style={{ fontSize: 16, color: palette.muted, marginBottom: 12 }}>
        Read the clock and pick the right time.
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <ClockSVG hour={q.hour} minute={q.minute} />
      </div>
      <MultipleChoice
        key={i}
        question="What time is it?"
        options={q.opts}
        correctIndex={q.opts.indexOf(q.a)}
        onAnswered={answered}
      />
    </MissionScaffold>
  );
}

// --- Mission 4: Shape Sleuth ---
function ShapeSleuth({ onDone }) {
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [picked, setPicked] = useState({});
  const [done, setDone] = useState(false);
  const q = SHAPE_QUESTIONS[i];

  const targetCount = q.grid.filter((s) => s.hit).length;
  const hitsPicked = Object.entries(picked).filter(([idx, p]) => p && q.grid[idx].hit).length;
  const wrongPicked = Object.entries(picked).filter(([idx, p]) => p && !q.grid[idx].hit).length;
  const allHit = hitsPicked === targetCount && wrongPicked === 0;

  useEffect(() => {
    if (allHit && !done) {
      setDone(true);
      setTimeout(() => {
        const next = correct + 1;
        if (i + 1 >= SHAPE_QUESTIONS.length) onDone(next);
        else {
          setCorrect(next);
          setI(i + 1);
          setPicked({});
          setDone(false);
        }
      }, 700);
    }
  }, [allHit, done]);

  function nextRound(scored) {
    const next = correct + (scored ? 1 : 0);
    if (i + 1 >= SHAPE_QUESTIONS.length) onDone(next);
    else {
      setCorrect(next);
      setI(i + 1);
      setPicked({});
      setDone(false);
    }
  }

  return (
    <MissionScaffold
      title="Shape Sleuth"
      icon={<Shapes size={28} />}
      color="#7c3aed"
      qIndex={i}
      qTotal={SHAPE_QUESTIONS.length}
    >
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
        Click ALL the <span style={{ color: palette.brand }}>{q.target}s</span>!
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {q.grid.map((s, idx) => {
          const isPicked = !!picked[idx];
          const wrong = isPicked && !s.hit;
          return (
            <button
              key={idx}
              onClick={() => setPicked({ ...picked, [idx]: !isPicked })}
              disabled={done}
              style={{
                background: wrong ? "#fee2e2" : "#fafaf9",
                border: `4px solid ${wrong ? palette.bad : isPicked ? palette.good : "#1e293b"}`,
                borderRadius: 14,
                padding: 8,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShapeSVG kind={s.kind} picked={isPicked && s.hit} color="#fbbf24" />
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: palette.muted, fontWeight: 600 }}>
          Found {hitsPicked} of {targetCount}{wrongPicked > 0 ? ` (oops — ${wrongPicked} wrong)` : ""}
        </div>
        <button
          onClick={() => !done && nextRound(allHit)}
          disabled={done}
          style={bigBtn({ fontSize: 18, padding: "10px 20px", background: "#fbbf24", opacity: done ? 0.5 : 1 })}
        >
          Skip
        </button>
      </div>
    </MissionScaffold>
  );
}

// --- Mission 5: Reading Quest ---
function ReadingQuest({ onDone }) {
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const q = READ_QUESTIONS[i];
  function answered(ok) {
    const next = correct + (ok ? 1 : 0);
    if (i + 1 >= READ_QUESTIONS.length) onDone(next);
    else {
      setCorrect(next);
      setI(i + 1);
    }
  }
  return (
    <MissionScaffold
      title="Reading Quest"
      icon={<BookOpen size={28} />}
      color="#16a34a"
      qIndex={i}
      qTotal={READ_QUESTIONS.length}
    >
      <div
        style={{
          background: "#ecfccb",
          border: "3px solid #65a30d",
          borderRadius: 14,
          padding: 16,
          marginBottom: 16,
          fontSize: 16,
          lineHeight: 1.6,
          color: palette.ink,
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 6, color: "#3f6212" }}>
          Wally's Wombat World
        </div>
        {STORY}
      </div>
      <MultipleChoice
        key={i}
        question={q.q}
        options={q.opts}
        correctIndex={q.a}
        onAnswered={answered}
      />
    </MissionScaffold>
  );
}

// --- Mission 6: Spelling Hero ---
function SpellingHero({ onDone }) {
  const [i, setI] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [val, setVal] = useState("");
  const [feedback, setFeedback] = useState(null);
  const q = SPELL_QUESTIONS[i];

  function submit() {
    const ok = val.trim().toLowerCase() === q.answer.toLowerCase();
    setFeedback({ kind: ok ? "good" : "bad", text: ok ? "Spot on!" : `The word was "${q.answer}"` });
    setTimeout(() => {
      const next = correct + (ok ? 1 : 0);
      if (i + 1 >= SPELL_QUESTIONS.length) onDone(next);
      else {
        setCorrect(next);
        setI(i + 1);
        setVal("");
        setFeedback(null);
      }
    }, 1100);
  }

  return (
    <MissionScaffold
      title="Spelling Hero"
      icon={<Pencil size={28} />}
      color="#db2777"
      qIndex={i}
      qTotal={SPELL_QUESTIONS.length}
    >
      <div style={{ fontSize: 16, color: palette.muted, marginBottom: 12 }}>
        Unscramble the letters to spell the sight word!
      </div>
      <div
        style={{
          fontSize: 48,
          fontWeight: 900,
          textAlign: "center",
          letterSpacing: "0.3em",
          padding: "16px 0",
          background: "#fce7f3",
          borderRadius: 14,
          border: "3px dashed #db2777",
          marginBottom: 16,
          color: "#831843",
        }}
      >
        {q.scramble.toUpperCase()}
      </div>
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && val.trim() && submit()}
        placeholder="Type your answer here..."
        autoFocus
        disabled={!!feedback}
        style={{
          width: "100%",
          fontSize: 28,
          fontWeight: 700,
          padding: "12px 16px",
          border: "4px solid #1e293b",
          borderRadius: 14,
          fontFamily: "inherit",
          marginBottom: 12,
          boxSizing: "border-box",
          textAlign: "center",
          background: "#fff",
        }}
      />
      <button
        onClick={submit}
        disabled={!val.trim() || !!feedback}
        style={bigBtn({
          width: "100%",
          background: !val.trim() ? "#e2e8f0" : "#fbbf24",
          opacity: !val.trim() ? 0.6 : 1,
        })}
      >
        Check it!
      </button>
      <FeedbackBubble {...(feedback || {})} />
    </MissionScaffold>
  );
}

// ============================================================
// Mission catalogue
// ============================================================

const MISSIONS = [
  { key: "add", title: "Adding Asteroids", subject: "Maths", icon: Rocket, color: "#dc2626", Component: AddingAsteroids, total: ADD_QUESTIONS.length },
  { key: "coin", title: "Coin Counter", subject: "Money", icon: Coins, color: "#f59e0b", Component: CoinCounter, total: COIN_QUESTIONS.length },
  { key: "time", title: "Time Detective", subject: "Time", icon: Clock, color: "#0ea5e9", Component: TimeDetective, total: TIME_QUESTIONS.length },
  { key: "shape", title: "Shape Sleuth", subject: "Geometry", icon: Shapes, color: "#7c3aed", Component: ShapeSleuth, total: SHAPE_QUESTIONS.length },
  { key: "read", title: "Reading Quest", subject: "Reading", icon: BookOpen, color: "#16a34a", Component: ReadingQuest, total: READ_QUESTIONS.length },
  { key: "spell", title: "Spelling Hero", subject: "Spelling", icon: Pencil, color: "#db2777", Component: SpellingHero, total: SPELL_QUESTIONS.length },
];

// ============================================================
// Mission Map
// ============================================================

function MissionMap({ progress, onPick, kidName }) {
  const allDone = MISSIONS.every((m) => progress[m.key]?.done);
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <Wombat size={56} />
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 14, color: palette.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
              Welcome, Agent
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: palette.ink }}>
              {kidName || "..."}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 18, color: palette.muted, fontWeight: 600 }}>
          Pick a mission to start! Tap one of the badges below.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {MISSIONS.map((m) => {
          const p = progress[m.key];
          const done = p?.done;
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              onClick={() => onPick(m.key)}
              style={{
                background: done ? "#dcfce7" : "#fff",
                border: `5px solid ${done ? palette.good : m.color}`,
                borderRadius: 22,
                padding: 18,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                boxShadow: "5px 5px 0 #1e293b",
                position: "relative",
                transition: "transform 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translate(-2px, -2px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translate(0, 0)")}
            >
              {done && (
                <div
                  style={{
                    position: "absolute",
                    top: -14,
                    right: -14,
                    background: palette.good,
                    color: "#fff",
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "3px solid #1e293b",
                  }}
                >
                  <Check size={20} strokeWidth={4} />
                </div>
              )}
              <div
                style={{
                  width: 52,
                  height: 52,
                  background: m.color,
                  borderRadius: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  border: "3px solid #1e293b",
                  marginBottom: 10,
                }}
              >
                <Icon size={28} />
              </div>
              <div style={{ fontSize: 11, color: palette.muted, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>
                {m.subject}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: palette.ink, marginTop: 2 }}>
                {m.title}
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
                {Array.from({ length: m.total }).map((_, i) => (
                  <Star
                    key={i}
                    size={20}
                    fill={done && i < (p?.score || 0) ? "#fbbf24" : "none"}
                    color={done && i < (p?.score || 0) ? "#f59e0b" : "#cbd5e1"}
                    strokeWidth={2}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {allDone && (
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              display: "inline-block",
              padding: "8px 18px",
              background: "#fef3c7",
              border: "3px solid #f59e0b",
              borderRadius: 999,
              fontWeight: 800,
              color: "#78350f",
              marginBottom: 14,
              fontSize: 15,
            }}
          >
            ALL SIX MISSIONS COMPLETE!
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Submission animation
// ============================================================

const STAGES = [
  { icon: Phone, text: "Calling your teacher's classroom phone..." },
  { icon: Phone, text: "Brrring brrring brrring..." },
  { icon: Sparkles, text: "Hmm, the line is busy. They must be on lunch duty!" },
  { icon: FileText, text: "No worries — generating your Mission Report PDF instead..." },
];

function Submitting({ teacherName, onPrint }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (stage >= STAGES.length) {
      onPrint();
      return;
    }
    const t = setTimeout(() => setStage(stage + 1), 1300);
    return () => clearTimeout(t);
  }, [stage]);
  const Step = STAGES[Math.min(stage, STAGES.length - 1)];
  const Icon = Step.icon;
  return (
    <div
      style={{
        background: palette.card,
        border: "5px solid #1e293b",
        borderRadius: 24,
        padding: 40,
        textAlign: "center",
        boxShadow: "8px 8px 0 #1e293b",
      }}
    >
      <div style={{ fontSize: 14, color: palette.muted, fontWeight: 800, textTransform: "uppercase", letterSpacing: 2 }}>
        Sending to {teacherName || "your teacher"}
      </div>
      <div
        style={{
          margin: "24px auto",
          width: 110,
          height: 110,
          borderRadius: "50%",
          background: "#fef3c7",
          border: "5px solid #f59e0b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "wobble 0.8s ease-in-out infinite",
        }}
      >
        <Icon size={56} color="#92400e" />
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: palette.ink, minHeight: 60 }}>
        {Step.text}
      </div>
      <div
        style={{
          marginTop: 24,
          height: 16,
          background: "#e2e8f0",
          borderRadius: 999,
          border: "3px solid #1e293b",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${((stage + 1) / STAGES.length) * 100}%`,
            background: "linear-gradient(90deg, #fbbf24, #db2777)",
            transition: "width 0.4s",
          }}
        />
      </div>
    </div>
  );
}

// ============================================================
// Mission Report (the print-only PDF view)
// ============================================================

function rankFor(stars, total) {
  const pct = total === 0 ? 0 : stars / total;
  if (pct >= 0.9) return { label: "Gold Wombat Commander", color: "#f59e0b" };
  if (pct >= 0.75) return { label: "Silver Wombat Explorer", color: "#94a3b8" };
  if (pct >= 0.5) return { label: "Bronze Wombat Cadet", color: "#a16207" };
  return { label: "Wombat in Training", color: "#16a34a" };
}

function MissionReport({ kidName, teacherName, progress }) {
  const totalStars = MISSIONS.reduce((s, m) => s + (progress[m.key]?.score || 0), 0);
  const totalPossible = MISSIONS.reduce((s, m) => s + m.total, 0);
  const rank = rankFor(totalStars, totalPossible);
  const today = new Date().toLocaleDateString("en-AU", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  return (
    <div className="report">
      <div className="report-border">
        <header className="report-header">
          <div className="report-flag">WOMBAT HQ</div>
          <h1>Year 2 Mid-Year Mission Report</h1>
          <div className="report-date">{today}</div>
        </header>

        <section className="report-names">
          <div>
            <div className="lbl">Agent</div>
            <div className="val">{kidName || "_______________"}</div>
          </div>
          <div>
            <div className="lbl">Reporting to</div>
            <div className="val">{teacherName || "_______________"}</div>
          </div>
        </section>

        <section className="report-rank">
          <div className="rank-line">FINAL RANK</div>
          <div className="rank-badge" style={{ color: rank.color, borderColor: rank.color }}>
            {rank.label}
          </div>
          <div className="rank-stars">
            {totalStars} / {totalPossible} stars earned
          </div>
        </section>

        <section className="report-missions">
          <h2>Mission Log</h2>
          <table>
            <thead>
              <tr>
                <th>Mission</th>
                <th>Subject</th>
                <th>Result</th>
                <th>Stars</th>
              </tr>
            </thead>
            <tbody>
              {MISSIONS.map((m) => {
                const p = progress[m.key];
                const done = p?.done;
                const score = p?.score || 0;
                return (
                  <tr key={m.key}>
                    <td>{m.title}</td>
                    <td>{m.subject}</td>
                    <td>{done ? "Complete" : "Not attempted"}</td>
                    <td>
                      {Array.from({ length: m.total }).map((_, i) =>
                        i < score ? "★" : "☆"
                      ).join(" ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="report-message">
          <p>
            Wombat HQ confirms that the agent above completed their Year 2 mid-year
            mission training. They are hereby commended for their bravery in the
            face of two-digit addition, half-past clocks and tricky sight words.
          </p>
        </section>

        <footer className="report-footer">
          <div className="sig">
            <div className="sig-line">_______________________</div>
            <div className="sig-label">Wombat HQ Commander</div>
          </div>
          <div className="sig">
            <div className="sig-line">_______________________</div>
            <div className="sig-label">Teacher signature</div>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ============================================================
// Top-level app
// ============================================================

const STYLES = `
  @keyframes wobble {
    0%, 100% { transform: rotate(-6deg); }
    50% { transform: rotate(6deg); }
  }
  @keyframes pop {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }
  .pop-btn:hover { animation: pop 0.4s ease-in-out; }
  .print-only { display: none; }
  @media print {
    .screen-only { display: none !important; }
    .print-only { display: block !important; }
    body { background: #fff !important; }
  }
  .report { font-family: Georgia, "Times New Roman", serif; color: #1e293b; padding: 24px; }
  .report-border { border: 6px double #1e293b; padding: 36px; }
  .report-header { text-align: center; border-bottom: 3px solid #1e293b; padding-bottom: 16px; margin-bottom: 24px; }
  .report-flag { display: inline-block; background: #1e293b; color: #fbbf24; padding: 4px 14px; font-weight: 800; letter-spacing: 3px; font-size: 12px; font-family: Arial, sans-serif; }
  .report-header h1 { margin: 12px 0 6px; font-size: 30px; }
  .report-date { color: #64748b; font-style: italic; }
  .report-names { display: flex; justify-content: space-between; margin-bottom: 28px; }
  .report-names .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; font-family: Arial, sans-serif; }
  .report-names .val { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .report-rank { text-align: center; margin-bottom: 28px; padding: 18px; background: #fef3c7; }
  .rank-line { font-size: 11px; letter-spacing: 3px; color: #78350f; font-family: Arial, sans-serif; font-weight: 800; }
  .rank-badge { display: inline-block; margin: 8px 0; padding: 8px 18px; border: 3px solid #f59e0b; font-size: 22px; font-weight: 900; background: #fff; }
  .rank-stars { font-size: 14px; color: #78350f; font-weight: 700; }
  .report-missions h2 { font-size: 18px; border-bottom: 2px solid #1e293b; padding-bottom: 6px; margin-bottom: 12px; }
  .report-missions table { width: 100%; border-collapse: collapse; }
  .report-missions th, .report-missions td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #cbd5e1; }
  .report-missions th { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #475569; font-family: Arial, sans-serif; }
  .report-missions td:nth-child(4) { color: #f59e0b; font-size: 18px; letter-spacing: 2px; }
  .report-message { margin-top: 20px; padding: 16px; background: #f1f5f9; font-style: italic; line-height: 1.6; }
  .report-footer { display: flex; justify-content: space-around; margin-top: 40px; }
  .sig { text-align: center; }
  .sig-line { font-size: 18px; }
  .sig-label { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; margin-top: 4px; font-family: Arial, sans-serif; }
`;

export default function HomeworkMissionHQ() {
  const [kidName, setKidName] = useState("");
  const [teacherName, setTeacherName] = useState("Ms. Wilson");
  const [started, setStarted] = useState(false);
  const [activeMission, setActiveMission] = useState(null);
  const [progress, setProgress] = useState({}); // { [key]: { done, score } }
  const [phase, setPhase] = useState("home"); // home | mission | submitting | sent

  const allDone = MISSIONS.every((m) => progress[m.key]?.done);
  const totalCorrect = MISSIONS.reduce((s, m) => s + (progress[m.key]?.score || 0), 0);

  function finishMission(score) {
    setProgress({ ...progress, [activeMission]: { done: true, score } });
    setActiveMission(null);
    setPhase("home");
  }

  function startSubmit() {
    setPhase("submitting");
  }

  function doPrint() {
    setPhase("sent");
    setTimeout(() => window.print(), 100);
  }

  // ---- splash ----
  if (!started) {
    return (
      <div style={{ minHeight: "100vh", background: palette.bg, padding: 24, fontFamily: "'Comic Sans MS', 'Trebuchet MS', system-ui, sans-serif" }}>
        <style>{STYLES}</style>
        <div className="screen-only" style={{ maxWidth: 560, margin: "40px auto" }}>
          <div
            style={{
              background: palette.card,
              border: "5px solid #1e293b",
              borderRadius: 28,
              padding: 32,
              boxShadow: "8px 8px 0 #1e293b",
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <Wombat size={120} />
            </div>
            <div
              style={{
                display: "inline-block",
                background: "#fbbf24",
                padding: "4px 14px",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 3,
                border: "3px solid #1e293b",
                borderRadius: 8,
                color: "#1e293b",
              }}
            >
              WOMBAT HQ ★ TOP SECRET
            </div>
            <h1 style={{ fontSize: 36, margin: "16px 0 4px", color: palette.ink, fontWeight: 900 }}>
              Year 2 Mission HQ
            </h1>
            <div style={{ color: palette.muted, fontWeight: 700, marginBottom: 24, fontSize: 17 }}>
              Six missions. {TOTAL_QUESTIONS} questions. One brave wombat agent.
            </div>

            <div style={{ textAlign: "left" }}>
              <label style={{ fontSize: 12, fontWeight: 800, color: palette.muted, textTransform: "uppercase", letterSpacing: 1.5 }}>
                Your name, Agent:
              </label>
              <input
                type="text"
                value={kidName}
                onChange={(e) => setKidName(e.target.value)}
                placeholder="Type your name here..."
                style={{
                  width: "100%",
                  fontSize: 22,
                  fontWeight: 700,
                  padding: "12px 16px",
                  border: "4px solid #1e293b",
                  borderRadius: 14,
                  fontFamily: "inherit",
                  marginTop: 4,
                  marginBottom: 16,
                  boxSizing: "border-box",
                  background: "#fff",
                }}
                autoFocus
              />

              <label style={{ fontSize: 12, fontWeight: 800, color: palette.muted, textTransform: "uppercase", letterSpacing: 1.5 }}>
                Your teacher's name:
              </label>
              <input
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="Ms. Wilson"
                style={{
                  width: "100%",
                  fontSize: 22,
                  fontWeight: 700,
                  padding: "12px 16px",
                  border: "4px solid #1e293b",
                  borderRadius: 14,
                  fontFamily: "inherit",
                  marginTop: 4,
                  marginBottom: 24,
                  boxSizing: "border-box",
                  background: "#fff",
                }}
              />
            </div>

            <button
              className="pop-btn"
              onClick={() => kidName.trim() && setStarted(true)}
              disabled={!kidName.trim()}
              style={bigBtn({
                fontSize: 26,
                width: "100%",
                background: kidName.trim() ? "linear-gradient(90deg, #fbbf24, #db2777)" : "#e2e8f0",
                color: kidName.trim() ? "#fff" : palette.muted,
                opacity: kidName.trim() ? 1 : 0.6,
              })}
            >
              Start Missions!
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- finished + sent ----
  if (phase === "sent") {
    return (
      <div style={{ minHeight: "100vh", background: palette.bg, padding: 24, fontFamily: "'Comic Sans MS', 'Trebuchet MS', system-ui, sans-serif" }}>
        <style>{STYLES}</style>
        <div className="screen-only" style={{ maxWidth: 560, margin: "60px auto", textAlign: "center" }}>
          <div
            style={{
              background: palette.card,
              border: "5px solid #1e293b",
              borderRadius: 28,
              padding: 40,
              boxShadow: "8px 8px 0 #1e293b",
            }}
          >
            <Trophy size={80} color="#f59e0b" />
            <h1 style={{ fontSize: 32, margin: "16px 0 8px" }}>Mission Report ready!</h1>
            <p style={{ color: palette.muted, fontSize: 17, lineHeight: 1.6 }}>
              Your printable PDF report just popped up.
              In the print window, choose <b>"Save as PDF"</b> to save your report,
              or print it to take to school!
            </p>
            <button
              onClick={() => window.print()}
              style={bigBtn({ marginTop: 16, background: "#fbbf24" })}
            >
              <FileText size={20} style={{ verticalAlign: "middle", marginRight: 6 }} />
              Open report again
            </button>
          </div>
        </div>
        <div className="print-only">
          <MissionReport kidName={kidName} teacherName={teacherName} progress={progress} />
        </div>
      </div>
    );
  }

  // ---- submitting animation ----
  if (phase === "submitting") {
    return (
      <div style={{ minHeight: "100vh", background: palette.bg, padding: 24, fontFamily: "'Comic Sans MS', 'Trebuchet MS', system-ui, sans-serif" }}>
        <style>{STYLES}</style>
        <div className="screen-only" style={{ maxWidth: 560, margin: "80px auto" }}>
          <Submitting teacherName={teacherName} onPrint={doPrint} />
        </div>
        <div className="print-only">
          <MissionReport kidName={kidName} teacherName={teacherName} progress={progress} />
        </div>
      </div>
    );
  }

  // ---- inside a mission ----
  if (activeMission) {
    const m = MISSIONS.find((x) => x.key === activeMission);
    const Comp = m.Component;
    return (
      <div style={{ minHeight: "100vh", background: palette.bg, padding: 24, fontFamily: "'Comic Sans MS', 'Trebuchet MS', system-ui, sans-serif" }}>
        <style>{STYLES}</style>
        <div className="screen-only" style={{ maxWidth: 640, margin: "20px auto" }}>
          <button
            onClick={() => setActiveMission(null)}
            style={{
              background: "none",
              border: "none",
              color: palette.ink,
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "inherit",
            }}
          >
            <ChevronLeft size={20} /> Back to mission map
          </button>
          <Comp onDone={finishMission} />
        </div>
      </div>
    );
  }

  // ---- mission map ----
  return (
    <div style={{ minHeight: "100vh", background: palette.bg, padding: 24, fontFamily: "'Comic Sans MS', 'Trebuchet MS', system-ui, sans-serif" }}>
      <style>{STYLES}</style>
      <div className="screen-only" style={{ maxWidth: 760, margin: "0 auto" }}>
        <MissionMap progress={progress} onPick={setActiveMission} kidName={kidName} />

        {allDone && (
          <button
            className="pop-btn"
            onClick={startSubmit}
            style={bigBtn({
              width: "100%",
              fontSize: 28,
              padding: "22px 28px",
              background: "linear-gradient(90deg, #fbbf24, #db2777, #7c3aed)",
              color: "#fff",
              borderColor: "#1e293b",
            })}
          >
            <Phone size={26} style={{ verticalAlign: "middle", marginRight: 10 }} />
            Tell My Teacher I'm Finished!
          </button>
        )}

        {!allDone && (
          <div style={{ textAlign: "center", marginTop: 16, color: palette.muted, fontSize: 14, fontWeight: 600 }}>
            Finish all six missions to unlock the "Tell My Teacher" button.
          </div>
        )}
      </div>
      <div className="print-only">
        <MissionReport kidName={kidName} teacherName={teacherName} progress={progress} />
      </div>
    </div>
  );
}
