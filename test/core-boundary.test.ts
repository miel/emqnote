import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { globSync } from "node:fs";

describe("@emqnote/core import boundary", () => {
  it("contains no platform-specific imports", () => {
    const forbidden = /(?:from\s+|import\s*\()["'](?:node:|electron|@capacitor\/)/;
    const violations = globSync("packages/core/src/**/*.ts").flatMap((file) => {
      const lines = readFileSync(file, "utf8").split("\n");
      return lines.flatMap((line, index) =>
        forbidden.test(line) ? [`${relative(process.cwd(), file)}:${index + 1}`] : [],
      );
    });

    expect(violations).toEqual([]);
  });

  it("does not reach back into the desktop source tree", () => {
    const violations = globSync("packages/core/src/**/*.ts").filter((file) =>
      /["'](?:\.\.\/)+\.\.\/src\//.test(readFileSync(file, "utf8")),
    );

    expect(violations).toEqual([]);
  });
});
