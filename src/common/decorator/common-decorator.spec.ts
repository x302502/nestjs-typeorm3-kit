import "reflect-metadata";
import { Emoji, NewClass } from "../..";

describe("@Emoji", () => {
  class Flavor {
    @Emoji()
    name: string;
  }

  it("wraps every assigned value", () => {
    const flavor = new Flavor();
    flavor.name = "vanilla";
    expect(flavor.name).toBe("🍦 vanilla 🍦");
    flavor.name = "mint";
    expect(flavor.name).toBe("🍦 mint 🍦");
  });

  it("defines an enumerable, configurable accessor", () => {
    const descriptor = Object.getOwnPropertyDescriptor(Flavor.prototype, "name");
    expect(descriptor).toMatchObject({ enumerable: true, configurable: true });
    expect(typeof descriptor?.get).toBe("function");
    expect(typeof descriptor?.set).toBe("function");
  });
});

describe("@NewClass", () => {
  @NewClass()
  class Point {
    constructor(readonly x: number, readonly y: number) {}
    sum() {
      return this.x + this.y;
    }
  }

  it("constructs instances with the given arguments", () => {
    const point = new Point(2, 3);
    expect(point.x).toBe(2);
    expect(point.y).toBe(3);
    expect(point.sum()).toBe(5);
  });

  it("keeps instanceof working", () => {
    expect(new Point(1, 1)).toBeInstanceOf(Point);
  });
});
