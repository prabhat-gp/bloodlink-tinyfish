import { describe, expect, it } from "vitest";
import { normalise, parse } from "../src/parser";

const group = (s: string) => parse(s).group;
const base = (s: string) => parse(s).groupBase;
const place = (s: string) => parse(s).place?.name;

describe("blood group", () => {
  it.each([
    ["O-", "O-"], ["o-", "O-"], ["O -ve", "O-"], ["O-VE", "O-"], ["o−", "O-"], ["O–ve", "O-"], ["o +ve", "O+"],
    ["O+", "O+"], ["need O+ve", "O+"], ["(O-)", "O-"], ["O-ve,", "O-"], ["o neg", "O-"], ["o negative", "O-"],
    ["O Negative blood", "O-"], ["o negetive", "O-"], ["o nagative", "O-"], ["o-negative", "O-"], ["oneg", "O-"],
    ["opos", "O+"], ["o positive", "O+"], ["o positve", "O+"], ["O pos", "O+"], ["O plus", "O+"], ["O minus", "O-"],
    ["AB+", "AB+"], ["ab-ve", "AB-"], ["AB negative", "AB-"], ["abneg", "AB-"], ["ab positive", "AB+"],
    ["A+", "A+"], ["a-", "A-"], ["A negative", "A-"], ["a +ve", "A+"], ["aneg", "A-"], ["B+ve", "B+"],
    ["b-", "B-"], ["B positive", "B+"], ["b postive", "B+"], ["bneg", "B-"], ["O Rh negative", "O-"], ["O RhD+", "O+"],
    ["Oh-", "Oh-"], ["Oh+VE", "Oh+"], ["Oh-VE", "Oh-"], ["bombay negative", "Oh-"], ["bombay blood group +ve", "Oh+"],
    ["Bombay -ve", "Oh-"], ["hh positive", "Oh+"], ["🅾️-", "O-"], ["🅾 negative", "O-"], ["🅰️+", "A+"], ["🆎-", "AB-"],
    ["Need O neg platelets near HSR urgent", "O-"], ["urgent!! B+ve 2 units Koramangala", "B+"],
    ["blood group: AB+", "AB+"], ["Need A1+ blood", "A+"], ["A2B negative", "AB-"], ["a1 neg", "A-"], ["patient is O+ve, need 3 units", "O+"], ["O+ or O-", "O+"],
  ])("%s → %s", (text, expected) => expect(group(text)).toBe(expected));

  it.each([
    "need a blood bank near me", // "a" is an article
    "I need a - urgently", // spaced sign without "ve" after "a"
    "oh no, need help", // "oh" interjection
    "b-block hsr", // hyphenated address
    "my sister Anagha needs blood", // name, not "A neg"
    "blood bank in jayanagar",
    "co-op hospital",
    "in Bombay", // the city
  ])("no group in %j", (text) => expect(group(text)).toBeUndefined());

  it.each([
    ["need O blood", "O"],
    ["blood group O", "O"],
    ["blood group is B", "B"],
    ["AB blood needed", "AB"],
    ["A group donor", "A"],
    ["bombay blood group", "Oh"],
    ["need bombay blood", "Oh"],
    ["o", "O"],
    ["ab", "AB"],
  ])("letter only %j → ask sign for %s", (text, expected) => {
    expect(group(text)).toBeUndefined();
    expect(base(text)).toBe(expected);
  });
});

describe("component", () => {
  it.each([
    ["O- whole blood", "11", undefined],
    ["need prbc", "12", undefined],
    ["PCV 2 units", "12", undefined],
    ["packed red cells", "12", undefined],
    ["packed cells B+", "12", undefined],
    ["SAGM", "28", undefined],
    ["SDP platelets", "14", undefined],
    ["single donor platelet", "14", undefined],
    ["apheresis", "14", undefined],
    ["random donor platelets", "23", undefined],
    ["rdp", "23", undefined],
    ["FFP", "13", undefined],
    ["fresh frozen plasma", "13", undefined],
    ["cryo", "17", undefined],
    ["cryoprecipitate", "17", undefined],
    ["platelets", undefined, ["23", "14"]],
    ["platlets", undefined, ["23", "14"]],
    ["pletelets urgent", undefined, ["23", "14"]],
    ["plasma", undefined, ["13", "19"]],
    ["O- blood", undefined, undefined], // default (Whole Blood) is applied by the conversation, not here
  ])("%s", (text, component, choices) => {
    const p = parse(text);
    expect(p.component).toBe(component);
    expect(p.componentChoices).toEqual(choices);
  });
});

