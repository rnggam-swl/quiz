import { describe, expect, it } from "vitest";

import { clockOffset, measureClockOffset, median, msUntil, sampleOffset } from "./clock";
import { createMemoryHub } from "./memory";
import { parseLiveEvent, parsePresence, type LiveEvent, type PresenceMember } from "./types";

describe("clock sync", () => {
  it("takes the server time at the midpoint of the round trip", () => {
    expect(sampleOffset({ sentAt: 1000, receivedAt: 1100, serverNow: 6050 })).toBe(5000);
  });

  it("prefers the fastest trips and takes their median", () => {
    const samples = [
      { sentAt: 0, receivedAt: 100, serverNow: 5050 }, // 5000
      { sentAt: 0, receivedAt: 120, serverNow: 5070 }, // 5010
      { sentAt: 0, receivedAt: 90, serverNow: 5040 }, // 4995
      { sentAt: 0, receivedAt: 2000, serverNow: 9000 }, // slow outlier: 8000
      { sentAt: 0, receivedAt: 110, serverNow: 5060 }, // 5005
    ];
    // The three fastest (4995, 5000, 5005): the slow one can't skew it.
    expect(clockOffset(samples)).toBe(5000);
    expect(clockOffset([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it("measures with pings and ignores failed ones", async () => {
    let t = 0;
    let n = 0;
    const offset = await measureClockOffset(
      async () => {
        n++;
        if (n === 2) throw new Error("offline");
        t += 50;
        return t - 25 + 3000; // the server read its clock halfway through the trip
      },
      4,
      () => t,
    );
    expect(offset).toBe(3000);
  });

  it("counts down on the server's clock", () => {
    expect(msUntil(new Date(10_000).toISOString(), 2000, 5000)).toBe(3000);
    expect(msUntil(new Date(10_000).toISOString(), 0, 20_000)).toBe(0);
    expect(msUntil(null, 0)).toBeNull();
  });
});

describe("channel messages", () => {
  it("accepts only well-formed hints and presence", () => {
    expect(parseLiveEvent("state", { version: 4 })).toEqual({ type: "state", version: 4 });
    expect(parseLiveEvent("state", { version: -1 })).toBeNull();
    expect(parseLiveEvent("state", { version: "4" })).toBeNull();
    expect(parseLiveEvent("other", { version: 4 })).toBeNull();
    expect(parsePresence({ key: "p1", nickname: "Ani", role: "player" })).toEqual({
      key: "p1",
      nickname: "Ani",
      role: "player",
    });
    expect(parsePresence({ key: "p1", nickname: "Ani", role: "admin" })).toBeNull();
    expect(parsePresence({ key: "x".repeat(100), nickname: "Ani", role: "player" })).toBeNull();
  });
});

describe("memory hub", () => {
  it("delivers events and presence within one session", async () => {
    const hub = createMemoryHub();
    const a = hub.open("s1");
    const b = hub.open("s1");
    const other = hub.open("s2");
    const got: LiveEvent[] = [];
    const gotOther: LiveEvent[] = [];
    a.onEvent((e) => got.push(e));
    other.onEvent((e) => gotOther.push(e));
    hub.broadcast("s1", { type: "state", version: 2 });
    expect(got).toEqual([{ type: "state", version: 2 }]);
    expect(gotOther).toEqual([]);

    let members: PresenceMember[] = [];
    a.onPresence((m) => (members = m));
    b.track({ key: "p1", nickname: "Ani", role: "player" });
    expect(members.map((m) => m.key)).toEqual(["p1"]);
    b.close();
    expect(members).toEqual([]);
  });

  it("reports dropped and restored connections", async () => {
    const hub = createMemoryHub();
    const channel = hub.open("s1");
    const statuses: string[] = [];
    channel.onStatus((s) => statuses.push(s));
    await Promise.resolve();
    hub.setOnline(false);
    hub.broadcast("s1", { type: "state", version: 9 }); // lost
    hub.setOnline(true);
    expect(statuses).toEqual(["connected", "disconnected", "connected"]);
  });
});
