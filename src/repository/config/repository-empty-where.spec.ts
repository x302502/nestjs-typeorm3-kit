import "reflect-metadata";
import { DataSource, EntitySchema } from "typeorm";
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
});
