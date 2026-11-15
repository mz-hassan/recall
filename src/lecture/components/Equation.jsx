import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const noVariables = [];

function Math({ expression, display = false, variables = noVariables }) {
  const element = useRef(null);
  useEffect(() => {
    try {
      katex.render(expression, element.current, {
        displayMode: display, throwOnError: true, trust: false, strict: 'error',
        maxExpand: 100, maxSize: 10, macros: {}, output: 'htmlAndMathml',
      });
      if (variables.length) {
        for (const token of element.current.querySelectorAll('.katex-html .mord')) {
          const variable = variables.find(item => item.symbol === token.textContent);
          if (!variable) continue;
          token.title = variable.definition;
          token.tabIndex = 0;
          token.setAttribute('aria-label', variable.symbol + ': ' + variable.definition);
        }
      }
    } catch {
      element.current.textContent = expression;
    }
  }, [expression, display, variables]);

  return display ? <div ref={element} aria-label={variables.length ? expression : undefined}/> : <span ref={element}/>;
}

export function Equation({ expression, explanation, terms, variables = noVariables }) {
  return <div className="intuition lecture-equation">
    {!terms && <small>EQUATION</small>}
    <Math expression={expression} display variables={variables}/>
    <p>{explanation}</p>
    {!!variables.length && <div className="equation-variables" aria-label="Variable definitions">
      {variables.map(variable => <span key={variable.symbol} tabIndex={0} title={variable.definition}>
        {variable.symbol}<span role="tooltip">{variable.definition}</span>
      </span>)}
    </div>}
    {terms && <dl className="equation-terms">
      {terms.map(([symbol, meaning]) => <div key={symbol}>
        <dt><Math expression={symbol}/></dt>
        <dd>{meaning}</dd>
      </div>)}
    </dl>}
  </div>;
}