describe("place", () => {
  it.each([
    ["need O- blood near HSR", "HSR Layout"],
    ["hsr layout sector 2", "HSR Layout"],
    ["koramangala 5th block", "Koramangala"],
    ["koramangla", "Koramangala"], // typo
    ["whitfield", "Whitefield"], // typo
    ["white feild", "Whitefield"], // spacing + typo
    ["indira nagar", "Indiranagar"],
    ["indranagar", "Indiranagar"],
    ["jaynagar", "Jayanagar"],
    ["marthahalli", "Marathahalli"],
    ["e-city", "Electronic City"],
    ["electronic sity", "Electronic City"],
    ["btm 2nd stage", "BTM Layout"],
    ["silk board", "BTM Layout"],
    ["near St John's hospital", "Koramangala"],
    ["admitted in NIMHANS", "Wilson Garden"],
    ["Narayana Hrudayalaya", "Bommasandra"],
    ["Victoria hospital", "KR Market"],
    ["bannerghatta road", "Bannerghatta Road"],
    ["mysore road", "Mysore Road"], // not Mysuru city
    ["tumkur road", "Yeshwanthpur"], // not Tumkur district
    ["old airport road", "Old Airport Road"], // not the airport
    ["airport", "Bangalore Airport"],
    ["Koramangala, Bangalore", "Koramangala"], // area beats city
    ["BTM, Bangalore", "BTM Layout"],
    ["560102", "HSR Layout"],
    ["pin 560066", "Whitefield"],
    ["Mysore", "Mysuru"],
    ["tumkur", "Tumakuru"],
    ["KGF", "KGF"],
    ["Bangalore", "Bangalore"],
    ["bengaluru", "Bangalore"],
    ["560999", "Bangalore"], // unknown 560 pincode → city
  ])("%s → %s", (text, expected) => expect(place(text)).toBe(expected));

  it("district code comes with the place", () => {
    expect(parse("O- in whitefield").place?.district).toBe("572");
    expect(parse("O- in hoskote").place?.district).toBe("583");
    expect(parse("O- in mysore").place?.district).toBe("577");
  });

  it("city-level places are marked not precise", () => {
    expect(parse("bangalore").place?.precise).toBe(false);
    expect(parse("hsr").place?.precise).toBe(true);
  });

  it.each([
    ["O- in Mangalore", "575"], ["need B+ in hubli", "562"], ["belgaum", "555"], ["gulbarga", "721"],
    ["O+ blood in Mysuru", "577"], ["shimoga", "568"], ["hospet", "764"], ["bijapur", "722"], ["coorg", "576"],
    ["udupi", "569"], ["davangere", "567"], ["bellary", "565"], ["karwar", "563"], ["yadgir", "580"],
  ])("all of Karnataka: %s → district %s", (text, code) => expect(parse(text).place?.district).toBe(code));

  it("a place after in/near wins over a name earlier in the message", () => {
    expect(place("my brother Hassan needs O- in HSR")).toBe("HSR Layout");
    expect(place("Hassan")).toBe("Hassan");
    expect(place("bellary road")).toBe("Hebbal"); // Bangalore road, not Ballari
  });

  it("knows places outside coverage", () => {
    expect(parse("need O- in Chennai").outside).toBe("Chennai");
    expect(parse("O- blood in bombay").outside).toBe("Mumbai");
    expect(parse("hosur").outside).toBe("Hosur");
    expect(parse("hosur road").place?.name).toBe("Bommanahalli");
  });

  it("reports a place it couldn't find", () => {
    expect(parse("need O- near xyzpuram colony").unknownPlace).toBe("Xyzpuram Colony");
    expect(parse("need O- in urgent").unknownPlace).toBeUndefined();
  });

  it("ordinary words are never guessed as places", () => {
    for (const s of ["need blood urgently please", "my father needs platelets", "patient admitted for surgery", "anyone available"]) {
      expect(parse(s).place).toBeUndefined();
    }
  });
});

describe("intent", () => {
  it.each([
    ["need O- blood near HSR", "blood"],
    ["need blood urgently", "blood"],
    ["khoon chahiye", "blood"],
    ["my father is in hospital, need blood", "blood"],
    ["platelets", "blood"],
    ["nearest blood bank", "nearest"],
    ["blood bank near me", "nearest"],
    ["need a blood bank in Jayanagar", "nearest"],
    ["hospitals near me", "nearest"],
    ["O- blood bank near me", "blood"], // group given → search stock
    ["I want to donate blood", "donate"],
    ["where can I donate O+", "donate"],
    ["my alerts", "alerts"],
    ["stop alerts", "alerts"],
    ["help", "help"],
    ["how does it work", "help"],
    ["thanks", "thanks"],
    ["thank you so much", "thanks"],
    ["hi", "greeting"],
    ["hello there", "greeting"],
    ["HSR", "unknown"], // bare place: conversation decides
    ["asdfgh", "unknown"],
  ])("%s → %s", (text, expected) => expect(parse(text).intent).toBe(expected));
});

describe("extras", () => {
  it("urgent", () => {
    expect(parse("URGENT O- needed").urgent).toBe(true);
    expect(parse("emergency").urgent).toBe(true);
    expect(parse("O- near hsr").urgent).toBe(false);
  });
  it("near me", () => {
    expect(parse("O- near me").nearMe).toBe(true);
    expect(parse("nearest blood bank").nearMe).toBe(true);
    expect(parse("O- near hsr").nearMe).toBe(false);
  });
  it("alert me", () => {
    expect(parse("alert me when O- is available in HSR").alertMe).toBe(true);
    expect(parse("alert me when O- is available in HSR").group).toBe("O-");
  });
  it("units", () => {
    expect(parse("need 2 units O-").units).toBe(2);
    expect(parse("three bottles of B+").units).toBe(3);
    expect(parse("O- 560102").units).toBeUndefined();
  });
  it("everything at once", () => {
    const p = parse("URGENT: need 2 units O neg platelets near Koramangla 4th block");
    expect(p).toMatchObject({ intent: "blood", group: "O-", componentChoices: ["23", "14"], units: 2, urgent: true });
    expect(p.place?.name).toBe("Koramangala");
  });
  it("normalise keeps signs and drops noise", () => {
    expect(normalise("  O−ve!!  NEAR   HSR. ")).toBe("o-ve near hsr");
  });
});
