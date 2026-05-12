import "reflect-metadata";
import { RepositoryWrapper } from "../../src";

/**
 * Unit tests for RepositoryWrapper.findOne guard.
 *
 * Motivation: TypeORM strips `undefined` values from the `where` clause, so calls
 * like `findOne({ where: { id: undefined } })` end up with `WHERE` removed and
 * return the first row of the table - a well-known footgun that can cause
 * accidental data exposure / auth bypasses. The wrapper hardens findOne to
 * return `null` instead.
 */
describe("RepositoryWrapper.findOne guard", () => {
  let superFindOneMock: jest.Mock;

  class TestRepo extends RepositoryWrapper<any> {
    constructor() {
      // bypass TypeORM's Repository constructor
      super(undefined as any, undefined as any, undefined as any);
    }
    // override metadata getter from TypeORM base
    get metadata(): any {
      return {
        columns: [{ propertyName: "id" }, { propertyName: "name" }],
      };
    }
  }

  let repo: TestRepo;

  beforeEach(() => {
    superFindOneMock = jest.fn().mockResolvedValue({ id: 1, name: "real" });
    repo = new TestRepo();
    // Patch the super findOne on the prototype chain used by super.findOne(...)
    (Object.getPrototypeOf(RepositoryWrapper.prototype) as any).findOne =
      superFindOneMock;
  });

  it("returns null when no options passed", async () => {
    expect(await repo.findOne()).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("returns null when options has no where", async () => {
    expect(await repo.findOne({} as any)).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("returns null when where is null", async () => {
    expect(await repo.findOne({ where: null as any })).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("returns null when any mapped column in where is undefined", async () => {
    expect(
      await repo.findOne({ where: { id: undefined } as any })
    ).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("returns null when a mixed where has any undefined mapped column", async () => {
    expect(
      await repo.findOne({ where: { id: 1, name: undefined } as any })
    ).toBeNull();
    expect(superFindOneMock).not.toHaveBeenCalled();
  });

  it("delegates to super.findOne when where has valid values", async () => {
    const opts = { where: { id: 1 } };
    const result = await repo.findOne(opts as any);
    expect(superFindOneMock).toHaveBeenCalledWith(opts);
    expect(result).toEqual({ id: 1, name: "real" });
  });

  it("delegates to super.findOne when a column not in metadata is undefined (only mapped columns are checked)", async () => {
    const opts = { where: { id: 1, extra: undefined } };
    const result = await repo.findOne(opts as any);
    expect(superFindOneMock).toHaveBeenCalled();
    expect(result).toEqual({ id: 1, name: "real" });
  });
});
