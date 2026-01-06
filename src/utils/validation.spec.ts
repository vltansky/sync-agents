import { describe, it, expect } from "vitest";
import { validatePathSafe, isValidPathSafe } from "./validation.js";

describe("path validation", () => {
  describe("validatePathSafe", () => {
    it("should allow valid paths within root", () => {
      expect(() =>
        validatePathSafe("/root", "/root/subdir/file.txt"),
      ).not.toThrow();
    });

    it("should allow paths at root level", () => {
      expect(() => validatePathSafe("/root", "/root/file.txt")).not.toThrow();
    });

    it("should throw on path traversal with ..", () => {
      expect(() => validatePathSafe("/root", "/root/../etc/passwd")).toThrow(
        "Path traversal detected",
      );
    });

    it("should throw on path traversal with multiple ..", () => {
      expect(() =>
        validatePathSafe("/root", "/root/subdir/../../etc/passwd"),
      ).toThrow("Path traversal detected");
    });

    it("should throw on absolute path escaping root", () => {
      expect(() => validatePathSafe("/root", "/etc/passwd")).toThrow(
        "Path traversal detected",
      );
    });

    it("should normalize paths before checking", () => {
      expect(() =>
        validatePathSafe("/root", "/root/sub/../sub/file.txt"),
      ).not.toThrow();
    });
  });

  describe("isValidPathSafe", () => {
    it("should return true for valid paths", () => {
      expect(isValidPathSafe("/root", "/root/subdir/file.txt")).toBe(true);
    });

    it("should return false for path traversal", () => {
      expect(isValidPathSafe("/root", "/root/../etc/passwd")).toBe(false);
    });

    it("should return false for absolute paths escaping root", () => {
      expect(isValidPathSafe("/root", "/etc/passwd")).toBe(false);
    });
  });
});
