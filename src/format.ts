/** Display form for a phone number: drop the +1 country code and group the
 *  digits, so operators read a name-shaped token instead of an E.164 string.
 *  Anything that isn't a US number (or isn't a number at all) passes through. */
export function formatPhone(raw: string): string {
  const v = raw.replace(/^dm:/, "").trim();
  if (!v.startsWith("+")) return v;
  const digits = v.slice(1).replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length !== 10) return v;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}
