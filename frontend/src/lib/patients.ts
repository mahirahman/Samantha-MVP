import { getSupabaseClient } from "./supabase";

export interface PatientRecord {
  id: string;
  fullName: string;
  dateOfBirth: string;
}

interface PatientRow {
  id: string;
  full_name: string;
  date_of_birth: string;
}

function toPatientRecord(row: PatientRow): PatientRecord {
  return { id: row.id, fullName: row.full_name, dateOfBirth: row.date_of_birth };
}

export async function listPatients(): Promise<PatientRecord[]> {
  const { data, error } = await getSupabaseClient()
    .from("patients")
    .select("id, full_name, date_of_birth")
    .order("full_name", { ascending: true });

  if (error) throw error;

  return ((data as PatientRow[] | null) ?? []).map(toPatientRecord);
}

export interface PatientMatch {
  patient: PatientRecord;
  matchedIdentifierCount: number;
  totalIdentifiers: number;
}

const totalIdentifierCount = 2; // name + date of birth

/**
 * Looks up candidate patients independently by name and by date of birth,
 * then scores how many identifiers (name, date of birth) match the single
 * best candidate. A document is considered identified once at least one
 * identifier matches; the count drives the "N identifier(s) verified"
 * confidence indicator shown to staff.
 *
 * If name and date of birth each match a *different* patient, the result is
 * ambiguous and treated as no match, so staff must resolve it manually
 * rather than risk filing against the wrong patient.
 */
export async function matchPatientIdentifiers(
  fullName: string,
  dateOfBirth: string,
): Promise<PatientMatch | null> {
  const trimmedName = (fullName ?? "").trim();
  const trimmedDob = (dateOfBirth ?? "").trim();
  if (!trimmedName && !trimmedDob) return null;

  const client = getSupabaseClient();
  const [nameResult, dobResult] = await Promise.all([
    trimmedName
      ? client.from("patients").select("id, full_name, date_of_birth").ilike("full_name", trimmedName)
      : Promise.resolve({ data: [] as PatientRow[], error: null }),
    trimmedDob
      ? client.from("patients").select("id, full_name, date_of_birth").eq("date_of_birth", trimmedDob)
      : Promise.resolve({ data: [] as PatientRow[], error: null }),
  ]);

  if (nameResult.error) throw nameResult.error;
  if (dobResult.error) throw dobResult.error;

  const nameMatches = (nameResult.data as PatientRow[] | null) ?? [];
  const dobMatches = (dobResult.data as PatientRow[] | null) ?? [];

  const bothMatch = nameMatches.find((nameRow) =>
    dobMatches.some((dobRow) => dobRow.id === nameRow.id),
  );
  if (bothMatch) {
    return { patient: toPatientRecord(bothMatch), matchedIdentifierCount: 2, totalIdentifiers: totalIdentifierCount };
  }

  // Name and DOB each matched, but to different patients - ambiguous.
  if (nameMatches.length > 0 && dobMatches.length > 0) return null;

  if (nameMatches.length > 0) {
    return { patient: toPatientRecord(nameMatches[0]), matchedIdentifierCount: 1, totalIdentifiers: totalIdentifierCount };
  }
  if (dobMatches.length > 0) {
    return { patient: toPatientRecord(dobMatches[0]), matchedIdentifierCount: 1, totalIdentifiers: totalIdentifierCount };
  }

  return null;
}

export interface FullPatientRecord {
  id: string;
  medicalRecordNumber: string;
  fullName: string;
  dateOfBirth: string;
  title: string;
  firstName: string;
  lastName: string;
  middleName: string;
  preferredName: string;
  gender: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  postalAddress: string;
  postalCity: string;
  postalPostcode: string;
  medicareNumber: string;
  medicareIrn: string;
  medicareExpiry: string;
  mobileNumber: string;
  homePhone: string;
  workPhone: string;
  email: string;
  pensionTypeCode: string;
  pensionNumber: string;
  pensionExpiry: string;
  dvaTypeCode: string;
  dvaNumber: string;
  externalId: string;
  createdAt: string;
}

const fullPatientColumns =
  "id, medical_record_number, full_name, date_of_birth, title, first_name, last_name, " +
  "middle_name, preferred_name, gender, address_line1, address_line2, city, postcode, " +
  "postal_address, postal_city, postal_postcode, medicare_number, medicare_irn, " +
  "medicare_expiry, mobile_number, home_phone, work_phone, email, pension_type_code, " +
  "pension_number, pension_expiry, dva_type_code, dva_number, external_id, created_at";

