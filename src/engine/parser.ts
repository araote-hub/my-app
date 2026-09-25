// Turns an entry-line string into an AST. Syntax follows the TI-92 HOME screen:
// implicit multiplication ("2x", "3(4)"), "⁻" for negation, "ᴇ" for EE,
// "→" to store, "|" for "with" (expr|x=3), and unclosed parentheses are
// closed automatically at the end of the entry. An entry can also be one of
// the commands "Define f(x)=expr" / "Define a=expr" or "DelVar a,b".

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
  | { type: 'store'; expr: Node; name: string }
  /** name(args) where name isn't built in: a user function call, or implicit multiplication (x(2) = x*2). */
  | { type: 'apply'; name: string; args: Node[] }
  | { type: 'define'; name: string; params: string[] | null; body: Node }
  | { type: 'delvar'; names: string[] };

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

/** Built-in functions callable as name(...), by canonical name (see `canonicalName`). */
export const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'sin⁻¹', 'cos⁻¹', 'tan⁻¹',
  'sinh', 'cosh', 'tanh', 'sinh⁻¹', 'cosh⁻¹', 'tanh⁻¹',
  'ln', 'log', '√', 'abs', 'floor', 'ceiling', 'round', 'ipart', 'fpart',
  'mod', 'gcd', 'lcm', 'ncr', 'npr', 'min', 'max', 'sign', 'ans', 'approx',
  '∫', 'Σ', 'Π', 'd', 'nderiv', 'nint', 'fmin', 'fmax', 'solve', 'zeros',
]);

const CONSTANTS = new Set(['π', 'ℯ', '∞']);
const SYMBOL_IDS = new Set([...CONSTANTS, '√', '∫', 'Σ', 'Π']);
const KEYWORDS = new Set(['define', 'delvar', 'and']);

/**
 * Names are case-insensitive, so letter names are lower-cased. Symbol names are
 * kept as-is, because lower-casing would turn Π (product) into π (the constant).
 */
export function canonicalName(name: string) {
  return SYMBOL_IDS.has(name) ? name : name.toLowerCase();
}
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
    } else if (SYMBOL_IDS.has(ch)) {
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
  const isFunction = (tok: Token) => tok.kind === 'id' && FUNCTIONS.has(canonicalName(tok.name));
  const isKeyword = (tok: Token, word: string) => tok.kind === 'id' && tok.name.toLowerCase() === word;

  /** An identifier usable as a variable or user-function name. */
  function nameToken(error = 'Invalid variable name'): string {
    const tok = peek();
    if (tok.kind !== 'id' || CONSTANTS.has(tok.name) || isFunction(tok) || KEYWORDS.has(tok.name.toLowerCase())) {
      throw new CalcError(error, tok.pos);
    }
    t++;
    return canonicalName(tok.name);
  }

  /** Comma-separated arguments after an opening paren that has already been consumed. */
  function args(): Node[] {
    const list: Node[] = [];
    if (!isOp(')') && peek().kind !== 'eof') {
      list.push(comparison());
      while (isOp(',')) {
        t++;
        list.push(comparison());
      }
    }
    closeParen();
    return list;
  }

  /** Closing paren, or nothing at the end of the entry (TI-style auto-close). */
  function closeParen() {
    if (isOp(')')) t++;
    else if (peek().kind !== 'eof') fail();
  }

  function statement(): Node {
    let node: Node;
    if (isKeyword(peek(), 'define')) {
      t++;
      node = define();
    } else if (isKeyword(peek(), 'delvar')) {
      t++;
      const names = [nameToken()];
      while (isOp(',')) {
        t++;
        names.push(nameToken());
      }
      node = { type: 'delvar', names };
    } else {
      node = withExpr();
      if (isOp('→')) {
        t++;
        node = { type: 'store', expr: node, name: nameToken() };
      }
    }
    if (peek().kind !== 'eof') fail();
    return node;
  }

  function define(): Node {
    const name = nameToken();
    let params: string[] | null = null;
    if (isOp('(')) {
      t++;
      params = [];
      if (!isOp(')')) {
        params.push(nameToken('Invalid parameter'));
        while (isOp(',')) {
          t++;
          params.push(nameToken('Invalid parameter'));
        }
      }
      if (!isOp(')')) fail();
      t++;
    }
    if (!isOp('=')) fail();
    t++;
    return { type: 'define', name, params, body: comparison() };
  }

  function withExpr(): Node {
    const expr = comparison();
    if (!isOp('|')) return expr;
    t++;
    const bindings: [string, Node][] = [];
    for (;;) {
      const name = nameToken();
      if (!isOp('=')) fail();
      t++;
      bindings.push([name, sum()]);
      if (isKeyword(peek(), 'and')) t++;
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
      const name = canonicalName(tok.name);
      if (isFunction(tok)) {
        if (!isOp('(')) throw new CalcError('Syntax', tok.pos);
        t++;
        return { type: 'call', name, args: args() };
      }
      if (KEYWORDS.has(name)) throw new CalcError('Syntax', tok.pos);
      if (isOp('(')) {
        t++;
        return { type: 'apply', name, args: args() };
      }
      return { type: 'var', name };
    }
    return fail();
  }

  return statement();
}
