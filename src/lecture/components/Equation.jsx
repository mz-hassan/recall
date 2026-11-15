import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export function Equation({ expression, explanation, variables = [] }) {
  const element = useRef(null);
  useEffect(() => {
    try {
      katex.render(expression, element.current, {
        displayMode: true, throwOnError: true, trust: false, strict: 'error',
        maxExpand: 100, maxSize: 10, macros: {}, output: 'htmlAndMathml',
      });
      for (const token of element.current.querySelectorAll('.katex-html .mord')) {
        const variable = variables.find(item => item.symbol === token.textContent);
        if (variable) { token.title = variable.definition; token.tabIndex = 0; token.setAttribute('aria-label', variable.symbol + ': ' + variable.definition); }
      }
    } catch { element.current.textContent = expression; }
  }, [expression, variables]);
  return <div className="intuition lecture-equation"><small>EQUATION</small>
    <div ref={element} aria-label={expression}/><p>{explanation}</p>
    {!!variables.length && <div className="equation-variables" aria-label="Variable definitions">{variables.map(variable => <span key={variable.symbol} tabIndex={0} title={variable.definition}>{variable.symbol}<span role="tooltip">{variable.definition}</span></span>)}</div>}
  </div>;
}
