import React, { useState } from 'react';
import { Calculator, RotateCcw } from 'lucide-react';

export default function CalculatorApp() {
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState(null);
  const [operation, setOperation] = useState(null);
  const [resetNext, setResetNext] = useState(false);

  const handleNumber = (num) => {
    if (resetNext) {
      setDisplay(String(num));
      setResetNext(false);
    } else {
      setDisplay(display === '0' ? String(num) : display + num);
    }
  };

  const handleOperation = (op) => {
    setPreviousValue(parseFloat(display));
    setOperation(op);
    setResetNext(true);
  };

  const calculate = () => {
    if (previousValue === null || !operation) return;
    const current = parseFloat(display);
    let result;
    switch (operation) {
      case '+': result = previousValue + current; break;
      case '-': result = previousValue - current; break;
      case '*': result = previousValue * current; break;
      case '/': result = current !== 0 ? previousValue / current : 'Error'; break;
    }
    setDisplay(String(result));
    setPreviousValue(null);
    setOperation(null);
    setResetNext(true);
  };

  const clear = () => {
    setDisplay('0');
    setPreviousValue(null);
    setOperation(null);
    setResetNext(false);
  };

  const Button = ({ children, onClick, className = '' }) => (
    <button
      onClick={onClick}
      className={`p-4 text-lg font-medium rounded-xl transition-all duration-150 active:scale-95 hover:brightness-110 ${className}`}
    >
      {children}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-xs">
        <div className="flex items-center gap-2 mb-4 text-slate-400">
          <Calculator size={20} />
          <span className="text-sm font-medium">Stele Calculator</span>
        </div>
        <div className="bg-slate-800 rounded-2xl p-4 shadow-2xl border border-slate-700">
          <div className="bg-slate-900 rounded-xl p-4 mb-4">
            <div className="text-right text-3xl font-light text-white tracking-wide overflow-hidden">
              {display}
            </div>
            {operation && (
              <div className="text-right text-sm text-slate-500 mt-1">
                {previousValue} {operation}
              </div>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Button onClick={clear} className="bg-red-500/20 text-red-400 col-span-2">
              <span className="flex items-center justify-center gap-1">
                <RotateCcw size={16} /> Clear
              </span>
            </Button>
            <Button onClick={() => handleOperation('/')} className="bg-amber-500/20 text-amber-400">/</Button>
            <Button onClick={() => handleOperation('*')} className="bg-amber-500/20 text-amber-400">*</Button>

            {[7, 8, 9].map(n => (
              <Button key={n} onClick={() => handleNumber(n)} className="bg-slate-700 text-white">{n}</Button>
            ))}
            <Button onClick={() => handleOperation('-')} className="bg-amber-500/20 text-amber-400">-</Button>

            {[4, 5, 6].map(n => (
              <Button key={n} onClick={() => handleNumber(n)} className="bg-slate-700 text-white">{n}</Button>
            ))}
            <Button onClick={() => handleOperation('+')} className="bg-amber-500/20 text-amber-400">+</Button>

            {[1, 2, 3].map(n => (
              <Button key={n} onClick={() => handleNumber(n)} className="bg-slate-700 text-white">{n}</Button>
            ))}
            <Button onClick={calculate} className="bg-blue-500 text-white row-span-2">=</Button>

            <Button onClick={() => handleNumber(0)} className="bg-slate-700 text-white col-span-2">0</Button>
            <Button onClick={() => {
              if (!display.includes('.')) setDisplay(display + '.');
            }} className="bg-slate-700 text-white">.</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
