// Turns an entry-line string into an AST. Syntax follows the TI-92 HOME screen:
// implicit multiplication ("2x", "3(4)"), "⁻" for negation, "ᴇ" for EE,
// "→" to store, "|" for "with" (expr|x=3), and unclosed parentheses are
// closed automatically at the end of the entry.

export type CompareOp = '=' | '≠' | '<' | '>' | '≤' | '≥';
export type BinaryOp = '+' | '-' | '*' | '/' | '^';

export type Node =
  | { type: 'num'; value: number }
  | { type: 'const'; name: 'π' | 'ℯ' | '∞' }
  | { type: 'var'; name: string }
  | { type: 'neg'; arg: Node }
  | { type: 'bin'; op: BinaryOp; left: Node; right: Node }
  | { type: 'cmp'; op: CompareOp; left: Node; right: Node }
  | { type: 'call'; name: string; args: Node[] }
  | { type: 'with'; expr: Node; bindings: [name: string, value: Node][] }
  | { type: 'store'; expr: Node; name: string };

/** An error shown in the LCD's error dialog. `kind` is the TI-style message. */
export class CalcError extends Error {
  constructor(
    public kind: string,
    /** Character offset in the entry text, when known. */
    public pos?: number,
  ) {
    super(kind);
  }
}

/** Functions callable as name(...). Names are matched case-insensitively. */
export const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'sin⁻¹', 'cos⁻¹', 'tan⁻¹',
  'sinh', 'cosh', 'tanh', 'sinh⁻¹', 'cosh⁻¹', 'tanh⁻¹',
  'ln', 'log', '√', 'abs', 'floor', 'ceiling', 'round', 'ipart', 'fpart',
  'mod', 'gcd', 'lcm', 'ncr', 'npr', 'min', 'max', 'sign',
  'ans', '∫', 'σ', 'd', // 'σ' is how 'Σ' comes out of toLowerCase()
]);

const CONSTANTS = new Set(['π', 'ℯ', '∞']);
const COMPARE_OPS = new Set<string>(['=', '≠', '<', '>', '≤', '≥']);
const SINGLE_OPS = new Set([...'+-*/^⁻(),→|=≠<>≤≥']);

type Token =
  | { kind: 'num'; value: number; pos: number }
  | { kind: 'id'; name: string; pos: number }
  | { kind: 'op'; op: string; pos: number }
  | { kind: 'eof'; pos: number };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const pos = i;
    if (ch === ' ') {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      const m = /^\d*\.?\d*/.exec(text.slice(i))![0];
      if (!/\d/.test(m)) throw new CalcError('Syntax', pos);
      i += m.length;
      let exponent = 0;
      if (text[i] === 'ᴇ') {
        const e = /^[⁻-]?\d+/.exec(text.slice(i + 1));
        if (!e) throw new CalcError('Syntax', i);
        exponent = Number(e[0].replace('⁻', '-'));
        i += 1 + e[0].length;
      }
      tokens.push({ kind: 'num', value: Number(m) * 10 ** exponent, pos });
    } else if (/[a-zA-Zθ]/.test(ch)) {
      let name = /^[a-zA-Zθ0-9]+/.exec(text.slice(i))![0];
      i += name.length;
      if (text.startsWith('⁻¹', i)) {
        name += '⁻¹';
        i += 2;
      }
      tokens.push({ kind: 'id', name, pos });
    } else if (CONSTANTS.has(ch) || ch === '√' || ch === '∫' || ch === 'Σ') {
      tokens.push({ kind: 'id', name: ch, pos });
      i++;
    } else if (ch === 'ⅈ') {
      throw new CalcError('Complex numbers not supported', pos);
    } else if (SINGLE_OPS.has(ch)) {
      tokens.push({ kind: 'op', op: ch, pos });
      i++;
    } else {
      throw new CalcError('Syntax', pos);
    }
  }
  tokens.push({ kind: 'eof', pos: text.length });
  return tokens;
}

