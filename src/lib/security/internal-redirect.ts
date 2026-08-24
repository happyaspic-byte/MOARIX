const INTERNAL_ORIGIN = "https://moarix.invalid";
const ENCODED_PATH_SEPARATOR_OR_CONTROL = /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i;
const RAW_CONTROL = /[\u0000-\u001f\u007f]/;

export function safeInternalRedirect(
  value: FormDataEntryValue | null,
  fallback = "/dashboard",
) {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;

  const [rawPath = ""] = value.split(/[?#]/, 1);
  if (
    value.startsWith("//")
    || value.includes("\\")
    || RAW_CONTROL.test(value)
    || ENCODED_PATH_SEPARATOR_OR_CONTROL.test(rawPath)
  ) {
    return fallback;
  }

  try {
    const target = new URL(value, INTERNAL_ORIGIN);
    if (target.origin !== INTERNAL_ORIGIN || !target.pathname.startsWith("/")) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
