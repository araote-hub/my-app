import { CalcError, type CompareOp, type Node } from './parser';

export type Value = number | boolean;
export type AngleMode = 'rad' | 'deg';

export interface Context {
  angle: AngleMode;
  /** Stored variables (lower-case names). `→` writes here. */
  vars: Map<string, Value>;
  /** The nth most recent answer (1 = last), or undefined if there isn't one. */
  ans(n: number): Value | undefined;
}

/** Real-mode evaluation: anything that would need a complex result is an error, as on the TI-92. */
export function evaluate(node: Node, ctx: Context): Value {
  return new Evaluator(ctx).eval(node);
}

const ARITY: Record<string, [min: number, max: number]> = {
  round: [1, 2],
  mod: [2, 2],
  gcd: [2, 2],
  lcm: [2, 2],
  ncr: [2, 2],
  npr: [2, 2],
  min: [1, Infinity],
  max: [1, Infinity],
  ans: [0, 1],
  '∫': [4, 4],
  σ: [4, 4],
  d: [2, 2],
};

const SUM_LIMIT = 1_000_000;

class Evaluator {
  /** Temporary bindings from "|", ∫, Σ and d, innermost last. */
  private locals: Map<string, number>[] = [];

  constructor(private ctx: Context) {}

  eval(node: Node): Value {
    switch (node.type) {
      case 'num':
        return node.value;
      case 'const':
        return node.name === 'π' ? Math.PI : node.name === 'ℯ' ? Math.E : Infinity;
      case 'var':
        return this.lookup(node.name);
      case 'neg':
        return -this.num(node.arg);
      case 'bin':
        return this.binary(node.op, this.num(node.left), this.num(node.right));
      case 'cmp':
        return compare(node.op, this.num(node.left), this.num(node.right));
      case 'call':
        return this.call(node.name, node.args);
      case 'with': {
        const scope = new Map(node.bindings.map(([name, value]) => [name, this.num(value)]));
        return this.withScope(scope, () => this.eval(node.expr));
      }
      case 'store': {
        const value = this.eval(node.expr);
        this.ctx.vars.set(node.name, value);
        return value;
      }
    }
  }

  private num(node: Node): number {
    const v = this.eval(node);
    if (typeof v !== 'number') throw new CalcError('Data type');
    return v;
  }

  private lookup(name: string): Value {
    for (let i = this.locals.length - 1; i >= 0; i--) {
      const v = this.locals[i].get(name);
      if (v !== undefined) return v;
    }
    const v = this.ctx.vars.get(name);
    if (v === undefined) throw new CalcError('Undefined variable');
    return v;
  }

  private withScope<T>(scope: Map<string, number>, fn: () => T): T {
    this.locals.push(scope);
    try {
      return fn();
    } finally {
      this.locals.pop();
    }
  }

