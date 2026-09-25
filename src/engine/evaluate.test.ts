import { describe, expect, it } from 'vitest';
import { evaluate, type AngleMode, type UserFunction, type Value } from './evaluate';
import { formatValue } from './format';
import { CalcError, parse } from './parser';

function calc(
  text: string,
  opts: { angle?: AngleMode; vars?: Map<string, Value>; funcs?: Map<string, UserFunction>; ans?: Value[] } = {},
) {
  const ans = opts.ans ?? [];
  return formatValue(
    evaluate(parse(text), {
      angle: opts.angle ?? 'rad',
      vars: opts.vars ?? new Map(),
      funcs: opts.funcs ?? new Map(),
      ans: (n) => ans.at(-n),
    }),
  );
}

function calcError(text: string, opts?: Parameters<typeof calc>[1]) {
  try {
    calc(text, opts);
  } catch (e) {
    if (e instanceof CalcError) return e.kind;
    throw e;
  }
  throw new Error(`expected "${text}" to fail`);
}

describe('arithmetic and precedence', () => {
  it.each([
    ['1+2*3', '7'],
    ['(1+2)*3', '9'],
    ['2^3^2', '512'],
    ['-2^2', '⁻4'],
    ['⁻2^2', '⁻4'],
    ['(⁻2)^2', '4'],
    ['2^⁻1', '0.5'],
    ['10/4', '2.5'],
    ['0.1+0.2', '0.3'],
    ['1/3', '0.333333333333'],
    ['2(3+4)', '14'],
    ['(1+1)(2+2)', '8'],
    ['2π', '6.28318530718'],
    ['1/2π', '1.57079632679'],
    ['(8', '8'],
    ['√(16', '4'],
    ['1.5ᴇ3', '1500'],
    ['2ᴇ⁻3*1000', '2'],
  ])('%s = %s', (text, expected) => {
    expect(calc(text)).toBe(expected);
  });
});

describe('formatting', () => {
  it.each([
    ['1ᴇ15', '1ᴇ15'],
    ['12345678901234', '1.23456789012ᴇ13'],
    ['0.00001', '1ᴇ⁻5'],
    ['⁻0.00002', '⁻2ᴇ⁻5'],
    ['1/0', 'undef'],
    ['∞', '∞'],
    ['-∞', '⁻∞'],
    ['3=3', 'true'],
    ['2>3', 'false'],
  ])('%s shows %s', (text, expected) => {
    expect(calc(text)).toBe(expected);
  });
});

describe('functions', () => {
  it('uses radians or degrees for trig', () => {
    expect(calc('sin(π/2)')).toBe('1');
    expect(calc('sin(π)')).toBe('0');
    expect(calc('sin(30)', { angle: 'deg' })).toBe('0.5');
    expect(calc('cos(90)', { angle: 'deg' })).toBe('0');
    expect(calc('tan(90)', { angle: 'deg' })).toBe('undef');
    expect(calc('sin⁻¹(1)', { angle: 'deg' })).toBe('90');
    expect(calc('tan⁻¹(1)')).toBe('0.785398163397');
  });

  it.each([
    ['ln(ℯ^(2))', '2'],
    ['log(1000)', '3'],
    ['abs(⁻3)', '3'],
    ['round(2.345,2)', '2.35'],
    ['mod(7,3)', '1'],
    ['mod(⁻7,3)', '2'],
    ['gcd(12,18)', '6'],
    ['lcm(4,6)', '12'],
    ['nCr(5,2)', '10'],
    ['nPr(5,2)', '20'],
    ['max(1,5,3)', '5'],
    ['iPart(⁻2.7)', '⁻2'],
    ['fPart(2.75)', '0.75'],
    ['(⁻8)^(1/3)', '⁻2'],
  ])('%s = %s', (text, expected) => {
    expect(calc(text)).toBe(expected);
  });

  it('integrates, sums and differentiates numerically', () => {
    expect(calc('∫(x^2,x,0,3)')).toBe('9');
    expect(calc('∫(sin(t),t,0,π)')).toBe('2');
    expect(calc('Σ(k,k,1,100)')).toBe('5050');
    expect(calc('d(x^3,x)|x=2')).toBe('12');
  });

  it('reports real-mode and argument errors', () => {
    expect(calcError('√(⁻1)')).toBe('Non-real result');
    expect(calcError('ln(⁻1)')).toBe('Non-real result');
    expect(calcError('(⁻8)^(1/2)')).toBe('Non-real result');
    expect(calcError('mod(1)')).toBe('Too few arguments');
    expect(calcError('sin(1,2)')).toBe('Too many arguments');
    expect(calcError('d(x^2,x)')).toBe('Undefined variable');
    expect(calcError('2ⅈ')).toBe('Complex numbers not supported');
  });
});

