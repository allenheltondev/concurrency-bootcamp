/* Saga — a distributed transaction as local steps plus compensations.

   There is no cross-service rollback, so you build one: every step pairs an
   action with a compensate that undoes it. run() awaits the actions in
   declaration order; if one throws, it awaits the compensations of every
   COMPLETED step in reverse order, then reports failure.

   INVARIANT: on failure, exactly the steps that completed are compensated,
   newest first — unwind the stack you built. The FAILED step itself is never
   compensated: its action didn't finish, there is nothing to undo.
   LOG: every completed action appends "ok:<name>"; every compensation
   appends "undo:<name>". run resolves { ok, log } — it never rejects; a
   failed saga is a RESULT, not an exception.
   EDGE: a failure at the FIRST step compensates nothing and leaves the log
   empty. Actions and compensations may be async — await each one, in order.
*/
export class Saga {
  #steps = [];

  step(name, action, compensate) {      // chainable — returns this
    throw new Error("implement me");
  }

  async run(log = []) {                 // -> { ok, log }
    throw new Error("implement me");
  }
}
