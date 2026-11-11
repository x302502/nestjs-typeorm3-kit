import "reflect-metadata";
import { DefTransaction, wrapInTransaction } from "..";

// Kept in its own file: setupTransactionContext() must never run in this module registry.
describe("transactions without setupTransactionContext()", () => {
  it("fails with a clear message when a wrapped function is called", () => {
    expect(() => wrapInTransaction(async () => 1)()).toThrow(/No storage driver defined/);
  });

  it("fails when a @DefTransaction method is called", () => {
    class Service {
      @DefTransaction()
      async work() {
        return 1;
      }
    }
    expect(() => new Service().work()).toThrow(/No storage driver defined/);
  });
});