function toFullPatientRecord(row: Record<string, unknown>): FullPatientRecord {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    id: text(row.id),
    medicalRecordNumber: text(row.medical_record_number),
    fullName: text(row.full_name),
    dateOfBirth: text(row.date_of_birth),
    title: text(row.title),
    firstName: text(row.first_name),
    lastName: text(row.last_name),
    middleName: text(row.middle_name),
    preferredName: text(row.preferred_name),
    gender: text(row.gender),
    addressLine1: text(row.address_line1),
    addressLine2: text(row.address_line2),
    city: text(row.city),
    postcode: text(row.postcode),
    postalAddress: text(row.postal_address),
    postalCity: text(row.postal_city),
    postalPostcode: text(row.postal_postcode),
    medicareNumber: text(row.medicare_number),
    medicareIrn: text(row.medicare_irn),
    medicareExpiry: text(row.medicare_expiry),
    mobileNumber: text(row.mobile_number),
    homePhone: text(row.home_phone),
    workPhone: text(row.work_phone),
    email: text(row.email),
    pensionTypeCode: text(row.pension_type_code),
    pensionNumber: text(row.pension_number),
    pensionExpiry: text(row.pension_expiry),
    dvaTypeCode: text(row.dva_type_code),
    dvaNumber: text(row.dva_number),
    externalId: text(row.external_id),
    createdAt: text(row.created_at),
  };
}

export async function getPatientById(id: string): Promise<FullPatientRecord> {
  const { data, error } = await getSupabaseClient()
    .from("patients")
    .select(fullPatientColumns)
    .eq("id", id)
    .single();

  if (error) throw error;

  return toFullPatientRecord((data as unknown) as Record<string, unknown>);
}

export interface NewPatientInput {
  title: string;
  firstName: string;
  lastName: string;
  middleName: string;
  preferredName: string;
  dateOfBirth: string;
  gender: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  postalAddress: string;
  postalCity: string;
  postalPostcode: string;
  medicareNumber: string;
  medicareIrn: string;
  medicareExpiry: string;
  mobileNumber: string;
  homePhone: string;
  workPhone: string;
  email: string;
  pensionTypeCode: string;
  pensionNumber: string;
  pensionExpiry: string;
  dvaTypeCode: string;
  dvaNumber: string;
  externalId: string;
}

export function emptyNewPatientInput(): NewPatientInput {
  return {
    title: "",
    firstName: "",
    lastName: "",
    middleName: "",
    preferredName: "",
    dateOfBirth: "",
    gender: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    postcode: "",
    postalAddress: "",
    postalCity: "",
    postalPostcode: "",
    medicareNumber: "",
    medicareIrn: "",
    medicareExpiry: "",
    mobileNumber: "",
    homePhone: "",
    workPhone: "",
    email: "",
    pensionTypeCode: "",
    pensionNumber: "",
    pensionExpiry: "",
    dvaTypeCode: "",
    dvaNumber: "",
    externalId: "",
  };
}

export async function createPatient(input: NewPatientInput): Promise<PatientRecord> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const middleName = input.middleName.trim();
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");

  const { data, error } = await getSupabaseClient()
    .from("patients")
    .insert({
      full_name: fullName,
      date_of_birth: input.dateOfBirth,
      title: input.title.trim() || null,
      first_name: firstName || null,
      last_name: lastName || null,
      middle_name: middleName || null,
      preferred_name: input.preferredName.trim() || null,
      gender: input.gender.trim() || null,
      address_line1: input.addressLine1.trim() || null,
      address_line2: input.addressLine2.trim() || null,
      city: input.city.trim() || null,
      postcode: input.postcode.trim() || null,
      postal_address: input.postalAddress.trim() || null,
      postal_city: input.postalCity.trim() || null,
      postal_postcode: input.postalPostcode.trim() || null,
      medicare_number: input.medicareNumber.trim() || null,
      medicare_irn: input.medicareIrn.trim() || null,
      medicare_expiry: input.medicareExpiry.trim() || null,
      mobile_number: input.mobileNumber.trim() || null,
      home_phone: input.homePhone.trim() || null,
      work_phone: input.workPhone.trim() || null,
      email: input.email.trim() || null,
      pension_type_code: input.pensionTypeCode.trim() || null,
      pension_number: input.pensionNumber.trim() || null,
      pension_expiry: input.pensionExpiry.trim() || null,
      dva_type_code: input.dvaTypeCode.trim() || null,
      dva_number: input.dvaNumber.trim() || null,
      external_id: input.externalId.trim() || null,
    })
    .select("id, full_name, date_of_birth")
    .single();

  if (error) throw error;

  return toPatientRecord(data as PatientRow);
}