  private binary(op: string, a: number, b: number): number {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? NaN : a / b;
      default: return power(a, b);
    }
  }

  private toRadians(x: number) {
    return this.ctx.angle === 'deg' ? (x * Math.PI) / 180 : x;
  }

  private fromRadians(x: number) {
    return this.ctx.angle === 'deg' ? (x * 180) / Math.PI : x;
  }

  private call(name: string, argNodes: Node[]): Value {
    const [min, max] = ARITY[name] ?? [1, 1];
    if (argNodes.length < min) throw new CalcError('Too few arguments');
    if (argNodes.length > max) throw new CalcError('Too many arguments');

    // Calculus functions bind their own variable, so they evaluate their arguments themselves.
    if (name === '∫' || name === 'σ' || name === 'd') return this.calculus(name, argNodes);
    if (name === 'ans') {
      const n = argNodes.length ? this.num(argNodes[0]) : 1;
      if (!Number.isInteger(n) || n < 1) throw new CalcError('Domain');
      return this.ctx.ans(n) ?? 0;
    }

    const args = argNodes.map((a) => this.num(a));
    const x = args[0];
    switch (name) {
      case 'sin': return trig(Math.sin, this.toRadians(x));
      case 'cos': return trig(Math.cos, this.toRadians(x));
      case 'tan':
        if (this.ctx.angle === 'deg' && ((x % 180) + 180) % 180 === 90) return NaN;
        return trig(Math.tan, this.toRadians(x));
      case 'sin⁻¹': return this.fromRadians(Math.asin(requireReal(x, Math.abs(x) <= 1)));
      case 'cos⁻¹': return this.fromRadians(Math.acos(requireReal(x, Math.abs(x) <= 1)));
      case 'tan⁻¹': return this.fromRadians(Math.atan(x));
      case 'sinh': return Math.sinh(x);
      case 'cosh': return Math.cosh(x);
      case 'tanh': return Math.tanh(x);
      case 'sinh⁻¹': return Math.asinh(x);
      case 'cosh⁻¹': return Math.acosh(requireReal(x, x >= 1));
      case 'tanh⁻¹': return Math.atanh(requireReal(x, Math.abs(x) <= 1));
      case 'ln': return Math.log(requireReal(x, x >= 0));
      case 'log': return Math.log10(requireReal(x, x >= 0));
      case '√': return Math.sqrt(requireReal(x, x >= 0));
      case 'abs': return Math.abs(x);
      case 'sign': return Math.sign(x);
      case 'floor': return Math.floor(x);
      case 'ceiling': return Math.ceil(x);
      case 'ipart': return Math.trunc(x);
      case 'fpart': return x - Math.trunc(x);
      case 'round': {
        const digits = args[1] ?? 12;
        if (!Number.isInteger(digits) || digits < 0 || digits > 12) throw new CalcError('Domain');
        return Number(x.toFixed(digits));
      }
      case 'mod': return args[1] === 0 ? x : x - args[1] * Math.floor(x / args[1]);
      case 'gcd': {
        const [a, b] = integers(args);
        return gcd(a, b);
      }
      case 'lcm': {
        const [a, b] = integers(args);
        return a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b);
      }
      case 'ncr':
      case 'npr': {
        const [n, r] = integers(args);
        if (n < 0 || r < 0) throw new CalcError('Domain');
        if (r > n) return 0;
        let result = 1;
        for (let i = 0; i < r; i++) result *= n - i;
        if (name === 'ncr') for (let i = 2; i <= r; i++) result /= i;
        return Math.round(result);
      }
      case 'min': return Math.min(...args);
      case 'max': return Math.max(...args);
    }
    throw new CalcError('Syntax');
  }

  private calculus(name: string, [body, varNode, ...rest]: Node[]): number {
    if (varNode.type !== 'var') throw new CalcError('Argument');
    const v = varNode.name;
    const f = (x: number) => this.withScope(new Map([[v, x]]), () => this.num(body));

    if (name === 'd') {
      // Numeric derivative at the variable's current value, e.g. d(x^2,x)|x=3 → 6.
      // Symbolic differentiation needs a CAS, which this calculator doesn't have.
      const at = this.lookup(v);
      if (typeof at !== 'number') throw new CalcError('Data type');
      const h = 1e-3 * Math.max(1, Math.abs(at));
      return (-f(at + 2 * h) + 8 * f(at + h) - 8 * f(at - h) + f(at - 2 * h)) / (12 * h);
    }

    const [lo, hi] = rest.map((n) => this.num(n));
    if (name === 'σ') {
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new CalcError('Domain');
      if (hi - lo > SUM_LIMIT) throw new CalcError('Overflow');
      let total = 0;
      for (let k = lo; k <= hi; k++) total += f(k);
      return total;
    }

    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new CalcError('Domain');
    return integrate(f, lo, hi);
  }
}

function compare(op: CompareOp, a: number, b: number): boolean {
  switch (op) {
    case '=': return a === b;
    case '≠': return a !== b;
    case '<': return a < b;
    case '>': return a > b;
    case '≤': return a <= b;
    case '≥': return a >= b;
  }
}

function power(a: number, b: number): number {
  if (a < 0 && !Number.isInteger(b)) {
    // Real odd roots of negatives, e.g. (⁻8)^(1/3) = ⁻2.
    const inv = 1 / b;
    const n = Math.round(inv);
    if (Math.abs(inv - n) < 1e-9 && n % 2 !== 0) return -Math.pow(-a, b);
    throw new CalcError('Non-real result');
  }
  if (a === 0 && b < 0) return NaN;
  return Math.pow(a, b);
}

/** Trig results within rounding noise of zero are zero, so sin(π) shows 0. */
function trig(fn: (x: number) => number, x: number) {
  const v = fn(x);
  return Math.abs(v) < 1e-15 ? 0 : v;
}

function requireReal(x: number, ok: boolean) {
  if (!ok) throw new CalcError('Non-real result');
  return x;
}

function integers(args: number[]) {
  if (!args.every(Number.isInteger)) throw new CalcError('Domain');
  return args;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Adaptive Simpson's rule. */
function integrate(f: (x: number) => number, a: number, b: number): number {
  const simpson = (a: number, b: number, fa: number, fm: number, fb: number) => ((b - a) / 6) * (fa + 4 * fm + fb);
  const recurse = (a: number, b: number, fa: number, fm: number, fb: number, whole: number, eps: number, depth: number): number => {
    const m = (a + b) / 2;
    const lm = (a + m) / 2;
    const rm = (m + b) / 2;
    const flm = f(lm);
    const frm = f(rm);
    const left = simpson(a, m, fa, flm, fm);
    const right = simpson(m, b, fm, frm, fb);
    if (depth <= 0 || Math.abs(left + right - whole) <= 15 * eps) return left + right + (left + right - whole) / 15;
    return recurse(a, m, fa, flm, fm, left, eps / 2, depth - 1) + recurse(m, b, fm, frm, fb, right, eps / 2, depth - 1);
  };
  const fa = f(a);
  const fb = f(b);
  const fm = f((a + b) / 2);
  return recurse(a, b, fa, fm, fb, simpson(a, b, fa, fm, fb), 1e-12, 40);
}
