import "reflect-metadata";
import { DataSource, EntitySchema } from "typeorm";
import type { EntityManager } from "typeorm";
import {
  DefTransaction,
  deleteDataSourceByName,
  setupTransactionContext,
  addTransactionalDataSource,
  IsolationLevel,
  Propagation,
  wrapInTransaction,
  runOnTransactionCommit,
  runOnTransactionRollback,
} from "..";

describe("transaction isolation", () => {
  it("uses a dynamically selected DataSource and passes the SQL isolation level", async () => {
    setupTransactionContext();
    const dataSource = Object.create(DataSource.prototype) as DataSource;
    let isolation: string | undefined;
    Object.defineProperty(dataSource, "manager", {
      configurable: true,
      value: {
        transaction: async (level: string, callback: (manager: EntityManager) => Promise<number>) => {
          isolation = level;
          return callback({ queryRunner: undefined } as EntityManager);
        },
      },
    });
    addTransactionalDataSource({ name: "tenant", dataSource });

    try {
      class Service {
        @DefTransaction({
          connectionName: () => "tenant",
          isoLevel: "READ_COMMITTED",
        })
        async work(): Promise<number> {
          return 42;
        }
      }

      expect(await new Service().work()).toBe(42);
      expect(isolation).toBe(IsolationLevel.READ_COMMITTED);
    } finally {
      deleteDataSourceByName("tenant");
    }
  });
});

function transactionManagerId(dataSource: DataSource): number {
  const manager = dataSource.manager;
  if (!("id" in manager) || typeof manager.id !== "number") {
    throw new Error("Expected the active transaction manager");
  }
  return manager.id;
}

describe("concurrent transaction contexts", () => {
  it("keeps sibling managers and the parent manager isolated", async () => {
    setupTransactionContext();
    const dataSource = Object.create(DataSource.prototype) as DataSource;
    let nextId = 0;
    Object.defineProperty(dataSource, "manager", {
      configurable: true,
      value: {
        transaction: async (callback: (manager: { id: number }) => Promise<unknown>) =>
          callback({ id: ++nextId }),
      },
    });
    addTransactionalDataSource({ name: "concurrent", dataSource });

    let firstEntered!: () => void;
    let secondEntered!: () => void;
    let firstRead!: () => void;
    const firstStarted = new Promise<void>((resolve) => { firstEntered = resolve; });
    const secondStarted = new Promise<void>((resolve) => { secondEntered = resolve; });
    const firstFinishedReading = new Promise<void>((resolve) => { firstRead = resolve; });

    try {
      const first = wrapInTransaction(async () => {
        firstEntered();
        await secondStarted;
        const managerId = transactionManagerId(dataSource);
        firstRead();
        return managerId;
      }, { connectionName: "concurrent", propagation: Propagation.REQUIRES_NEW });
      const second = wrapInTransaction(async () => {
        secondEntered();
        await firstFinishedReading;
        return transactionManagerId(dataSource);
      }, { connectionName: "concurrent", propagation: Propagation.REQUIRES_NEW });
      const parent = wrapInTransaction(async () => {
        const pendingFirst = first();
        await firstStarted;
        const pendingSecond = second();
        const siblings = await Promise.all([pendingFirst, pendingSecond]);
        return { siblings, parent: transactionManagerId(dataSource) };
      }, { connectionName: "concurrent" });

      expect(await parent()).toEqual({ siblings: [2, 3], parent: 1 });
    } finally {
      deleteDataSourceByName("concurrent");
    }
  });
});

