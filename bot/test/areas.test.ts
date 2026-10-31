import { describe, expect, it } from "vitest";
import { DISTRICTS } from "../../src/lib/eraktkosh";
import { distanceKm, editDistance, PLACES, placeByName, placeFromAddress, placeNear } from "../src/areas";

describe("areas", () => {
  it("every place uses a district the web app knows", () => {
    for (const p of PLACES) expect(DISTRICTS[p.district], p.name).toBeDefined();
  });

  it("every one of the 31 districts has at least one place", () => {
    const covered = new Set(PLACES.map((p) => p.district));
    for (const [code, name] of Object.entries(DISTRICTS)) expect(covered.has(code), name).toBe(true);
    expect(Object.keys(DISTRICTS)).toHaveLength(31);
  });

  it("location pins across the state", () => {
    expect(placeNear(12.87, 74.88)?.place.district).toBe("575"); // Mangaluru
    expect(placeNear(15.35, 75.14)?.place.district).toBe("562"); // Hubballi
    expect(placeNear(17.33, 76.83)?.place.district).toBe("721"); // Kalaburagi
  });

  it("every place sits inside Karnataka's rough box", () => {
    for (const p of PLACES) {
      expect(p.lat, p.name).toBeGreaterThan(11.5);
      expect(p.lat, p.name).toBeLessThan(18.5);
      expect(p.lng, p.name).toBeGreaterThan(74);
      expect(p.lng, p.name).toBeLessThan(78.6);
    }
  });

  it("distances look right", () => {
    const hsr = placeByName("HSR Layout")!;
    const kor = placeByName("Koramangala")!;
    const wf = placeByName("Whitefield")!;
    expect(distanceKm(hsr, kor)).toBeGreaterThan(2);
    expect(distanceKm(hsr, kor)).toBeLessThan(5);
    expect(distanceKm(hsr, wf)).toBeGreaterThan(10);
    expect(distanceKm(hsr, wf)).toBeLessThan(15);
  });

  it("location pin → nearest area and district", () => {
    expect(placeNear(12.912, 77.645)?.place.name).toBe("HSR Layout");
    expect(placeNear(12.97, 77.749)?.place.district).toBe("572");
    expect(placeNear(12.3, 76.64)?.place.district).toBe("577"); // Mysuru
    expect(placeNear(13.08, 80.27)).toBeNull(); // Chennai: outside coverage
  });

  it("bank address → area (from real eRaktKosh addresses)", () => {
    expect(placeFromAddress("154/9, Bannerghatta Road, Opposite IIM-B, Bengaluru, Bangalore Urban, Karnataka")?.name).toBe(
      "Bannerghatta Road",
    );
    expect(placeFromAddress("Plot No 2,3 & 4, 2nd Floor, off ITPL Main Road, Whitefield, Bengaluru, Bangalore Urban")?.name).toBe(
      "Whitefield",
    );
    expect(placeFromAddress("24/1, Brigade Gateway, Beside Metro, Malleswaram West, Yeshwanthpur, Bangalore Urban")?.name).toBe(
      "Yeshwanthpur",
    );
    expect(placeFromAddress("Bengaluru, Bangalore Urban, Karnataka")).toBeNull(); // too vague for a distance
    expect(placeFromAddress(null)).toBeNull();
  });

  it("edit distance handles typos and swaps", () => {
    expect(editDistance("koramangla", "koramangala")).toBe(1);
    expect(editDistance("whitfeild", "whitefield")).toBe(2);
    expect(editDistance("hebbal", "hebbal")).toBe(0);
    expect(editDistance("abcdef", "zzzzzz", 1)).toBe(2); // early exit
  });
});
