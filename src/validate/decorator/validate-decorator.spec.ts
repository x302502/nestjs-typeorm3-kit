import "reflect-metadata";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { IsNumber, IsPhoneNumber, IsLongerThan } from "../..";

describe("@IsNumber", () => {
  class Dto {
    @IsNumber()
    age?: number;
  }

  class RequiredDto {
    @IsNumber({ required: true })
    age!: number;
  }

  it("allows undefined when not required", async () => {
    const dto = plainToInstance(Dto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("coerces numeric strings to numbers", async () => {
    const dto = plainToInstance(Dto, { age: "42" });
    expect(typeof dto.age).toBe("number");
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("fails validation for NaN", async () => {
    const dto = plainToInstance(Dto, { age: "not-a-number" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("required variant fails when undefined", async () => {
    const dto = plainToInstance(RequiredDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("@IsPhoneNumber", () => {
  class Dto {
    @IsPhoneNumber("VN")
    phone!: string;
  }

  it("accepts valid VN phone numbers", async () => {
    const dto = plainToInstance(Dto, { phone: "+84912345678" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects invalid phone numbers", async () => {
    const dto = plainToInstance(Dto, { phone: "not-a-phone" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("@IsLongerThan", () => {
  class Dto {
    password!: string;
    @IsLongerThan("password")
    confirm!: string;
  }

  it("passes when target is strictly longer", async () => {
    const dto = plainToInstance(Dto, { password: "abc", confirm: "abcdef" });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("fails when target is not longer", async () => {
    const dto = plainToInstance(Dto, { password: "abcdef", confirm: "abc" });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe("@IsNumber edge cases", () => {
  class Dto {
    @IsNumber()
    age?: number;
  }
  class EachDto {
    @IsNumber({ each: true })
    values?: number[];
  }

  it("rejects non-numeric strings", async () => {
    const errors = await validate(plainToInstance(Dto, { age: "abc" }));
    expect(errors[0]?.constraints).toHaveProperty("isNumber");
  });

  it("allows null when not required", async () => {
    expect(await validate(plainToInstance(Dto, { age: null }))).toHaveLength(0);
  });

  it("validates and coerces each array item", async () => {
    const dto = plainToInstance(EachDto, { values: ["1", "2"] });
    expect(dto.values).toEqual([1, 2]);
    expect(await validate(dto)).toHaveLength(0);
    expect(await validate(plainToInstance(EachDto, { values: ["1", "x"] }))).toHaveLength(1);
  });
});

describe("@IsPhoneNumber edge cases", () => {
  class Dto {
    @IsPhoneNumber("VN", { message: "bad phone" })
    phone!: string;
  }

  it("coerces numbers to strings before validating", () => {
    expect(plainToInstance(Dto, { phone: 912345678 }).phone).toBe("912345678");
  });

  it("uses the custom message", async () => {
    const [error] = await validate(plainToInstance(Dto, { phone: "123" }));
    expect(error.constraints).toEqual({ isPhoneNumber: "bad phone" });
  });

  it("rejects a valid number from another region", async () => {
    expect(await validate(plainToInstance(Dto, { phone: "+12015550123" }))).toHaveLength(1);
  });
});

describe("@IsLongerThan messages", () => {
  it("uses a default message naming both properties", async () => {
    class Dto {
      short!: string;
      @IsLongerThan("short")
      long!: string;
    }
    const [error] = await validate(plainToInstance(Dto, { short: "abc", long: "ab" }));
    expect(error.constraints).toEqual({ isLongerThan: "long must be longer than short" });
  });

  it("keeps a custom message", async () => {
    class Dto {
      short!: string;
      @IsLongerThan("short", { message: "too short" })
      long!: string;
    }
    const [error] = await validate(plainToInstance(Dto, { short: "abc", long: "ab" }));
    expect(error.constraints).toEqual({ isLongerThan: "too short" });
  });

  it("fails when either value is not a string", async () => {
    class Dto {
      short!: unknown;
      @IsLongerThan("short")
      long!: unknown;
    }
    expect(await validate(plainToInstance(Dto, { short: 1, long: "abcd" }))).toHaveLength(1);
    expect(await validate(plainToInstance(Dto, { short: "a", long: 1234 }))).toHaveLength(1);
  });

  it("does not leak a default message through shared options", async () => {
    const shared = {};
    class Dto {
      a!: string;
      b!: string;
      @IsLongerThan("a", shared)
      x!: string;
      @IsLongerThan("b", shared)
      y!: string;
    }
    const errors = await validate(plainToInstance(Dto, { a: "aaa", b: "bbb", x: "x", y: "y" }));
    expect(errors.find(e => e.property === "y")?.constraints)
      .toEqual({ isLongerThan: "y must be longer than b" });
    expect(shared).toEqual({});
  });
});
