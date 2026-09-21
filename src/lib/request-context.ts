import { AsyncLocalStorage } from "node:async_hooks";
type Ctx = { userId?: string; permissions?: Set<string> };
export const requestCtx = new AsyncLocalStorage<Ctx>();
