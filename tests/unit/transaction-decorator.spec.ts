import "reflect-metadata";

jest.mock("../../src/vendor/transactional", () => {
  const actual = jest.requireActual("../../src/vendor/transactional");
  return {
    ...actual,
    Transactional: jest.fn(() => () => undefined),
  };
});

import { Transactional } from "../../src/vendor/transactional";
import { DefTransaction } from "../../src";

describe("DefTransaction", () => {
  beforeEach(() => {
    (Transactional as jest.Mock).mockClear();
    (Transactional as jest.Mock).mockReturnValue(() => undefined);
  });

  it("calls Transactional() with no options when called without args", () => {
    class Svc {
      @DefTransaction()
      doWork() {}
    }
    void new Svc();
    expect(Transactional).toHaveBeenCalledWith({});
  });

  it("forwards connectionName when provided", () => {
    class Svc {
      @DefTransaction({ connectionName: "secondary" })
      doWork() {}
    }
    void new Svc();
    expect(Transactional).toHaveBeenCalledWith(
      expect.objectContaining({ connectionName: "secondary" })
    );
  });

  it("forwards isoLevel string when provided", () => {
    class Svc {
      @DefTransaction({ isoLevel: "READ_COMMITTED" })
      doWork() {}
    }
    void new Svc();
    expect(Transactional).toHaveBeenCalledWith(
      expect.objectContaining({ isoLevel: "READ_COMMITTED" })
    );
  });

  it("omits connection/iso fields when neither provided", () => {
    class Svc {
      @DefTransaction({})
      doWork() {}
    }
    void new Svc();
    const opts = (Transactional as jest.Mock).mock.calls[0][0];
    expect(opts).not.toHaveProperty("connectionName");
    expect(opts).not.toHaveProperty("isoLevel");
  });
});
