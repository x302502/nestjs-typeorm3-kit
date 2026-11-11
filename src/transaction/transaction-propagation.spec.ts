import { jest } from "@jest/globals";
import "reflect-metadata";
import type { EventEmitter } from "events";
import { PATH_METADATA } from "@nestjs/common/constants";
import { DataSource } from "typeorm";
import {
  addTransactionalDataSource,
  DefGet,
  DefTransaction,
  deleteDataSourceByName,
  getDataSourceByName,
  IsolationLevel,
  Propagation,
  runInTransaction,
  runOnTransactionCommit,
  runOnTransactionComplete,
  runOnTransactionRollback,
  setupTransactionContext,
  Transactional,
  TransactionalError,
  wrapInTransaction,
} from "..";

type FakeManager = { id: number; queryRunner: undefined };

/**
 * DataSource whose `manager.transaction` hands out a fresh manager with an
 * incrementing id; the non-transactional manager has id 0.
 */
function fakeDataSource(name: string) {
  const dataSource = Object.create(DataSource.prototype) as DataSource;
  let nextId = 0;
  const transaction = jest.fn(async (...args: unknown[]) => {
    const callback = args[args.length - 1] as (manager: FakeManager) => Promise<unknown>;
    return callback({ id: ++nextId, queryRunner: undefined });
  });
  Object.defineProperty(dataSource, "manager", {
    configurable: true,
    value: { id: 0, transaction },
  });
  addTransactionalDataSource({ name, dataSource });
  return { dataSource, transaction };
}

const managerId = (dataSource: DataSource) => (dataSource.manager as unknown as FakeManager).id;
const tick = () => new Promise<void>((resolve) => { setImmediate(resolve); });

