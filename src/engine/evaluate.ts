import { CalcError, type CompareOp, type Node } from './parser';

export interface NumList {
  type: 'list';
  items: number[];
}

/** Result of solve( / fMin( / fMax(: shown as "x=⁻2 or x=2". */
export interface Solutions {
  type: 'solutions';
  name: string;
  roots: number[];
}

/** Result of commands such as Define and DelVar. */
export interface Done {
  type: 'done';
}

export type Value = number | boolean | NumList | Solutions | Done;
export type AngleMode = 'rad' | 'deg';

export interface UserFunction {
  params: string[];
  body: Node;
}

export interface Context {
  angle: AngleMode;
  /** Stored variables (canonical names). `→` and `Define a=…` write here. */
  vars: Map<string, Value>;
  /** Functions created with `Define f(x)=…`. */
  funcs: Map<string, UserFunction>;
  /** The nth most recent answer (1 = last), or undefined if there isn't one. */
  ans(n: number): Value | undefined;
}

const DONE: Done = { type: 'done' };

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
  Σ: [4, 4],
  Π: [4, 4],
  d: [2, 2],
  nderiv: [2, 3],
  nint: [4, 4],
  fmin: [4, 4],
  fmax: [4, 4],
  solve: [2, 2],
  zeros: [2, 2],
};

/** Functions that bind their second argument as a variable, so they evaluate their own arguments. */
const BINDING_FUNCTIONS = new Set(['∫', 'Σ', 'Π', 'd', 'nderiv', 'nint', 'fmin', 'fmax', 'solve', 'zeros']);

const SUM_LIMIT = 1_000_000;
const MAX_CALL_DEPTH = 64;
/** solve( and zeros( look for real roots in this range. */
export const ROOT_SEARCH_RANGE: [number, number] = [-1000, 1000];
const ROOT_SEARCH_STEPS = 20_000;