describe("nested transactions", () => {
  it("keeps savepoint writes and hooks tied to the outer SQL transaction", async () => {
    setupTransactionContext();
    const entity = new EntitySchema({
      name: "TransactionItem",
      columns: {
        id: { type: Number, primary: true, generated: true },
        label: { type: String },
      },
    });
    const dataSource = new DataSource({
      type: "sqljs",
      entities: [entity],
      synchronize: true,
    });
    await dataSource.initialize();
    addTransactionalDataSource({ name: "nested", dataSource });
    const hookEvents: string[] = [];

    try {
      const child = wrapInTransaction(async (label: string) => {
        await dataSource.manager.save("TransactionItem", { label });
        runOnTransactionCommit(() => { hookEvents.push(`${label} committed`); });
      }, { connectionName: "nested", propagation: Propagation.NESTED });
      const abortedParent = wrapInTransaction(async () => {
        await child("discarded");
        throw new Error("parent rollback");
      }, { connectionName: "nested" });

      await expect(abortedParent()).rejects.toThrow("parent rollback");
      await new Promise<void>((resolve) => { setImmediate(resolve); });
      expect(await dataSource.manager.find("TransactionItem")).toEqual([]);
      expect(hookEvents).toEqual([]);

      const committedParent = wrapInTransaction(async () => {
        await child("persisted");
      }, { connectionName: "nested" });
      await committedParent();
      await new Promise<void>((resolve) => { setImmediate(resolve); });
      expect((await dataSource.manager.find("TransactionItem")).map((item) => item.label))
        .toEqual(["persisted"]);
      expect(hookEvents).toEqual(["persisted committed"]);

      const failedChild = wrapInTransaction(async () => {
        runOnTransactionRollback(() => { hookEvents.push("savepoint rolled back"); });
        await dataSource.manager.save("TransactionItem", { label: "failed" });
        throw new Error("savepoint rollback");
      }, { connectionName: "nested", propagation: Propagation.NESTED });
      const recoveredParent = wrapInTransaction(async () => {
        await expect(failedChild()).rejects.toThrow("savepoint rollback");
        await dataSource.manager.save("TransactionItem", { label: "parent" });
      }, { connectionName: "nested" });
      await recoveredParent();
      await new Promise<void>((resolve) => { setImmediate(resolve); });
      expect((await dataSource.manager.find("TransactionItem")).map((item) => item.label))
        .toEqual(["persisted", "parent"]);
      expect(hookEvents).toEqual(["persisted committed", "savepoint rolled back"]);
    } finally {
      deleteDataSourceByName("nested");
      await dataSource.destroy();
    }
  });

  async function createSqlJs(name: string) {
    const entity = new EntitySchema({
      name: "TransactionItem",
      columns: {
        id: { type: Number, primary: true, generated: true },
        label: { type: String },
      },
    });
    const dataSource = new DataSource({ type: "sqljs", entities: [entity], synchronize: true });
    await dataSource.initialize();
    addTransactionalDataSource({ name, dataSource });
    return dataSource;
  }

  const labels = async (dataSource: DataSource) =>
    (await dataSource.manager.find("TransactionItem")).map((item: any) => item.label).sort();

  const tick = () => new Promise<void>((resolve) => { setImmediate(resolve); });

  it("rolls back only the failed child when sibling savepoints overlap", async () => {
    setupTransactionContext();
    const dataSource = await createSqlJs("overlap");

    try {
      let childWrote!: () => void;
      let failChild!: () => void;
      const wrote = new Promise<void>((resolve) => { childWrote = resolve; });
      const fail = new Promise<void>((resolve) => { failChild = resolve; });

      const failing = wrapInTransaction(async () => {
        await dataSource.manager.save("TransactionItem", { label: "failed" });
        childWrote();
        await fail;
        throw new Error("child failed");
      }, { connectionName: "overlap", propagation: Propagation.NESTED });
      const succeeding = wrapInTransaction(async () => {
        await dataSource.manager.save("TransactionItem", { label: "succeeded" });
      }, { connectionName: "overlap", propagation: Propagation.NESTED });

      const outer = wrapInTransaction(async () => {
        const first = failing();
        const firstOutcome = first.then(() => "resolved", (err: Error) => err.message);
        await wrote;
        const second = succeeding();
        failChild();
        expect(await firstOutcome).toBe("child failed");
        await second;
      }, { connectionName: "overlap" });

      await outer();
      await tick();
      expect(await labels(dataSource)).toEqual(["succeeded"]);
    } finally {
      deleteDataSourceByName("overlap");
      await dataSource.destroy();
    }
  });

  it("serializes concurrent nested children, including grandchildren, without deadlock", async () => {
    setupTransactionContext();
    const dataSource = await createSqlJs("siblings");

    try {
      const grandchild = wrapInTransaction(async (label: string) => {
        await dataSource.manager.save("TransactionItem", { label });
      }, { connectionName: "siblings", propagation: Propagation.NESTED });
      const child = wrapInTransaction(async (label: string, fails: boolean) => {
        await dataSource.manager.save("TransactionItem", { label });
        await grandchild(`${label}-grandchild`);
        if (fails) throw new Error(label);
      }, { connectionName: "siblings", propagation: Propagation.NESTED });

      await wrapInTransaction(async () => {
        const results = await Promise.allSettled([
          child("a", true),
          child("b", false),
          child("c", false),
        ]);
        expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
      }, { connectionName: "siblings" })();

      expect(await labels(dataSource)).toEqual(["b", "b-grandchild", "c", "c-grandchild"]);
    } finally {
      deleteDataSourceByName("siblings");
      await dataSource.destroy();
    }
  });

  it.each([
    Propagation.NESTED,
    Propagation.REQUIRED,
    Propagation.MANDATORY,
    Propagation.SUPPORTS,
  ])("ties %s hooks to their owning DataSource transaction", async propagation => {
    setupTransactionContext();
    const dsA = await createSqlJs("owner-a");
    const dsB = await createSqlJs("owner-b");
    const events: string[] = [];

    try {
      const nestedA = wrapInTransaction(async () => {
        await dsA.manager.save("TransactionItem", { label: "a-nested" });
        runOnTransactionCommit(() => { events.push("commit"); });
        runOnTransactionRollback(() => { events.push("rollback"); });
      }, { connectionName: "owner-a", propagation });
      const innerB = wrapInTransaction(async () => {
        await dsB.manager.save("TransactionItem", { label: "b" });
        await nestedA();
      }, { connectionName: "owner-b" });
      const outerA = wrapInTransaction(async () => {
        await innerB();
        await tick();
        await tick();
        expect(events).toEqual([]);
        throw new Error("A rollback");
      }, { connectionName: "owner-a" });

      await expect(outerA()).rejects.toThrow("A rollback");
      await tick();
      await tick();
      expect(events).toEqual(["rollback"]);
      expect(await labels(dsA)).toEqual([]);
      expect(await labels(dsB)).toEqual(["b"]);
    } finally {
      deleteDataSourceByName("owner-a");
      deleteDataSourceByName("owner-b");
      await dsA.destroy();
      await dsB.destroy();
    }
  });

  it("does not block nested transactions on a different DataSource", async () => {
    setupTransactionContext();
    const dsA = await createSqlJs("lock-a");
    const dsB = await createSqlJs("lock-b");

    try {
      let releaseA!: () => void;
      const gate = new Promise<void>((resolve) => { releaseA = resolve; });
      let aEntered!: () => void;
      const entered = new Promise<void>((resolve) => { aEntered = resolve; });
      const nestedA = wrapInTransaction(async () => {
        aEntered();
        await gate;
      }, { connectionName: "lock-a", propagation: Propagation.NESTED });
      const nestedB = wrapInTransaction(async () => {
        await dsB.manager.save("TransactionItem", { label: "b" });
      }, { connectionName: "lock-b", propagation: Propagation.NESTED });

      await wrapInTransaction(async () => {
        await wrapInTransaction(async () => {
          const pending = nestedA();
          await entered;
          await nestedB();
          releaseA();
          await pending;
        }, { connectionName: "lock-b" })();
      }, { connectionName: "lock-a" })();

      expect(await labels(dsB)).toEqual(["b"]);
    } finally {
      deleteDataSourceByName("lock-a");
      deleteDataSourceByName("lock-b");
      await dsA.destroy();
      await dsB.destroy();
    }
  });
});
