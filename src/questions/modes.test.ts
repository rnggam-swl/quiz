import { describe, expect, it } from "vitest";

import { modeNote, modeSupport, typesForMode, unsupportedModes } from "./modes";
import { QUESTION_TYPES } from "./registry";
import { SESSION_MODES } from "./types";

describe("capability matrix", () => {
  it("every type can be practised", () => {
    for (const type of QUESTION_TYPES) expect(modeSupport(type, "practice")).toBe("ok");
  });

  it("explains every flagged mode, so the editor can say why", () => {
    for (const type of QUESTION_TYPES) {
      for (const mode of SESSION_MODES) {
        if (modeSupport(type, mode) === "warn")
          expect(modeNote(type, mode), `${type}/${mode}`).toBeTruthy();
      }
    }
  });

  it("matches the documented matrix for the P3 types", () => {
    expect(typesForMode("battle_buzzer")).toEqual(
      expect.arrayContaining(["multiple_choice", "true_false", "odd_one_out"]),
    );
    expect(typesForMode("battle_buzzer")).not.toContain("sequencing");
    expect(typesForMode("battle_royale")).not.toContain("hotspot");
    expect(modeSupport("branching", "exam")).toBe("warn");
    expect(unsupportedModes("branching")).toEqual(["Live", "Rebutan", "Royale"]);
    expect(unsupportedModes("multiple_choice")).toEqual([]);
  });
});
