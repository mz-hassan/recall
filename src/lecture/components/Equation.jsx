import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export function Equation({ expression, explanation }) {
  const element = useRef(null);
  useEffect(() => {
    try {
      katex.render(expression, element.current, {
        displayMode: true, throwOnError: true, trust: false, strict: 'error',
        maxExpand: 100, maxSize: 10, macros: {}, output: 'htmlAndMathml',
      });
    } catch { element.current.textContent = expression; }
  }, [expression]);
  return <div className="intuition lecture-equation"><small>EQUATION</small>
    <div ref={element} aria-label={expression}/><p>{explanation}</p>
  </div>;
}
