// A tiny, safe maths expression evaluator for live sliders (no eval):
// numbers, variables, + - * / ^ (power), unary minus, parentheses, pi, e and common functions.
const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, log: Math.log, ln: Math.log,
  log10: Math.log10, log2: Math.log2, sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil,
  round: Math.round, sign: Math.sign, min: Math.min, max: Math.max, pow: Math.pow,
};
const CONSTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };

function tokenize(src) {
  const tokens = [];
  const re = /\s*(?:(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(\*\*|[-+*/^(),]))/gy;
  let m;
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    m = re.exec(src);
    if (!m) {
      if (/^\s*$/.test(src.slice(pos))) break;
      throw new Error(`Unexpected "${src.slice(pos).trim()[0]}" in "${src}"`);
    }
    pos = re.lastIndex;
    if (m[1] != null) tokens.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] != null) tokens.push({ t: 'id', v: m[2] });
    else tokens.push({ t: 'op', v: m[3] === '**' ? '^' : m[3] });
  }
  return tokens;
}

/** Compiles an expression to a function of a variables object. Throws on syntax errors. */
export function compile(src) {
  const tokens = tokenize(String(src));
  let i = 0;
  const peek = () => tokens[i];
  const take = (v) => {
    const tok = tokens[i];
    if (v && (!tok || tok.v !== v)) throw new Error(`Expected "${v}" in "${src}"`);
    i++;
    return tok;
  };
  // expr := term (('+'|'-') term)* ; term := unary (('*'|'/') unary | implicit)* ; unary := '-' unary | power ; power := atom ('^' unary)?
  const expr = () => {
    let left = term();
    while (peek()?.t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = take().v;
      const right = term();
      const l = left;
      left = op === '+' ? (s) => l(s) + right(s) : (s) => l(s) - right(s);
    }
    return left;
  };
  const term = () => {
    let left = unary();
    for (;;) {
      const tok = peek();
      if (tok?.t === 'op' && (tok.v === '*' || tok.v === '/')) {
        take();
        const right = unary();
        const l = left;
        left = tok.v === '*' ? (s) => l(s) * right(s) : (s) => l(s) / right(s);
      } else if (tok && (tok.t === 'num' || tok.t === 'id' || tok.v === '(')) {
        // Implicit multiplication: 2x, 2(x+1), a b
        const right = unary();
        const l = left;
        left = (s) => l(s) * right(s);
      } else return left;
    }
  };
  const unary = () => {
    if (peek()?.v === '-') { take(); const u = unary(); return (s) => -u(s); }
    if (peek()?.v === '+') { take(); return unary(); }
    return power();
  };
  const power = () => {
    const base = atom();
    if (peek()?.v === '^') { take(); const ex = unary(); return (s) => base(s) ** ex(s); }
    return base;
  };
  const atom = () => {
    const tok = take();
    if (!tok) throw new Error(`Unexpected end of "${src}"`);
    if (tok.t === 'num') return () => tok.v;
    if (tok.v === '(') { const e = expr(); take(')'); return e; }
    if (tok.t === 'id') {
      if (peek()?.v === '(' && FUNCS[tok.v]) {
        take('(');
        const args = [expr()];
        while (peek()?.v === ',') { take(); args.push(expr()); }
        take(')');
        const f = FUNCS[tok.v];
        return (s) => f(...args.map((a) => a(s)));
      }
      const name = tok.v;
      return (s) => {
        if (s && Object.hasOwn(s, name)) return s[name];
        if (Object.hasOwn(CONSTS, name)) return CONSTS[name];
        throw new Error(`Unknown variable "${name}"`);
      };
    }
    throw new Error(`Unexpected "${tok.v}" in "${src}"`);
  };
  const fn = expr();
  if (i < tokens.length) throw new Error(`Unexpected "${tokens[i].v}" in "${src}"`);
  return fn;
}

/** Variable names an expression uses (to check them against the declared sliders). */
export function variablesOf(src) {
  return [...new Set(tokenize(String(src)).filter((t, i, all) => t.t === 'id' && all[i + 1]?.v !== '(' && !Object.hasOwn(CONSTS, t.v)).map((t) => t.v))];
}

/** A short display form of a number: up to `digits` decimals, no trailing zeros, a real minus sign. */
export function formatNumber(v, digits = 2) {
  if (!Number.isFinite(v)) return '–';
  const s = (Math.round(v * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.?0+$/, '');
  return (s === '-0' ? '0' : s).replace(/^-/, '−');
}
