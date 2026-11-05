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

function toDoctorRecord(row: DoctorRow): DoctorRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email ?? null,
    active: row.active ?? true,
  };
}

export async function listDoctors(): Promise<DoctorRecord[]> {
  const rows: DoctorRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await getSupabaseClient().from("doctors")
      .select("id, full_name, email, active").order("full_name", { ascending: true }).order("id").range(offset, offset + 999);
    if (error) throw error;
    rows.push(...((data ?? []) as DoctorRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows.filter((doctor) => doctor.active !== false).map(toDoctorRecord);
}

export function cleanDoctorName(name: string): string {
  return (name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[,.]/g, " ")
    .replace(/^\s*(?:(?:dr|doctor|professor|prof|assoc\s*prof|a\/prof)\s+)+/i, "")
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
 * 5. A conservative closest-name match for small typos, with ambiguous results rejected
 */
export function matchDoctorByName(
  rawName: string,
  doctors: DoctorRecord[],
): DoctorRecord | null {
  doctors = doctors.filter((doctor) => doctor.active !== false && !doctor.id.startsWith("fallback-"));
  const trimmed = (rawName ?? "").trim();
  if (!trimmed || doctors.length === 0) return null;

  // Compare normalized names across all IDs before accepting an exact label.
  // Different title spellings must not hide an ambiguous database match.
  const cleanedRaw = cleanDoctorName(trimmed);
  if (!cleanedRaw) return null;

  const cleanedMatches = doctors.filter(
    (d) => cleanDoctorName(d.fullName) === cleanedRaw,
  );
  if (cleanedMatches.length > 0) return cleanedMatches.length === 1 ? cleanedMatches[0] : null;

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
            return dt === t || (t.length === 1 && dt.startsWith(t));
          }))
      );
    });
    if (tokenMatches.length > 0) return tokenMatches.length === 1 ? tokenMatches[0] : null;
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

  // Small OCR/model typos: require a full name, at most one edit per token,
  // >=85% overall similarity, and a clear lead over the second candidate.
  if (rawTokens.length < 2) return null;
  const rawSorted = [...rawTokens].sort();
  const ranked = doctors.map((doctor) => {
    const tokens = cleanDoctorName(doctor.fullName).split(" ").filter(Boolean).sort();
    if (tokens.length !== rawSorted.length) return { doctor, score: 0 };
    let edits = 0;
    let length = 0;
    for (let i = 0; i < tokens.length; i++) {
      const distance = nameDistance(rawSorted[i], tokens[i]);
      if (distance > 1 || (distance > 0 && Math.min(rawSorted[i].length, tokens[i].length) < 4)) return { doctor, score: 0 };
      edits += distance;
      length += Math.max(rawSorted[i].length, tokens[i].length);
    }
    return { doctor, score: length ? 1 - edits / length : 0 };
  }).sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 0.85 && ranked[0].score - (ranked[1]?.score ?? 0) >= 0.1 ? ranked[0].doctor : null;
}

function nameDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > 1) return 2;
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[right.length];
}

