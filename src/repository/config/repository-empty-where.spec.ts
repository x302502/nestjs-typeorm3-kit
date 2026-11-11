import "reflect-metadata";
import { DataSource, EntityNotFoundError, EntitySchema, IsNull } from "typeorm";
import { RepositoryWrapper } from "../..";

describe("RepositoryWrapper.findOne with an empty filter", () => {
  it("does not return the first row for an empty where, but keeps valid lookups", async () => {
    const entity = new EntitySchema({
      name: "FilteredItem",
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

    try {
      await dataSource.manager.save("FilteredItem", { label: "private" });
      const repository = new RepositoryWrapper<{ id: number; label: string }>(
        "FilteredItem",
        dataSource.manager
      );

      expect(await repository.findOne({ where: {} })).toBeNull();
      expect(await repository.findOne({ where: [{}] })).toBeNull();
      expect(await repository.findOne({ where: [{}, { id: 1 }] })).toBeNull();
      expect(await repository.findOne({ where: { id: 1 } })).toMatchObject({
        id: 1,
        label: "private",
      });
    } finally {
      await dataSource.destroy();
    }
  });

  it("does not expose a row when a relation filter has no effective predicate", async () => {
    const owner = new EntitySchema({
      name: "FilteredOwner",
      columns: {
        id: { type: Number, primary: true, generated: true },
        name: { type: String },
      },
    });
    const item = new EntitySchema<{ id: number; label: string; owner: { id: number } }>({
      name: "OwnedItem",
      columns: {
        id: { type: Number, primary: true, generated: true },
        label: { type: String },
      },
      relations: {
        owner: { type: "many-to-one", target: "FilteredOwner", joinColumn: true },
      },
    });
    const dataSource = new DataSource({
      type: "sqljs",
      entities: [owner, item],
      synchronize: true,
    });
    await dataSource.initialize();

    try {
      const savedOwner = await dataSource.manager.save("FilteredOwner", { name: "owner" });
      await dataSource.manager.save("OwnedItem", {
        label: "private",
        owner: savedOwner,
      });
      const repository = new RepositoryWrapper<{
        id: number;
        label: string;
        owner: { id: number };
      }>("OwnedItem", dataSource.manager);

      expect(await repository.findOne({ where: { owner: { id: undefined } } }))
        .toBeNull();
      expect(await repository.findOne({ where: { owner: {} } })).toBeNull();
      expect(await repository.findOne({
        where: [{ owner: { id: 1 } }, { owner: {} }],
      })).toBeNull();
      expect(await repository.findOne({ where: { owner: { id: 1 } } }))
        .toMatchObject({ label: "private" });
    } finally {
      await dataSource.destroy();
    }
  });

  it("checks embedded fields without blocking a populated embedded lookup", async () => {
    const address = new EntitySchema<{ postcode: string }>({
      name: "FilteredAddress",
      columns: { postcode: { type: String } },
    });
    const person = new EntitySchema<{
      id: number;
      address: { postcode: string };
    }>({
      name: "FilteredPerson",
      columns: { id: { type: Number, primary: true, generated: true } },
      embeddeds: { address: { schema: address, prefix: "address_" } },
    });
    const dataSource = new DataSource({
      type: "sqljs",
      entities: [person],
      synchronize: true,
    });
    await dataSource.initialize();
    try {
      await dataSource.manager.save("FilteredPerson", {
        address: { postcode: "10001" },
      });
      const repository = new RepositoryWrapper<{
        id: number;
        address: { postcode: string };
      }>("FilteredPerson", dataSource.manager);

      expect(await repository.findOne({ where: { address: { postcode: undefined } } }))
        .toBeNull();
      expect(await repository.findOne({ where: { address: {} } })).toBeNull();
      expect(await repository.findOne({ where: { address: { postcode: "10001" } } }))
        .toMatchObject({ address: { postcode: "10001" } });
    } finally {
      await dataSource.destroy();
    }
  });

  it("guards findOneBy and the *OrFail variants like findOne", async () => {
    const entity = new EntitySchema({
      name: "GuardedItem",
      columns: {
        id: { type: Number, primary: true, generated: true },
        label: { type: String },
      },
    });
    const dataSource = new DataSource({ type: "sqljs", entities: [entity], synchronize: true });
    await dataSource.initialize();

    try {
      await dataSource.manager.save("GuardedItem", { label: "admin" });
      const repository = new RepositoryWrapper<{ id: number; label: string }>(
        "GuardedItem",
        dataSource.manager
      );

      expect(await repository.findOneBy({ id: undefined })).toBeNull();
      expect(await repository.findOneBy({})).toBeNull();
      expect(await repository.findOneBy([{ id: undefined }, { id: 1 }])).toBeNull();
      await expect(repository.findOneOrFail({ where: { id: undefined } }))
        .rejects.toBeInstanceOf(EntityNotFoundError);
      await expect(repository.findOneOrFail({})).rejects.toBeInstanceOf(EntityNotFoundError);
      await expect(repository.findOneByOrFail({ id: undefined }))
        .rejects.toBeInstanceOf(EntityNotFoundError);

      expect(await repository.findOneBy({ id: 1 })).toMatchObject({ label: "admin" });
      expect(await repository.findOneOrFail({ where: { id: 1 } })).toMatchObject({ label: "admin" });
      expect(await repository.findOneByOrFail({ label: "admin" })).toMatchObject({ id: 1 });
      await expect(repository.findOneByOrFail({ id: 2 })).rejects.toBeInstanceOf(EntityNotFoundError);
    } finally {
      await dataSource.destroy();
    }
  });

  describe("null filter values", () => {
    const schema = () => new EntitySchema<{ id: number; label: string; ownerId: number | null }>({
      name: "NullableItem",
      columns: {
        id: { type: Number, primary: true, generated: true },
        label: { type: String },
        ownerId: { type: Number, nullable: true },
      },
    });

    const withRepository = async (
      invalidWhereValuesBehavior: object | undefined,
      run: (repository: RepositoryWrapper<{ id: number; label: string; ownerId: number | null }>) => Promise<void>
    ) => {
      const dataSource = new DataSource({
        type: "sqljs",
        entities: [schema()],
        synchronize: true,
        ...(invalidWhereValuesBehavior ? { invalidWhereValuesBehavior } : {}),
      });
      await dataSource.initialize();
      try {
        await dataSource.manager.save("NullableItem", [
          { label: "admin", ownerId: 7 },
          { label: "orphan", ownerId: null },
        ]);
        await run(new RepositoryWrapper("NullableItem", dataSource.manager));
      } finally {
        await dataSource.destroy();
      }
    };

    it("blocks null, which TypeORM ignores by default, in every single-row lookup", async () => {
      await withRepository(undefined, async repository => {
        expect(await repository.findOne({ where: { ownerId: null as never } })).toBeNull();
        expect(await repository.findOneBy({ ownerId: null as never })).toBeNull();
        expect(await repository.findOneBy({ label: "admin", ownerId: null as never })).toBeNull();
        await expect(repository.findOneOrFail({ where: { ownerId: null as never } }))
          .rejects.toBeInstanceOf(EntityNotFoundError);
        await expect(repository.findOneByOrFail({ ownerId: null as never }))
          .rejects.toBeInstanceOf(EntityNotFoundError);
        expect(await repository.findOneBy({ ownerId: IsNull() })).toMatchObject({ label: "orphan" });
      });
    });

    it("lets null through when the DataSource maps it to SQL NULL", async () => {
      await withRepository({ null: "sql-null" }, async repository => {
        expect(await repository.findOneBy({ ownerId: null as never })).toMatchObject({ label: "orphan" });
      });
    });

    it("leaves throwing to TypeORM when the DataSource is configured to throw", async () => {
      await withRepository({ undefined: "throw", null: "throw" }, async repository => {
        await expect(repository.findOneBy({ ownerId: null as never })).rejects.toThrow(/Null value encountered/);
        await expect(repository.findOneBy({ id: undefined })).rejects.toThrow(/Undefined value encountered/);
        // An empty filter is not covered by TypeORM's option, so the guard still applies.
        expect(await repository.findOneBy({})).toBeNull();
      });
    });
  });
});
