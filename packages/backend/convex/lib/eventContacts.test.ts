import { describe, expect, it } from "vitest";
import { buildBandContacts } from "./eventContacts";

describe("buildBandContacts", () => {
  const riderWithContact = {
    contactName: "Day-of Person",
    contactEmail: "dayof@example.com",
    contactPhone: "6505550100",
  };

  it("prefers the profile main contact over the rider contact", () => {
    const [row] = buildBandContacts([
      {
        bandName: "The Band",
        rider: riderWithContact,
        contact: { name: "Booking Person", email: "booking@example.com", phone: "6505550199" },
      },
    ]);
    expect(row.person).toBe("Booking Person");
    expect(row.contact).toBe("booking@example.com · 6505550199");
  });

  it("falls back to the rider contact when the profile has none", () => {
    const [row] = buildBandContacts([
      { bandName: "The Band", rider: riderWithContact },
    ]);
    expect(row.person).toBe("Day-of Person");
    expect(row.contact).toBe("dayof@example.com · 6505550100");
  });

  it("mixes profile name with rider contact when the profile only has a name", () => {
    const [row] = buildBandContacts([
      {
        bandName: "The Band",
        rider: riderWithContact,
        contact: { name: "Booking Person" },
      },
    ]);
    expect(row.person).toBe("Booking Person");
    expect(row.contact).toBe("dayof@example.com · 6505550100");
  });

  it("omits a band with neither contact", () => {
    expect(
      buildBandContacts([{ bandName: "The Band", rider: null }]),
    ).toEqual([]);
  });
});