export function parse(text: string): Node {
  const tokens = tokenize(text);
  let t = 0;

  const peek = () => tokens[t];
  const isOp = (op: string) => {
    const tok = tokens[t];
    return tok.kind === 'op' && tok.op === op;
  };
  function fail(): never {
    throw new CalcError('Syntax', peek().pos);
  }
  const isFunction = (tok: Token) => tok.kind === 'id' && FUNCTIONS.has(tok.name.toLowerCase());

  /** Closing paren, or nothing at the end of the entry (TI-style auto-close). */
  function closeParen() {
    if (isOp(')')) t++;
    else if (peek().kind !== 'eof') fail();
  }

  function statement(): Node {
    let node = withExpr();
    if (isOp('→')) {
      t++;
      const target = peek();
      if (target.kind !== 'id' || CONSTANTS.has(target.name) || isFunction(target)) {
        throw new CalcError('Invalid variable name', target.pos);
      }
      t++;
      node = { type: 'store', expr: node, name: target.name.toLowerCase() };
    }
    if (peek().kind !== 'eof') fail();
    return node;
  }

  function withExpr(): Node {
    const expr = comparison();
    if (!isOp('|')) return expr;
    t++;
    const bindings: [string, Node][] = [];
    for (;;) {
      const name = peek();
      if (name.kind !== 'id' || CONSTANTS.has(name.name) || isFunction(name)) fail();
      t++;
      if (!isOp('=')) fail();
      t++;
      bindings.push([name.name.toLowerCase(), sum()]);
      const next = peek();
      if (next.kind === 'id' && next.name.toLowerCase() === 'and') t++;
      else break;
    }
    return { type: 'with', expr, bindings };
  }

  function comparison(): Node {
    const left = sum();
    const tok = peek();
    if (tok.kind === 'op' && COMPARE_OPS.has(tok.op)) {
      t++;
      return { type: 'cmp', op: tok.op as CompareOp, left, right: sum() };
    }
    return left;
  }

  function sum(): Node {
    let left = product();
    for (let tok = peek(); tok.kind === 'op' && (tok.op === '+' || tok.op === '-'); tok = peek()) {
      t++;
      left = { type: 'bin', op: tok.op, left, right: product() };
    }
    return left;
  }

  function product(): Node {
    let left = unary();
    for (;;) {
      const tok = peek();
      if (tok.kind === 'op' && (tok.op === '*' || tok.op === '/')) {
        t++;
        left = { type: 'bin', op: tok.op, left, right: unary() };
      } else if (tok.kind === 'num' || tok.kind === 'id' || isOp('(')) {
        // Implicit multiplication binds like "*": 1/2x means (1/2)*x, as on the TI-92.
        left = { type: 'bin', op: '*', left, right: power() };
      } else {
        return left;
      }
    }
  }

  function unary(): Node {
    if (isOp('-') || isOp('⁻')) {
      t++;
      return { type: 'neg', arg: unary() };
    }
    return power();
  }

  function power(): Node {
    const base = primary();
    if (!isOp('^')) return base;
    t++;
    return { type: 'bin', op: '^', left: base, right: unary() };
  }

  function primary(): Node {
    const tok = peek();
    if (tok.kind === 'num') {
      t++;
      return { type: 'num', value: tok.value };
    }
    if (isOp('(')) {
      t++;
      const inner = comparison();
      closeParen();
      return inner;
    }
    if (tok.kind === 'id') {
      t++;
      if (CONSTANTS.has(tok.name)) return { type: 'const', name: tok.name as 'π' | 'ℯ' | '∞' };
      if (isFunction(tok)) {
        if (!isOp('(')) throw new CalcError('Syntax', tok.pos);
        t++;
        const args: Node[] = [];
        if (!isOp(')') && peek().kind !== 'eof') {
          args.push(comparison());
          while (isOp(',')) {
            t++;
            args.push(comparison());
          }
        }
        closeParen();
        return { type: 'call', name: tok.name.toLowerCase(), args };
      }
      return { type: 'var', name: tok.name.toLowerCase() };
    }
    return fail();
  }

  return statement();
}
