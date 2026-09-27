import { describe, expect, it } from "vitest";

import { branching, walkStory, type BranchingConfig, type StoryNode } from "./definition";

const node = (
  id: string,
  choices: [string, string | null, boolean][] = [],
  ending: StoryNode["ending"] = null,
): StoryNode => ({
  id,
  text: `Teks ${id}`,
  x: 0,
  y: 0,
  ending,
  choices: choices.map(([cid, targetId, correct]) => ({ id: cid, text: cid, targetId, correct })),
});

// start → (a: good, correct) → mid → (c: correct) → win
//       → (b: bad) → lose;   mid → (d: loop back) → start
const story: BranchingConfig = {
  startId: "start",
  scoring: "ending",
  nodes: [
    node("start", [
      ["a", "mid", true],
      ["b", "lose", false],
    ]),
    node("mid", [
      ["c", "win", true],
      ["d", "start", false],
    ]),
    node("win", [], { label: "Selamat", score: 1 }),
    node("lose", [], { label: "Gagal", score: 0.25 }),
  ],
};
const byChoices: BranchingConfig = { ...story, scoring: "choices" };

describe("walkStory", () => {
  it("follows a valid path to its last node", () => {
    expect(walkStory(story, ["a", "c"])?.end.id).toBe("win");
    expect(walkStory(story, [])?.end.id).toBe("start");
  });

  it("rejects choices that aren't on the current node or continue past an ending", () => {
    expect(walkStory(story, ["c"])).toBeNull();
    expect(walkStory(story, ["b", "a"])).toBeNull();
    expect(walkStory({ ...story, startId: "nope" }, [])).toBeNull();
  });
});

describe("branching.score", () => {
  it("scores by the ending reached by default", () => {
    expect(branching.score(story, { path: ["a", "c"] }).ratio).toBe(1);
    expect(branching.score(story, { path: ["b"] }).ratio).toBe(0.25);
  });

  it("gives nothing for a path that stops early or isn't in the graph", () => {
    expect(branching.score(story, { path: ["a"] }).ratio).toBe(0);
    expect(branching.score(story, { path: ["c"] }).ratio).toBe(0);
    expect(branching.score(story, { path: [] }).ratio).toBe(0);
  });

  it("per-choice scoring counts correct choices over choices taken", () => {
    expect(branching.score(byChoices, { path: ["a", "c"] })).toEqual({
      correct: 2,
      total: 2,
      ratio: 1,
    });
    expect(branching.score(byChoices, { path: ["b"] }).ratio).toBe(0);
    expect(branching.score(byChoices, { path: ["a", "d", "b"] })).toMatchObject({
      correct: 1,
      total: 3,
    });
  });

  it("per-choice scoring can't be padded by looping through a correct choice", () => {
    const loop = ["a", "d", "a", "d", "a", "d", "b"];
    expect(branching.score(byChoices, { path: loop })).toMatchObject({ correct: 1, total: 3 });
  });
});

describe("branching.validate", () => {
  it("accepts a complete story", () => {
    expect(branching.validate(story)).toEqual([]);
    expect(branching.validate(byChoices)).toEqual([]);
  });

  it("flags only empty texts in the default template", () => {
    const issues = branching.validate(branching.defaults());
    expect(issues.every((i) => i.path?.endsWith(".text"))).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
  });

  it("flags dead ends, loose choices, unreachable nodes and endless loops", () => {
    const broken: BranchingConfig = {
      ...story,
      nodes: [
        node("start", [
          ["a", "mid", true],
          ["b", null, false],
        ]),
        node("mid", [["d", "start", false]]), // loops forever, never ends
        node("stuck"), // dead end, unreachable
        node("win", [], { label: "Selamat", score: 1 }), // unreachable
      ],
    };
    const messages = branching.validate(broken).map((i) => i.message);
    expect(messages).toContain('Pilihan 2 di "Teks start" belum terhubung ke node tujuan.');
    expect(messages).toContain('"Teks stuck" buntu: tambahkan pilihan atau jadikan akhir cerita.');
    expect(messages).toContain('"Selamat" tidak bisa dicapai dari node awal.');
    expect(messages).toContain('Dari "Teks mid" cerita tidak pernah sampai ke akhir.');
  });

  it("needs a start that isn't an ending, and something worth scoring", () => {
    expect(branching.validate({ ...story, startId: "" }).map((i) => i.path)).toContain("startId");
    expect(branching.validate({ ...story, startId: "win" }).map((i) => i.path)).toContain(
      "nodes.2",
    );
    const zero = {
      ...story,
      nodes: story.nodes.map((n) => (n.ending ? { ...n, ending: { ...n.ending, score: 0 } } : n)),
    };
    expect(branching.validate(zero).map((i) => i.path)).toEqual(["scoring"]);
    const noneCorrect = {
      ...byChoices,
      nodes: story.nodes.map((n) => ({
        ...n,
        choices: n.choices.map((c) => ({ ...c, correct: false })),
      })),
    };
    expect(branching.validate(noneCorrect).map((i) => i.path)).toEqual(["scoring"]);
  });
});

describe("branching.stripAnswers", () => {
  it("sends the graph without correct flags, ending scores or canvas positions", () => {
    const pub = branching.stripAnswers(story, { seed: 1, shuffle: false });
    const json = JSON.stringify(pub);
    expect(json).not.toMatch(/"correct"|"score"|"x"|"y"/);
    expect(pub.nodes.find((n) => n.id === "win")?.ending).toEqual({ label: "Selamat" });
    expect(pub.nodes[0]?.choices).toEqual([
      { id: "a", text: "a", targetId: "mid" },
      { id: "b", text: "b", targetId: "lose" },
    ]);
  });

  it("leaves out unconnected choices so the player can't get stuck", () => {
    const loose = {
      ...story,
      nodes: [node("start", [["a", null, true]]), ...story.nodes.slice(1)],
    };
    expect(branching.stripAnswers(loose, { seed: 1, shuffle: true }).nodes[0]?.choices).toEqual([]);
  });
});
