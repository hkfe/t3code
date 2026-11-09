import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";

/** Data, error text and loading flag of a query atom's result. */
export function queryState<A, E>(result: AsyncResult.AsyncResult<A, E>) {
  const error = result._tag === "Failure" ? Cause.squash(result.cause) : null;
  return {
    data: AsyncResult.getOrElse(result, () => null),
    error: error === null ? null : error instanceof Error ? error.message : String(error),
    waiting: result.waiting,
  };
}