describe('variables', () => {
  it('stores with → and reads back case-insensitively', () => {
    const vars = new Map<string, Value>();
    expect(calc('5→x', { vars })).toBe('5');
    expect(calc('2X+1', { vars })).toBe('11');
    expect(calc('x*y|y=3', { vars })).toBe('15');
    expect(vars.has('y')).toBe(false);
  });

  it('treats adjacent letters as one variable name, like the TI-92', () => {
    const vars = new Map<string, Value>([['ab', 7]]);
    expect(calc('ab', { vars })).toBe('7');
    expect(calcError('xy')).toBe('Undefined variable');
  });

  it('reads previous answers with ans(n)', () => {
    expect(calc('ans(1)*2', { ans: [3, 10] })).toBe('20');
    expect(calc('ans(2)', { ans: [3, 10] })).toBe('3');
    expect(calc('ans(1)')).toBe('0');
  });

  it('rejects storing into constants and functions', () => {
    expect(calcError('1→π')).toBe('Invalid variable name');
    expect(calcError('1→sin')).toBe('Invalid variable name');
  });
});

describe('syntax errors', () => {
  it.each(['1+', '*2', '2)', 'sin 3', '{1,2}', '.'])('%s', (text) => {
    expect(calcError(text)).toBe('Syntax');
  });

  it('reports where the error is', () => {
    expect(() => parse('1+2)')).toThrow(expect.objectContaining({ kind: 'Syntax', pos: 3 }));
  });
});

describe('F2 Algebra and F3 Calc functions', () => {
  it.each([
    ['solve(x^2=4,x)', 'x=⁻2 or x=2'],
    ['solve(x^2-2x+1=0,x)', 'x=1'],
    ['solve(2t+1=0,t)', 't=⁻0.5'],
    ['solve(x^2=⁻1,x)', 'false'],
    ['solve(x^3=x,x)', 'x=⁻1 or x=0 or x=1'],
    ['zeros(x^2-5x+6,x)', '{2 3}'],
    ['zeros(x^2+1,x)', '{}'],
    ['approx(1/4)', '0.25'],
    ['Π(k,k,1,5)', '120'],
    ['fMin(x^2-4x,x,⁻10,10)', 'x=2'],
    ['fMax(⁻(x-3)^2,x,0,10)', 'x=3'],
    ['nInt(x^2,x,0,3)', '9'],
    ['nDeriv(x^2,x)|x=3', '6'],
  ])('%s = %s', (text, expected) => {
    expect(calc(text)).toBe(expected);
  });

  it('solves in degree mode', () => {
    expect(calc('solve(sin(x)=0.5,x)', { angle: 'deg' }).split(' or ')).toContain('x=30');
  });

  it('ignores the stored value of the variable being solved for', () => {
    expect(calc('solve(x+1=0,x)', { vars: new Map([['x', 5]]) })).toBe('x=⁻1');
  });

  it('skips discontinuities instead of reporting them as roots', () => {
    expect(calc('zeros(1/x,x)')).toBe('{}');
  });

  it('rejects bad arguments', () => {
    expect(calcError('solve(x<4,x)')).toBe('Argument');
    expect(calcError('solve(x=4,2)')).toBe('Argument');
    expect(calcError('fMin(x^2,x,1,1)')).toBe('Domain');
    expect(calcError('fMin(x^2,x)')).toBe('Too few arguments');
  });

  it('keeps Π (product) and π (the constant) apart', () => {
    expect(calc('Π(2,k,1,3)')).toBe('8');
    expect(calc('2π')).toBe('6.28318530718');
  });
});

describe('F4 Other: Define and DelVar', () => {
  it('defines and calls functions', () => {
    const funcs = new Map<string, UserFunction>();
    const vars = new Map<string, Value>();
    expect(calc('Define f(x)=x^2+1', { vars, funcs })).toBe('Done');
    expect(calc('f(3)', { vars, funcs })).toBe('10');
    expect(calc('Define g(a,b)=a*b+f(b)', { vars, funcs })).toBe('Done');
    expect(calc('g(2,3)', { vars, funcs })).toBe('16');
    expect(calcError('f(1,2)', { vars, funcs })).toBe('Too many arguments');
  });

  it('gives function bodies only their parameters and global variables', () => {
    const funcs = new Map<string, UserFunction>();
    const vars = new Map<string, Value>([['k', 10]]);
    calc('Define f(x)=x+k+y', { vars, funcs });
    expect(calcError('f(1)|y=1', { vars, funcs })).toBe('Undefined variable');
  });

  it('defines variables and deletes names', () => {
    const funcs = new Map<string, UserFunction>();
    const vars = new Map<string, Value>();
    expect(calc('Define a=2+3', { vars, funcs })).toBe('Done');
    expect(calc('a', { vars, funcs })).toBe('5');
    calc('Define f(x)=x', { vars, funcs });
    expect(calc('DelVar a,f', { vars, funcs })).toBe('Done');
    expect(vars.has('a') || funcs.has('f')).toBe(false);
  });

  it('treats name(…) as multiplication when name is a variable, not a function', () => {
    expect(calc('x(2+3)', { vars: new Map([['x', 4]]) })).toBe('20');
    expect(calcError('x(1,2)', { vars: new Map([['x', 4]]) })).toBe('Undefined function');
  });

  it('stops runaway recursion', () => {
    const funcs = new Map<string, UserFunction>();
    calc('Define f(x)=f(x)', { funcs });
    expect(calcError('f(1)', { funcs })).toBe('Memory');
  });

  it('rejects reserved names', () => {
    expect(calcError('Define sin(x)=x')).toBe('Invalid variable name');
    expect(calcError('Define f(π)=1')).toBe('Invalid parameter');
    expect(calcError('1→define')).toBe('Invalid variable name');
  });
});
