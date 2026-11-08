import { readStored, writeStored } from "./storage";

describe("storage helpers", () => {
  it("writes, reads, and removes values", () => {
    writeStored("key", "value");
    expect(readStored("key")).toBe("value");
    writeStored("key", null);
    expect(readStored("key")).toBeNull();
  });

  it("survives storage that throws", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStored("key")).toBeNull();
    expect(() => {
      writeStored("key", "value");
    }).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
