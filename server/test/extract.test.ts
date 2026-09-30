import { describe, it, expect } from 'vitest';
import {
  extractSymbols,
  extractReferences,
  extractEndpoints,
  extractCrons,
  extractPythonSymbols,
  extractPythonReferences,
} from '../src/adapters/codeindex/extract.js';

/**
 * A3 — unit tests for the enhanced TS/JS symbol/reference extractor (L04).
 * Pure (no DB/network) — the core of blast-radius accuracy.
 */
describe('extractSymbols', () => {
  it('finds functions, arrows, classes, methods, interfaces, types', () => {
    const src = `
export function rateLimit(req) { return true; }
const helper = (x) => x + 1;
export const compute = async (n: number) => n * 2;
export class Bucket {
  refill(now: number) { return now; }
  static make() { return new Bucket(); }
}
export interface Config { port: number }
export type Id = string;
`;
    const syms = extractSymbols(src);
    const names = syms.map((s) => s.name);
    expect(names).toContain('rateLimit');
    expect(names).toContain('helper');
    expect(names).toContain('compute');
    expect(names).toContain('Bucket');
    expect(names).toContain('refill'); // class method (bare)
    expect(names).toContain('Bucket.refill'); // class method (qualified)
    expect(names).toContain('Config');
    expect(names).toContain('Id');
    expect(syms.find((s) => s.name === 'Bucket')?.kind).toBe('class');
    expect(syms.find((s) => s.name === 'Config')?.kind).toBe('interface');
  });

  it('ignores keywords and comment lines', () => {
    const src = `
// function notReal(x) {}
/* class AlsoNot {} */
if (x) { doThing(); }
`;
    const syms = extractSymbols(src);
    expect(syms.map((s) => s.name)).not.toContain('notReal');
    expect(syms.map((s) => s.name)).not.toContain('AlsoNot');
    expect(syms.map((s) => s.name)).not.toContain('if');
  });
});

describe('extractReferences (downstream callers)', () => {
  it('finds call sites and excludes the declaration', () => {
    const caller = `
import { rateLimit } from './mw';
export function handler(req) {
  if (!rateLimit(req)) return 429;
  return 200;
}
`;
    const refs = extractReferences(caller, 'rateLimit');
    // exactly the call site on the if-line, NOT the import line
    expect(refs.length).toBe(1);
    expect(refs[0]!.line).toBe(4);
  });

  it('matches member calls, new, and JSX usage', () => {
    expect(extractReferences('obj.compute(1)', 'compute').length).toBe(1);
    expect(extractReferences('const b = new Bucket()', 'Bucket').length).toBe(1);
    expect(extractReferences('return <Widget id={1} />', 'Widget').length).toBe(1);
  });

  it('does not count the declaration line as a reference', () => {
    const decl = `export function rateLimit(req) { return true; }`;
    expect(extractReferences(decl, 'rateLimit').length).toBe(0);
  });
});

describe('extractEndpoints / extractCrons', () => {
  it('detects fastify/express route registrations', () => {
    const src = `
app.get('/users', handler);
router.post("/users/:id", update);
app.get<{ Params: { id: string } }>('/pulls/:id/blast', blast);
`;
    const eps = extractEndpoints(src);
    expect(eps).toContain('GET /users');
    expect(eps).toContain('POST /users/:id');
    expect(eps).toContain('GET /pulls/:id/blast');
  });

  it('detects cron expressions and background job kinds', () => {
    const src = `
cron.schedule('*/5 * * * *', poll);
jobs.register('poll_repo', handler);
`;
    const crons = extractCrons(src);
    expect(crons.some((c) => c.includes('*/5'))).toBe(true);
    expect(crons).toContain('job:poll_repo');
  });
});

describe('Python extraction (blast-radius fallback)', () => {
  const PY = `import boto3
from utils import helper

# def commented_out():
def fetch_data(url):
    return helper(url)

async def upload(bucket, rows):
    def inner():
        return 1
    return fetch_data(bucket)

class Loader:
    def __init__(self):
        self.n = 0

    def run(self, x):
        return fetch_data(x)

def main():
    upload("b", [])
`;

  it('finds module-level functions, classes and class methods; skips nested defs, comments and bare dunders', () => {
    const syms = extractPythonSymbols(PY);
    const names = syms.map((s) => `${s.kind}:${s.name}`);
    expect(names).toContain('function:fetch_data');
    expect(names).toContain('function:upload');
    expect(names).toContain('function:main');
    expect(names).toContain('class:Loader');
    expect(names).toContain('method:Loader.run');
    expect(names).toContain('method:run');
    expect(names).toContain('method:Loader.__init__');
    expect(names).not.toContain('method:__init__');
    expect(names).not.toContain('function:inner');
    expect(names).not.toContain('function:commented_out');
  });

  it('finds call sites but not the declaration, imports, or comments', () => {
    const refs = extractPythonReferences(PY, 'fetch_data').map((r) => r.line);
    expect(refs).toEqual([11, 18]); // `return fetch_data(bucket)`, `return fetch_data(x)`
    expect(extractPythonReferences(PY, 'helper').map((r) => r.line)).toEqual([6]);
  });

  it('detects Flask and FastAPI route decorators', () => {
    const eps = extractEndpoints(`
@app.route('/health')
def health(): ...
@app.route('/items', methods=['POST'])
def add(): ...
@router.get('/users/{id}')
def get_user(): ...
`);
    expect(eps).toEqual(expect.arrayContaining(['GET /health', 'POST /items', 'GET /users/{id}']));
  });
});
