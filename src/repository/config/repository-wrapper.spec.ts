import { jest } from "@jest/globals";
import "reflect-metadata";
import { RepositoryWrapper } from "../..";

/**
 * Unit tests for RepositoryWrapper.findOne guard.
 *
 * Motivation: TypeORM strips `undefined` values from the `where` clause, so calls
 * like `findOne({ where: { id: undefined } })` end up with `WHERE` removed and
 * return the first row of the table - a well-known footgun that can cause
 * accidental data exposure / auth bypasses. The wrapper hardens findOne to
 * return `null` instead.
 */
interface TestEntity {
  id: number;
  name: string;
}

describe("RepositoryWrapper.findOne guard", () => {
  let superFindOneMock: jest.Mock;

  class TestRepo extends RepositoryWrapper<TestEntity> {
    constructor() {
      // bypass TypeORM's Repository constructor
      super(
        undefined as never,
        undefined as unknown as never,
        undefined as unknown as never
      );
    }
    // override metadata getter from TypeORM base
    override get metadata(): never {
      return {
        columns: [{ propertyName: "id" }, { propertyName: "name" }],
      } as unknown as never;
    }
  }

  let repo: TestRepo;

  beforeEach(() => {
    superFindOneMock = jest.fn<() => Promise<TestEntity>>().mockResolvedValue({ id: 1, name: "real" });
    repo = new TestRepo();
    const prototypeChain = Object.getPrototypeOf(RepositoryWrapper.prototype) as {
      findOne: unknown;
    };
    prototypeChain.findOne = superFindOneMock;
  });

  it("returns null when no options passed", async () => {
    expect(await repo.findOne()).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("returns null when options has no where", async () => {
    expect(await repo.findOne({})).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("returns null when where is null", async () => {
    expect(await repo.findOne({ where: null as unknown as undefined })).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("returns null when any mapped column in where is undefined", async () => {
    expect(
      await repo.findOne({ where: { id: undefined } })
    ).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("returns null when a mixed where has any undefined mapped column", async () => {
    expect(
      await repo.findOne({ where: { id: 1, name: undefined } })
    ).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("returns null when where is an array containing an undefined mapped column", async () => {
    expect(
      await repo.findOne({
        where: [{ id: undefined }, { name: "real" }],
      })
    ).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("returns null when where is an empty array", async () => {
    expect(await repo.findOne({ where: [] })).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("delegates to super.findOne when where has valid values", async () => {
    const opts = { where: { id: 1 } };
    const result = await repo.findOne(opts);
    expect(superFindOneMock).toHaveBeenCalledWith(opts);
    expect(result).toEqual({ id: 1, name: "real" });
  });

  it("delegates to super.findOne when where is an array with valid values", async () => {
    const opts = { where: [{ id: 1 }, { id: 2 }] };
    const result = await repo.findOne(opts);
    expect(superFindOneMock).toHaveBeenCalledWith(opts);
    expect(result).toEqual({ id: 1, name: "real" });
  });

  it("delegates to super.findOne when a column not in metadata is undefined (only mapped columns are checked)", async () => {
    const opts = {
      where: { id: 1, extra: undefined } as unknown as { id: number },
    };
    const result = await repo.findOne(opts);
    expect(superFindOneMock).toHaveBeenCalled();
    expect(result).toEqual({ id: 1, name: "real" });
  });

  it("returns null when where is not an object", async () => {
    expect(await repo.findOne({ where: "id = 1" as never })).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("returns null when a where array contains a non-object", async () => {
    expect(await repo.findOne({ where: [{ id: 1 }, null as never] })).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("returns null when a mapped column is null (TypeORM drops null by default)", async () => {
    expect(await repo.findOne({ where: { id: 1, name: null as never } })).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("matches columns by propertyPath when present", async () => {
    Object.defineProperty(repo, "metadata", {
      get: () => ({ columns: [{ propertyPath: "id", propertyName: "ignored" }] }),
    });
    expect(await repo.findOne({ where: { id: undefined } })).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });
});
