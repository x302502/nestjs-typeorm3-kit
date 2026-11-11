import "reflect-metadata";
import { DataSource, EntitySchema } from "typeorm";
import type { EntityManager } from "typeorm";
import {
  addTransactionalDataSource,
  deleteDataSourceByName,
  setupTransactionContext,
  wrapInTransaction,
} from "..";

/**
 * Every DataSource entry point (manager, repositories, raw query, query builder)
 * must join the active transaction, so a rollback discards all of their writes.
 */
describe("patched DataSource inside a transaction", () => {
  const name = "patched";
  let dataSource: DataSource;

  const labels = async () =>
    (await dataSource.query("SELECT label FROM patched_item ORDER BY id"))
      .map((row: { label: string }) => row.label);

  const rolledBack = (fn: () => Promise<unknown>) =>
    expect(wrapInTransaction(async () => {
      await fn();
      throw new Error("rollback");
    }, { connectionName: name })()).rejects.toThrow("rollback");

  beforeAll(async () => {
    setupTransactionContext();
    dataSource = new DataSource({
      type: "sqljs",
      entities: [new EntitySchema({
        name: "PatchedItem",
        tableName: "patched_item",
        columns: {
          id: { type: Number, primary: true, generated: true },
          label: { type: String },
        },
      })],
      synchronize: true,
    });
    await dataSource.initialize();
    addTransactionalDataSource({ name, dataSource });
  });

  afterAll(async () => {
    deleteDataSourceByName(name);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query("DELETE FROM patched_item");
  });

  it("exposes the transaction manager through dataSource.manager", async () => {
    const outside = dataSource.manager;
    await wrapInTransaction(async () => {
      expect(dataSource.manager).not.toBe(outside);
      expect(dataSource.manager.queryRunner?.isTransactionActive).toBe(true);
    }, { connectionName: name })();
    expect(dataSource.manager).toBe(outside);
  });

  it("rolls back writes made through dataSource.manager", async () => {
    await rolledBack(() => dataSource.manager.save("PatchedItem", { label: "manager" }));
    expect(await labels()).toEqual([]);
  });

  it("rolls back writes made through dataSource.getRepository()", async () => {
    const repository = dataSource.getRepository("PatchedItem");
    await rolledBack(() => repository.save({ label: "repository" }));
    expect(await labels()).toEqual([]);
  });

  it("rolls back writes made through dataSource.query()", async () => {
    await rolledBack(() => dataSource.query("INSERT INTO patched_item (label) VALUES ('raw')"));
    expect(await labels()).toEqual([]);
  });

  it("rolls back writes made through dataSource.createQueryBuilder()", async () => {
    await rolledBack(() => dataSource.createQueryBuilder()
      .insert().into("patched_item").values({ label: "builder" }).execute());
    await rolledBack(() => dataSource.createQueryBuilder("PatchedItem", "item")
      .insert().values({ label: "aliased" }).execute());
    expect(await labels()).toEqual([]);
  });

  it("commits writes from every entry point when the transaction succeeds", async () => {
    await wrapInTransaction(async () => {
      await dataSource.manager.save("PatchedItem", { label: "a" });
      await dataSource.getRepository("PatchedItem").save({ label: "b" });
      await dataSource.query("INSERT INTO patched_item (label) VALUES ('c')");
    }, { connectionName: name })();
    expect(await labels()).toEqual(["a", "b", "c"]);
  });

  it("keeps dataSource.transaction() working on the original manager", async () => {
    await dataSource.transaction(async (manager) => {
      await manager.save("PatchedItem", { label: "explicit" });
    });
    expect(await labels()).toEqual(["explicit"]);
  });

  it("allows replacing dataSource.manager", () => {
    const writable = dataSource as { manager: EntityManager };
    const original = writable.manager;
    const replacement = dataSource.createEntityManager();
    writable.manager = replacement;
    try {
      expect(dataSource.manager).toBe(replacement);
    } finally {
      writable.manager = original;
    }
  });
});
