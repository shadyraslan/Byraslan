/**퍼포먼스 계측: 요청 단위 구조화 로그. 토큰/쿠키/비밀번호 등 민감정보는 절대 기록하지 않음. */

type PerfMark = { name: string; start: number; end?: number; ms?: number };

type PerfContext = {
  reqId: string;
  path: string;
  marks: PerfMark[];
};

const contexts = new Map<string, PerfContext>();

export function createReqId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function startReq(reqId: string, path: string): PerfContext {
  const ctx: PerfContext = { reqId, path, marks: [] };
  contexts.set(reqId, ctx);
  return ctx;
}

export function mark(ctx: PerfContext, name: string): void {
  ctx.marks.push({ name, start: performance.now() });
}

export function endMark(ctx: PerfContext, name: string): void {
  const mark = ctx.marks.find((m) => m.name === name && m.end === undefined);
  if (mark) {
    mark.end = performance.now();
    mark.ms = Math.round((mark.end - mark.start) * 100) / 100;
  }
}

export function endReq(ctx: PerfContext): void {
  const totalMs = ctx.marks.reduce((a, m) => a + (m.ms ?? 0), 0);
  const log = {
    reqId: ctx.reqId,
    path: ctx.path,
    totalMs: Math.round(totalMs * 100) / 100,
    marks: ctx.marks.map((m) => ({ name: m.name, ms: m.ms })),
    ts: new Date().toISOString(),
  };
  // eslint-disable-next-line no-console
  console.log(`[PERF] ${JSON.stringify(log)}`);
  contexts.delete(ctx.reqId);
}

export function getCtx(reqId: string): PerfContext | undefined {
  return contexts.get(reqId);
}

/** Supabase 쿼리 호출에 계측 래퍼를 씌웁니다. */
export function instrumented(sb: any, ctx: PerfContext, op: string) {
  const markName = `supabase:${op}`;
  mark(ctx, markName);
  return {
    from: (table: string) => {
      const qMark = `${markName}:${table}`;
      mark(ctx, qMark);
      const orig = sb.from(table);
      return new Proxy(orig, {
        get(target, prop: string) {
          const val = target[prop];
          if (typeof val === "function") {
            return (...args: any[]) => {
              const t0 = performance.now();
              const result = val.apply(target, args);
              if (result && typeof result.then === "function") {
                return result.then((res: any) => {
                  endMark(ctx, qMark);
                  return res;
                });
              }
              endMark(ctx, qMark);
              return result;
            };
          }
          return val;
        },
      });
    },
  };
}
