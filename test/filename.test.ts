import { describe, expect, it } from "vitest";
import {
  isoWithOffset,
  MAX_TITLE_LENGTH,
  noteFileName,
  sanitiseTitle,
  timestampPrefix,
} from "../src/main/filename.js";

const BELL = String.fromCharCode(7);
const UNIT_SEPARATOR = String.fromCharCode(31);
const DELETE = String.fromCharCode(127);
const TAB = String.fromCharCode(9);

describe("sanitiseTitle", () => {
  it("laat een gewone titel met rust", () => {
    expect(sanitiseTitle("Kickoff project Alpha")).toBe("Kickoff project Alpha");
  });

  it("vervangt de tekens die Windows verbiedt", () => {
    expect(sanitiseTitle("Offerte: fase 2 <concept> | 50%")).toBe(
      "Offerte- fase 2 -concept- - 50%",
    );
  });

  it("behoudt diakrieten, want die mogen gewoon", () => {
    expect(sanitiseTitle("Reünie met José Álvarez")).toBe("Reünie met José Álvarez");
  });

  it("haalt stuurtekens weg zonder de omringende tekst te raken", () => {
    expect(sanitiseTitle(`regel${BELL}een${UNIT_SEPARATOR}nog${DELETE}wat`)).toBe(
      "regeleennogwat",
    );
  });

  it("trekt witruimte samen", () => {
    expect(sanitiseTitle(`  te   veel ${TAB} ruimte  `)).toBe("te veel ruimte");
  });

  it("kapt af op tachtig tekens zonder een halve spatie te laten staan", () => {
    const result = sanitiseTitle("woord ".repeat(40));
    expect(result.length).toBeLessThanOrEqual(MAX_TITLE_LENGTH);
    expect(result).toBe(result.trimEnd());
  });

  it("laat geen punt of spatie aan het eind staan", () => {
    // Windows kapt die stil af, waarna het bestand niet meer te vinden is.
    expect(sanitiseTitle("Overleg maandag...")).toBe("Overleg maandag");
    expect(sanitiseTitle("Overleg maandag ")).toBe("Overleg maandag");
  });

  it("ontwijkt namen die Windows voor apparaten gebruikt", () => {
    expect(sanitiseTitle("CON")).toBe("CON_");
    expect(sanitiseTitle("com1")).toBe("com1_");
    expect(sanitiseTitle("console")).toBe("console");
  });

  it("valt terug op een naam als er niets bruikbaars overblijft", () => {
    expect(sanitiseTitle("   ")).toBe("Zonder titel");
    expect(sanitiseTitle("...")).toBe("Zonder titel");
  });
});

describe("bestandsnaam", () => {
  it("zet het tijdstip vooraan zodat het chronologisch sorteert", () => {
    const when = new Date(2026, 6, 25, 14, 32);
    expect(timestampPrefix(when)).toBe("2026-07-25 1432");
    expect(noteFileName("Kickoff project Alpha", when)).toBe(
      "2026-07-25 1432 Kickoff project Alpha.md",
    );
  });

  it("vult uren en minuten aan tot twee cijfers", () => {
    expect(timestampPrefix(new Date(2026, 0, 3, 9, 5))).toBe("2026-01-03 0905");
  });
});

describe("isoWithOffset", () => {
  it("schrijft een tijdzone-offset en geen Z", () => {
    const result = isoWithOffset(new Date(2026, 6, 25, 14, 32, 0));
    expect(result).toMatch(/^2026-07-25T14:32:00[+-]\d{2}:\d{2}$/);
  });
});