describe("transaction propagation", () => {
  const name = "propagation";
  let dataSource: DataSource;
  let transaction: ReturnType<typeof fakeDataSource>["transaction"];

  const run = <T>(fn: () => Promise<T>, propagation?: Propagation) =>
    wrapInTransaction(fn, { connectionName: name, propagation })();
  const inTransaction = <T>(fn: () => Promise<T>) => run(fn);

  beforeAll(() => {
    setupTransactionContext();
  });

  beforeEach(() => {
    ({ dataSource, transaction } = fakeDataSource(name));
  });

  afterEach(() => {
    deleteDataSourceByName(name);
  });

  it("REQUIRED (default) opens a transaction when none exists and joins an existing one", async () => {
    expect(await run(async () => managerId(dataSource))).toBe(1);
    expect(await inTransaction(async () => [
      managerId(dataSource),
      await run(async () => managerId(dataSource), Propagation.REQUIRED),
    ])).toEqual([2, 2]);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("REQUIRES_NEW always opens a new transaction and restores the parent afterwards", async () => {
    expect(await inTransaction(async () => {
      const child = await run(async () => managerId(dataSource), Propagation.REQUIRES_NEW);
      return [child, managerId(dataSource)];
    })).toEqual([2, 1]);
  });

  it("MANDATORY throws without a transaction and joins an existing one", async () => {
    await expect(run(async () => 1, Propagation.MANDATORY)).rejects.toThrow(TransactionalError);
    await expect(run(async () => 1, Propagation.MANDATORY)).rejects.toThrow(/MANDATORY/);
    expect(await inTransaction(() => run(async () => managerId(dataSource), Propagation.MANDATORY)))
      .toBe(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("NEVER runs without a transaction and throws inside one", async () => {
    expect(await run(async () => managerId(dataSource), Propagation.NEVER)).toBe(0);
    await expect(inTransaction(() => run(async () => 1, Propagation.NEVER)))
      .rejects.toThrow(/NEVER/);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("NOT_SUPPORTED suspends the current transaction and resumes it afterwards", async () => {
    expect(await run(async () => managerId(dataSource), Propagation.NOT_SUPPORTED)).toBe(0);
    expect(await inTransaction(async () => {
      const suspended = await run(async () => managerId(dataSource), Propagation.NOT_SUPPORTED);
      return [suspended, managerId(dataSource)];
    })).toEqual([0, 1]);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("SUPPORTS joins an existing transaction or runs without one", async () => {
    expect(await run(async () => managerId(dataSource), Propagation.SUPPORTS)).toBe(0);
    expect(await inTransaction(() => run(async () => managerId(dataSource), Propagation.SUPPORTS)))
      .toBe(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("uses the non-transactional manager outside of any transaction", () => {
    expect(managerId(dataSource)).toBe(0);
  });

  it("passes arguments and `this` to the wrapped function", async () => {
    const target = {
      factor: 3,
      multiply: wrapInTransaction(function (this: { factor: number }, value: number) {
        return Promise.resolve(value * this.factor);
      }, { connectionName: name }),
    };
    expect(await target.multiply(5)).toBe(15);
  });

  it("propagates errors thrown by the wrapped function", async () => {
    await expect(run(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });

  it("runInTransaction executes immediately and returns the result", async () => {
    expect(await runInTransaction(async () => managerId(dataSource), { connectionName: name }))
      .toBe(1);
  });

  it("fails when the DataSource was never registered", async () => {
    expect(() => wrapInTransaction(async () => 1, { connectionName: "missing" })())
      .toThrow(/No data sources defined/);
    expect(() => wrapInTransaction(async () => 1)()).toThrow(/No data sources defined/);
  });
});

describe("transaction hooks", () => {
  const name = "hooks";

  beforeAll(() => {
    setupTransactionContext();
  });

  beforeEach(() => {
    fakeDataSource(name);
  });

  afterEach(() => {
    deleteDataSourceByName(name);
  });

  it("fires commit and complete hooks after a successful transaction", async () => {
    const events: unknown[] = [];
    await wrapInTransaction(async () => {
      runOnTransactionCommit(() => events.push("commit"));
      runOnTransactionRollback(() => events.push("rollback"));
      runOnTransactionComplete((err) => events.push(["complete", err]));
      expect(events).toEqual([]);
    }, { connectionName: name })();
    await tick();
    expect(events).toEqual(["commit", ["complete", undefined]]);
  });

  it("fires rollback and complete hooks with the error after a failed transaction", async () => {
    const events: unknown[] = [];
    const error = new Error("fail");
    await expect(wrapInTransaction(async () => {
      runOnTransactionCommit(() => events.push("commit"));
      runOnTransactionRollback((err) => events.push(["rollback", err]));
      runOnTransactionComplete((err) => events.push(["complete", err]));
      throw error;
    }, { connectionName: name })()).rejects.toBe(error);
    await tick();
    expect(events).toEqual([["rollback", error], ["complete", error]]);
  });

  it("allows hooks in non-transactional propagations that open a hook context", async () => {
    const events: string[] = [];
    await wrapInTransaction(async () => {
      runOnTransactionCommit(() => events.push("commit"));
    }, { connectionName: name, propagation: Propagation.SUPPORTS })();
    await tick();
    expect(events).toEqual(["commit"]);
  });

  it("throws when a hook is registered outside of a transaction", () => {
    expect(() => runOnTransactionCommit(() => undefined)).toThrow(/No hook manager/);
    expect(() => runOnTransactionRollback(() => undefined)).toThrow(/No hook manager/);
    expect(() => runOnTransactionComplete(() => undefined)).toThrow(/No hook manager/);
  });

  it("applies maxHookHandlers to the hook emitter", async () => {
    const maxListeners = async () => {
      let max: number | undefined;
      await wrapInTransaction(async () => {
        // the hook emitter is bound as `this` for its listeners
        runOnTransactionCommit(function (this: EventEmitter) { max = this.getMaxListeners(); });
      }, { connectionName: name })();
      await tick();
      return max;
    };

    expect(await maxListeners()).toBe(10);
    setupTransactionContext({ maxHookHandlers: 25 });
    try {
      expect(await maxListeners()).toBe(25);
    } finally {
      setupTransactionContext({ maxHookHandlers: 10 });
    }
  });
});

describe("@Transactional / @DefTransaction", () => {
  const name = "decorators";
  let dataSource: DataSource;
  let transaction: ReturnType<typeof fakeDataSource>["transaction"];

  beforeAll(() => {
    setupTransactionContext();
  });

  beforeEach(() => {
    ({ dataSource, transaction } = fakeDataSource(name));
  });

  afterEach(() => {
    deleteDataSourceByName(name);
  });

  it("@Transactional keeps the method name, metadata, `this` and arguments", async () => {
    class Service {
      prefix = "id";

      @Transactional({ connectionName: name })
      @DefGet("work")
      async work(suffix: string) {
        return `${this.prefix}-${managerId(dataSource)}-${suffix}`;
      }
    }

    expect(Service.prototype.work.name).toBe("work");
    expect(Reflect.getMetadata(PATH_METADATA, Service.prototype.work)).toBe("work");
    expect(await new Service().work("x")).toBe("id-1-x");
  });

  it("@DefTransaction() without options uses the default DataSource", async () => {
    const { dataSource: defaultDs } = fakeDataSource("default");
    try {
      class Service {
        @DefTransaction()
        async work() {
          return managerId(defaultDs);
        }
      }
      expect(await new Service().work()).toBe(1);
    } finally {
      deleteDataSourceByName("default");
    }
  });

  it("@DefTransaction forwards propagation", async () => {
    class Service {
      @DefTransaction({ connectionName: name, propagation: Propagation.MANDATORY })
      async work() {
        return 1;
      }
    }
    await expect(new Service().work()).rejects.toThrow(TransactionalError);
  });

  it.each([
    [{ isolationLevel: IsolationLevel.SERIALIZABLE }, "SERIALIZABLE"],
    [{ isolationLevel: "REPEATABLE_READ" as const }, "REPEATABLE READ"],
    [{ isoLevel: "READ_UNCOMMITTED" as const }, "READ UNCOMMITTED"],
    [{ isolationLevel: IsolationLevel.READ_COMMITTED, isoLevel: "SERIALIZABLE" as const }, "READ COMMITTED"],
  ])("@DefTransaction maps isolation options %j to %s", async (options, expected) => {
    class Service {
      @DefTransaction({ connectionName: name, ...options })
      async work() {
        return true;
      }
    }
    await new Service().work();
    expect(transaction).toHaveBeenCalledWith(expected, expect.any(Function));
  });

  it("@DefTransaction ignores an unknown isolation level", async () => {
    class Service {
      @DefTransaction({ connectionName: name, isoLevel: "NOPE" as never })
      async work() {
        return true;
      }
    }
    await new Service().work();
    expect(transaction).toHaveBeenCalledWith(expect.any(Function));
  });
});

describe("addTransactionalDataSource", () => {
  beforeAll(() => {
    setupTransactionContext();
  });

  it("registers a bare DataSource under the default name", () => {
    const dataSource = Object.create(DataSource.prototype) as DataSource;
    Object.defineProperty(dataSource, "manager", { configurable: true, value: {} });
    try {
      expect(addTransactionalDataSource(dataSource)).toBe(dataSource);
      expect(getDataSourceByName("default")).toBe(dataSource);
    } finally {
      expect(deleteDataSourceByName("default")).toBe(true);
    }
    expect(getDataSourceByName("default")).toBeUndefined();
    expect(deleteDataSourceByName("default")).toBe(false);
  });

  it("rejects a duplicate name", () => {
    fakeDataSource("dup");
    try {
      expect(() => fakeDataSource("dup")).toThrow(/"dup" has already added/);
    } finally {
      deleteDataSourceByName("dup");
    }
  });

  it("leaves DataSource.manager untouched when patch is false", async () => {
    const dataSource = Object.create(DataSource.prototype) as DataSource;
    const manager = {
      id: 0,
      transaction: async (cb: (m: FakeManager) => Promise<unknown>) => cb({ id: 1, queryRunner: undefined }),
    };
    Object.defineProperty(dataSource, "manager", { configurable: true, value: manager });
    addTransactionalDataSource({ name: "unpatched", dataSource, patch: false });
    try {
      expect(await wrapInTransaction(async () => managerId(dataSource), {
        connectionName: "unpatched",
      })()).toBe(0);
    } finally {
      deleteDataSourceByName("unpatched");
    }
  });

  it("refuses to patch when TypeORM's DataSource signatures changed", () => {
    const original = DataSource.prototype.query;
    DataSource.prototype.query = function (_query: string) {
      return Promise.resolve();
    } as typeof original;
    try {
      const dataSource = Object.create(DataSource.prototype) as DataSource;
      Object.defineProperty(dataSource, "manager", { configurable: true, value: {} });
      expect(() => addTransactionalDataSource({ name: "outdated", dataSource }))
        .toThrow(expect.objectContaining({ name: "TypeOrmUpdatedPatchError" }));
      expect(getDataSourceByName("outdated")).toBeUndefined();
    } finally {
      DataSource.prototype.query = original;
    }
  });
});
