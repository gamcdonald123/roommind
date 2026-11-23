import { describe, expect, it } from "vitest";
import type { RoomLiveData } from "../types";
import { allRoomsMessage, allRoomsValueOf } from "./override";

const live = (over: Partial<RoomLiveData> = {}): RoomLiveData =>
  ({
    override_active: false,
    override_type: null,
    override_until: null,
    ...over,
  }) as RoomLiveData;

const held = (type: RoomLiveData["override_type"], until: number | null = null) =>
  live({ override_active: true, override_type: type, override_until: until });

describe("allRoomsValueOf", () => {
  it("is schedule when no room has an override", () => {
    expect(allRoomsValueOf([live(), live()])).toBe("schedule");
  });

  it("names the choice every room holds without end", () => {
    expect(allRoomsValueOf([held("boost"), held("boost")])).toBe("comfort");
    expect(allRoomsValueOf([held("eco"), held("eco")])).toBe("eco");
    expect(allRoomsValueOf([held("frost"), held("frost")])).toBe("frost");
  });

  it("is null when rooms differ", () => {
    expect(allRoomsValueOf([held("eco"), live()])).toBeNull();
  });

  it("is null for a timed or custom override", () => {
    expect(allRoomsValueOf([held("eco", 1_900_000_000), held("eco")])).toBeNull();
    expect(allRoomsValueOf([held("custom"), held("custom")])).toBeNull();
  });

  it("is null without rooms", () => {
    expect(allRoomsValueOf([])).toBeNull();
  });
});

describe("allRoomsMessage", () => {
  it("sends the choice to set_all", () => {
    expect(allRoomsMessage("frost")).toEqual({ type: "roommind/override/set_all", mode: "frost" });
  });
});
