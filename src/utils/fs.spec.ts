import { describe, it, expect } from "vitest";
import { hashContent } from "./fs.js";

describe("fs utilities", () => {
  describe("hashContent", () => {
    it("should generate consistent hashes for same content", () => {
      const content = "test content";
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);
      expect(hash1).toBe(hash2);
    });

    it("should generate different hashes for different content", () => {
      const hash1 = hashContent("content 1");
      const hash2 = hashContent("content 2");
      expect(hash1).not.toBe(hash2);
    });

    it("should handle empty strings", () => {
      const hash = hashContent("");
      expect(hash).toBeDefined();
      expect(typeof hash).toBe("string");
      expect(hash.length).toBe(40);
    });
  });
});
