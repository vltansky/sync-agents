import { describe, it, expect } from "vitest";
import {
  calculateSimilarity,
  getSimilarityLabel,
  formatRelativeTime,
} from "./similarity.js";

describe("calculateSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(calculateSimilarity("hello world", "hello world")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    const result = calculateSimilarity(
      "the quick brown fox",
      "xyz abc 123 456",
    );
    expect(result).toBe(0);
  });

  it("returns high similarity for similar content", () => {
    const a = "This is a test document with some content";
    const b = "This is a test document with different content";
    const result = calculateSimilarity(a, b);
    expect(result).toBeGreaterThan(0.5);
  });

  it("handles empty strings", () => {
    expect(calculateSimilarity("", "")).toBe(1);
    expect(calculateSimilarity("hello", "")).toBe(0);
    expect(calculateSimilarity("", "hello")).toBe(0);
  });

  it("ignores short words", () => {
    // "a" and "is" are too short (<=2 chars), should be ignored
    const result = calculateSimilarity("a is the", "a is the");
    expect(result).toBe(1); // only "the" counts
  });
});

describe("getSimilarityLabel", () => {
  it("returns correct labels for score ranges", () => {
    expect(getSimilarityLabel(0.95)).toBe("nearly identical");
    expect(getSimilarityLabel(0.75)).toBe("very similar");
    expect(getSimilarityLabel(0.55)).toBe("similar");
    expect(getSimilarityLabel(0.35)).toBe("somewhat different");
    expect(getSimilarityLabel(0.1)).toBe("very different");
  });
});

describe("formatRelativeTime", () => {
  it("formats recent times", () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe("just now");
  });

  it("formats minutes ago", () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe("5m ago");
  });

  it("formats hours ago", () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe("3h ago");
  });

  it("formats days ago", () => {
    const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe("2d ago");
  });

  it("formats weeks ago", () => {
    const date = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(date)).toBe("2w ago");
  });

  it("handles undefined", () => {
    expect(formatRelativeTime(undefined)).toBe("unknown");
  });
});
