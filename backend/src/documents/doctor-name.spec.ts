import { normalizeDoctorName } from "./doctor-name";

describe("normalizeDoctorName", () => {
  it.each([
    ["Dr Berry Graham", "Berry Graham"],
    ["Dr. Berry. Graham", "Berry Graham"],
    [" Dr.Berry   Graham ", "Berry Graham"],
    ["Berry. Graham", "Berry Graham"],
    ["Dr. Naomi Heath", "Naomi Heath"],
    ["Dr. Anne O'Neil-Smith", "Anne O'Neil-Smith"],
    [null, ""],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeDoctorName(input)).toBe(expected);
  });
});
