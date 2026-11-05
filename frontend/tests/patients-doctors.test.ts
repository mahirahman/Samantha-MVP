import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "@/lib/supabase";
import { createPatient, getPatientCreationErrorMessage, validateNewPatientInput, emptyNewPatientInput, getPatientById, listPatients, matchPatientIdentifiers } from "@/lib/patients";
import { cleanDoctorName, listDoctors, matchDoctorByName } from "@/lib/doctors";
import { queryMock } from "./supabase-mock";

vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));
const patient = { id: "p1", full_name: "Test Patient", date_of_birth: "2000-01-02" };
let from: ReturnType<typeof vi.fn>;
beforeEach(() => {
  from = vi.fn();
  vi.mocked(getSupabaseClient).mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseClient>);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("patients", () => {
  it("lists patients, including an empty result", async () => {
    const { query, response } = queryMock([patient]); from.mockReturnValue(query);
    expect(await listPatients()).toEqual([{ id: "p1", fullName: "Test Patient", dateOfBirth: "2000-01-02" }]);
    response.data = [];
    expect(await listPatients()).toEqual([]);
  });
  it.each([
    [[patient], [patient], 2], [[patient], [], 1], [[], [patient], 1],
    [[patient], [{ ...patient, id: "different" }], null], [[], [], null],
  ])("scores matching identifiers and rejects conflicting patients", async (byName, byDob, count) => {
    from.mockReturnValueOnce(queryMock(byName).query).mockReturnValueOnce(queryMock(byDob).query);
    const result = await matchPatientIdentifiers(" Test Patient ", "2000-01-02");
    if (count === null) expect(result).toBeNull();
    else expect(result).toMatchObject({ matchedIdentifierCount: count, totalIdentifiers: 2 });
  });
  it("does not query for blank identifiers", async () => {
    expect(await matchPatientIdentifiers(" ", "")).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
  it("propagates lookup errors", async () => {
    from.mockReturnValue(queryMock(null, new Error("database unavailable")).query);
    await expect(matchPatientIdentifiers("Patient", "")).rejects.toThrow("database unavailable");
    await expect(listPatients()).rejects.toThrow("database unavailable");
  });
  it("creates a trimmed patient and leaves absent optional fields null", async () => {
    const { query } = queryMock(patient); from.mockReturnValue(query);
    const input = { ...emptyNewPatientInput(), firstName: " Test ", middleName: " A ", lastName: " Patient ", dateOfBirth: "2000-01-02" };
    await createPatient(input);
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ full_name: "Test A Patient", first_name: "Test", email: null }));
    expect(emptyNewPatientInput()).not.toBe(emptyNewPatientInput());
  });
  it("loads full records with defaults for missing fields", async () => {
    from.mockReturnValue(queryMock(patient).query);
    expect(await getPatientById("p1")).toMatchObject({ fullName: "Test Patient", medicareNumber: "", email: "" });
  });
});

describe("doctors", () => {
  const doctors = [{ id: "d1", fullName: "Dr Sarah Jenkins" }, { id: "d2", fullName: "Dr Michael Chang" }];
  it.each(["Dr. Sarah Jenkins", "Jenkins, Sarah", "Dr S Jenkins", "Dr Jenkins"])("matches %s", (name) => {
    expect(matchDoctorByName(name, doctors)?.id).toBe("d1");
  });
  it("rejects unknown, blank and ambiguous surname matches", () => {
    expect(matchDoctorByName("", doctors)).toBeNull();
    expect(matchDoctorByName("Dr Unknown", doctors)).toBeNull();
    expect(matchDoctorByName("Jenkins", doctors)).toBeNull();
    expect(matchDoctorByName("Dr Jenkins", [...doctors, { id: "d3", fullName: "Dr Sam Jenkins" }])).toBeNull();
    expect(cleanDoctorName("Prof. Sarah, Jenkins")).toBe("sarah jenkins");
  });
  it("filters inactive doctors and supplies a fallback if unavailable", async () => {
    const { query, response } = queryMock([{ id: "d1", full_name: "Dr Test", active: true }, { id: "d2", full_name: "Inactive", active: false }]);
    from.mockReturnValue(query);
    expect(await listDoctors()).toHaveLength(1);
    response.data = [];
    expect((await listDoctors()).length).toBeGreaterThan(0);
    response.error = new Error("offline");
    expect((await listDoctors()).length).toBeGreaterThan(0);
  });
});


describe("patient creation feedback", () => {
  it("lists missing required fields without submitting to the database", async () => {
    const input = emptyNewPatientInput();
    expect(validateNewPatientInput(input)).toEqual({ firstName: "First name is required.", lastName: "Last name is required.", dateOfBirth: "Date of birth is required." });
    await expect(createPatient(input)).rejects.toThrow("Date of birth is required.");
    expect(from).not.toHaveBeenCalled();
  });
  it.each(["2025-02-29", "2000-13-01", "not-a-date"])("rejects invalid date %s", (dateOfBirth) => {
    expect(validateNewPatientInput({ ...emptyNewPatientInput(), firstName: "Test", lastName: "Patient", dateOfBirth }).dateOfBirth).toBe("Enter a valid date of birth.");
  });
  it("accepts a valid leap day", () => {
    expect(validateNewPatientInput({ ...emptyNewPatientInput(), firstName: "Test", lastName: "Patient", dateOfBirth: "2000-02-29" })).toEqual({});
  });
  it.each([
    [{ code: "23502", message: 'null value in column "date_of_birth" violates not-null constraint' }, "Date of birth is required."],
    [{ code: "23505" }, "already exists"],
    [{ code: "42501" }, "permission"],
    [{ code: "22008" }, "valid date of birth"],
    [{ message: "Failed to fetch" }, "connection"],
    [{ message: "Specific reason from database" }, "Specific reason from database"],
  ])("explains database failures", (error, expected) => {
    expect(getPatientCreationErrorMessage(error)).toContain(expected);
  });
  it("turns Supabase's plain-object errors into readable errors", async () => {
    from.mockReturnValue(queryMock(null, { code: "23505", message: "duplicate key" }).query);
    await expect(createPatient({ ...emptyNewPatientInput(), firstName: "Test", lastName: "Patient", dateOfBirth: "2000-01-01" })).rejects.toThrow("already exists");
  });
});
