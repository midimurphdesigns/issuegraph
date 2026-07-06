import { describe, expect, it } from "vitest";
import { parseIssueUrl } from "./github";

describe("parseIssueUrl", () => {
  it("parses a valid issue URL", () => {
    expect(
      parseIssueUrl("https://github.com/vercel/next.js/issues/95496"),
    ).toEqual({ owner: "vercel", repo: "next.js", number: 95496 });
  });

  it("rejects a pull request URL", () => {
    expect(() =>
      parseIssueUrl("https://github.com/vercel/next.js/pull/95496"),
    ).toThrow(/Not a GitHub issue URL/);
  });

  it("rejects a non-GitHub URL", () => {
    expect(() => parseIssueUrl("https://gitlab.com/a/b/issues/1")).toThrow(
      /Not a GitHub issue URL/,
    );
  });

  it("rejects a bare repo URL", () => {
    expect(() => parseIssueUrl("https://github.com/vercel/next.js")).toThrow(
      /Not a GitHub issue URL/,
    );
  });
});
