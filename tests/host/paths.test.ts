import { describe, expect, it } from "bun:test";
import { paths } from "../../src/host/paths.js";

describe("paths", () => {
  it("homeDir is non-empty", () => {
    expect(paths.homeDir().length).toBeGreaterThan(0);
  });

  it("tmpDir is non-empty", () => {
    expect(paths.tmpDir().length).toBeGreaterThan(0);
  });

  it("exeName appends .exe on win32, untouched elsewhere", () => {
    const result = paths.exeName("foo");
    if (process.platform === "win32") {
      expect(result).toBe("foo.exe");
    } else {
      expect(result).toBe("foo");
    }
  });

  it("configDir always includes the scope segment", () => {
    expect(paths.configDir("vibecontrols")).toContain("vibecontrols");
  });

  it("dataDir always includes the scope segment", () => {
    expect(paths.dataDir("vibecontrols")).toContain("vibecontrols");
  });

  it("cacheDir always includes the scope segment", () => {
    expect(paths.cacheDir("vibecontrols")).toContain("vibecontrols");
  });
});
