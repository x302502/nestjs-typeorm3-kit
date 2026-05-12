import "reflect-metadata";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { IsNumber, IsPhoneNumber, IsLongerThan } from "../../src";

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
