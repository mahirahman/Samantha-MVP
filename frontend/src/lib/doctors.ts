import { getSupabaseClient } from "./supabase";

export interface DoctorRecord {
  id: string;
  fullName: string;
  email?: string | null;
  active?: boolean;
}

interface DoctorRow {
  id: string;
  full_name: string;
  email?: string | null;
  active?: boolean | null;
}

const fallbackPracticeDoctors: DoctorRecord[] = [
  { id: "fallback-doc-1", fullName: "Dr Sarah Jenkins", email: "sarah.jenkins@caregp.com.au", active: true },
  { id: "fallback-doc-2", fullName: "Dr Michael Chang", email: "michael.chang@caregp.com.au", active: true },
  { id: "fallback-doc-3", fullName: "Dr Emily Taylor", email: "emily.taylor@caregp.com.au", active: true },
  { id: "fallback-doc-4", fullName: "Dr Robert Wilson", email: "robert.wilson@caregp.com.au", active: true },
];

function toDoctorRecord(row: DoctorRow): DoctorRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email ?? null,
    active: row.active ?? true,
  };
}

export async function listDoctors(): Promise<DoctorRecord[]> {
  try {
    const { data, error } = await getSupabaseClient()
      .from("doctors")
      .select("id, full_name, email, active")
      .order("full_name", { ascending: true });

    if (error) throw error;

    const rows = ((data as DoctorRow[] | null) ?? [])
      .filter((doc) => doc.active !== false)
      .map(toDoctorRecord);

    if (rows.length > 0) {
      return rows;
    }
  } catch (error) {
    // If Supabase table is unreachable or empty, use fallback practice doctors
    console.warn("Could not query doctors table from Supabase, using practice defaults:", error);
  }

  return fallbackPracticeDoctors;
}

export function cleanDoctorName(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/^(dr\.?|doctor|prof\.?|professor|assoc\.?\s*prof\.?|a\/prof\.?)\s+/i, "")
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matches an extracted or input doctor name against the known database doctor records.
 *
 * Strategies:
 * 1. Exact case-insensitive match on full_name
 * 2. Title- and punctuation-normalized match (e.g. "Dr. Sarah Jenkins" == "Dr Sarah Jenkins")
 * 3. Token-based matching (e.g. "Sarah Jenkins" or "Jenkins, Sarah" matching "Dr Sarah Jenkins")
 * 4. Surname-only match when a doctor title was present and only one doctor shares that surname
 */
export function matchDoctorByName(
  rawName: string,
  doctors: DoctorRecord[],
): DoctorRecord | null {
  const trimmed = (rawName ?? "").trim();
  if (!trimmed || doctors.length === 0) return null;

  const lower = trimmed.toLowerCase();

  // 1. Exact case-insensitive match
  const exact = doctors.find((d) => d.fullName.trim().toLowerCase() === lower);
  if (exact) return exact;

  // 2. Normalized match (stripping Dr/Doctor/Prof titles and punctuation)
  const cleanedRaw = cleanDoctorName(trimmed);
  if (!cleanedRaw) return null;

  const cleanedMatches = doctors.filter(
    (d) => cleanDoctorName(d.fullName) === cleanedRaw,
  );
  if (cleanedMatches.length === 1) return cleanedMatches[0];

  // 3. Token-based matching (handles "Jenkins, Sarah", initial match "Dr S Jenkins", etc.)
  const rawTokens = cleanedRaw.split(" ").filter(Boolean);
  if (rawTokens.length > 1) {
    const tokenMatches = doctors.filter((d) => {
      const docTokens = cleanDoctorName(d.fullName).split(" ").filter(Boolean);
      // All raw tokens are present or match as initials/prefixes in doc tokens
      return (
        rawTokens.every((t) => docTokens.includes(t)) ||
        (rawTokens.length === docTokens.length &&
          rawTokens.every((t, i) => {
            const dt = docTokens[i];
            return dt === t || dt.startsWith(t) || t.startsWith(dt);
          }))
      );
    });
    if (tokenMatches.length === 1) return tokenMatches[0];
  }

  // 4. Surname match with title (e.g. "Dr Jenkins" where raw has 1 token and title was present)
  const hadDoctorTitle = /^(dr\.?|doctor|prof\.?|professor)\s+/i.test(trimmed);
  if (hadDoctorTitle && rawTokens.length === 1) {
    const surnameMatches = doctors.filter((d) => {
      const docTokens = cleanDoctorName(d.fullName).split(" ").filter(Boolean);
      const docSurname = docTokens[docTokens.length - 1];
      return docSurname === rawTokens[0];
    });
    if (surnameMatches.length === 1) return surnameMatches[0];
  }

  return null;
}