class Evaluator {
  /** Temporary bindings from "|", user-function parameters and ∫, Σ, solve( etc., innermost last. */
  private locals: Map<string, number>[] = [];
  private depth = 0;

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
        this.ctx.funcs.delete(node.name);
        this.ctx.vars.set(node.name, value);
        return value;
      }
      case 'apply': {
        const fn = this.ctx.funcs.get(node.name);
        if (fn) return this.callUser(fn, node.args);
        // Not a function: x(2) means x*2.
        if (node.args.length !== 1) throw new CalcError('Undefined function');
        return this.binary('*', this.num({ type: 'var', name: node.name }), this.num(node.args[0]));
      }
      case 'define':
        if (node.params) {
          this.ctx.vars.delete(node.name);
          this.ctx.funcs.set(node.name, { params: node.params, body: node.body });
        } else {
          const value = this.eval(node.body);
          this.ctx.funcs.delete(node.name);
          this.ctx.vars.set(node.name, value);
        }
        return DONE;
      case 'delvar':
        for (const name of node.names) {
          this.ctx.vars.delete(name);
          this.ctx.funcs.delete(name);
        }
        return DONE;
    }
  }

  private callUser(fn: UserFunction, argNodes: Node[]): Value {
    if (argNodes.length < fn.params.length) throw new CalcError('Too few arguments');
    if (argNodes.length > fn.params.length) throw new CalcError('Too many arguments');
    if (this.depth >= MAX_CALL_DEPTH) throw new CalcError('Memory');
    const scope = new Map(fn.params.map((p, i) => [p, this.num(argNodes[i])]));
    // The body sees only its parameters and global variables, not the caller's locals.
    const saved = this.locals;
    this.locals = [scope];
    this.depth++;
    try {
      return this.eval(fn.body);
    } finally {
      this.locals = saved;
      this.depth--;
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

    if (BINDING_FUNCTIONS.has(name)) return this.calculus(name, argNodes);
    if (name === 'approx') return this.eval(argNodes[0]); // every result is already approximate
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

  private calculus(name: string, [body, varNode, ...rest]: Node[]): Value {
    if (varNode.type !== 'var') throw new CalcError('Argument');
    const v = varNode.name;

    if (name === 'solve' || name === 'zeros') {
      // solve(left=right, x) finds the roots of left-right; zeros(expr, x) the roots of expr.
      let expr = body;
      if (body.type === 'cmp') {
        if (name === 'zeros' || body.op !== '=') throw new CalcError('Argument');
        expr = { type: 'bin', op: '-', left: body.left, right: body.right };
      }
      const roots = findRoots(this.fn(expr, v), ...ROOT_SEARCH_RANGE);
      if (name === 'zeros') return { type: 'list', items: roots };
      return roots.length ? { type: 'solutions', name: v, roots } : false;
    }

    const f = this.fn(body, v);
    if (name === 'd' || name === 'nderiv') {
      // Numeric derivative at the variable's current value, e.g. d(x^2,x)|x=3 → 6.
      // Symbolic differentiation needs a CAS, which this calculator doesn't have.
      const at = this.lookup(v);
      if (typeof at !== 'number') throw new CalcError('Data type');
      if (name === 'nderiv') {
        const h = rest.length ? this.num(rest[0]) : 0.001;
        if (h <= 0) throw new CalcError('Domain');
        return (f(at + h) - f(at - h)) / (2 * h);
      }
      const h = 1e-3 * Math.max(1, Math.abs(at));
      return (-f(at + 2 * h) + 8 * f(at + h) - 8 * f(at - h) + f(at - 2 * h)) / (12 * h);
    }

    const [lo, hi] = rest.map((n) => this.num(n));
    if (name === 'Σ' || name === 'Π') {
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) throw new CalcError('Domain');
      if (hi - lo > SUM_LIMIT) throw new CalcError('Overflow');
      let total = name === 'Σ' ? 0 : 1;
      for (let k = lo; k <= hi; k++) total = name === 'Σ' ? total + f(k) : total * f(k);
      return total;
    }

    if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new CalcError('Domain');
    if (name === 'fmin' || name === 'fmax') {
      if (lo >= hi) throw new CalcError('Domain');
      const g = name === 'fmin' ? f : (x: number) => -f(x);
      return { type: 'solutions', name: v, roots: [minimize(g, lo, hi)] };
    }
    return integrate(f, lo, hi); // ∫ and nInt
  }

  /** The expression as a function of one variable. */
  private fn(body: Node, v: string) {
    return (x: number) => this.withScope(new Map([[v, x]]), () => this.num(body));
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

/** f(x), or NaN where f isn't defined (for example √ of a negative number). */
function tryEval(f: (x: number) => number, x: number) {
  try {
    return f(x);
  } catch (e) {
    if (e instanceof CalcError) return NaN;
    throw e;
  }
}

/**
 * Real roots in [lo, hi]: scans for sign changes and bisects each one. Also
 * catches roots the scan lands on (such as double roots, where the sign doesn't
 * change). Discontinuities (tan at 90°) are rejected because |f| stays large.
 */
function findRoots(f: (x: number) => number, lo: number, hi: number): number[] {
  const roots: number[] = [];
  const add = (r: number) => {
    if (Math.abs(r) < 1e-12) r = 0;
    const last = roots.at(-1);
    if (last === undefined || Math.abs(r - last) > 1e-9 * Math.max(1, Math.abs(r))) roots.push(r);
  };

  let x0 = lo;
  let f0 = tryEval(f, x0);
  for (let i = 1; i <= ROOT_SEARCH_STEPS; i++) {
    const x1 = lo + ((hi - lo) * i) / ROOT_SEARCH_STEPS;
    const f1 = tryEval(f, x1);
    if (Math.abs(f0) <= 1e-12) {
      add(x0);
    } else if (Number.isFinite(f0) && Number.isFinite(f1) && Math.abs(f1) > 1e-12 && Math.sign(f0) !== Math.sign(f1)) {
      let a = x0;
      let b = x1;
      let fa = f0;
      for (let k = 0; k < 200 && b - a > 1e-15 * Math.max(1, Math.abs(a)); k++) {
        const m = (a + b) / 2;
        const fm = tryEval(f, m);
        if (Math.sign(fm) === Math.sign(fa)) {
          a = m;
          fa = fm;
        } else {
          b = m;
        }
      }
      const r = (a + b) / 2;
      if (Math.abs(tryEval(f, r)) < 1e-6 * Math.max(1, Math.abs(f0), Math.abs(f1))) add(r);
    }
    x0 = x1;
    f0 = f1;
  }
  if (Math.abs(f0) <= 1e-12) add(x0);
  return roots;
}

/** x in [lo, hi] where f is smallest: a coarse scan, then golden-section search around the best sample. */
function minimize(f: (x: number) => number, lo: number, hi: number): number {
  const steps = 1000;
  const step = (hi - lo) / steps;
  let best = lo;
  let bestF = Infinity;
  for (let i = 0; i <= steps; i++) {
    const x = lo + step * i;
    const fx = tryEval(f, x);
    if (fx < bestF) {
      best = x;
      bestF = fx;
    }
  }
  let a = Math.max(lo, best - step);
  let b = Math.min(hi, best + step);
  const ratio = (Math.sqrt(5) - 1) / 2;
  for (let k = 0; k < 100; k++) {
    const c = b - ratio * (b - a);
    const d = a + ratio * (b - a);
    if (tryEval(f, c) < tryEval(f, d)) b = d;
    else a = c;
  }
  const x = (a + b) / 2;
  // A minimum's position is only accurate to about the square root of machine precision.
  if (Math.abs(x) < 1e-7 * (hi - lo)) return 0;
  return Number(x.toPrecision(8));
}
