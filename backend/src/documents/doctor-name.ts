/** Normalize model output while preserving the name's original capitalization. */
export function normalizeDoctorName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .replace(/[.,]/g, " ")
    .replace(
      /^\s*(?:(?:dr|doctor|professor|prof|assoc\s*prof|a\/prof)\s+)+/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}
