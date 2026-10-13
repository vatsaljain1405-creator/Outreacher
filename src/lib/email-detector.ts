/**
 * Automatically detects the most likely email column header by checking
 * known naming patterns and sampling row values for valid email formats.
 */
export function detectEmailHeader(headers: string[], rows: Record<string, string>[] = []): string {
  if (!headers || headers.length === 0) return ""

  // 1. Common exact/canonical header patterns
  const exactPatterns = [
    /^e-?mail$/i,
    /^mail$/i,
    /^e-?mail(\s*address|\s*id|_id)?$/i,
    /^recipient(\s*e-?mail)?$/i,
    /^contact(\s*e-?mail)?$/i,
  ]
  for (const pattern of exactPatterns) {
    const matched = headers.find((h) => pattern.test(h.trim()))
    if (matched) return matched
  }

  // 2. Partial pattern (contains "mail")
  const partial = headers.find((h) => /mail/i.test(h.trim()))
  if (partial) return partial

  // 3. Inspect row data: find column containing the most valid email addresses
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  let bestHeader = headers[0]
  let maxCount = 0

  for (const h of headers) {
    let count = 0
    const sample = rows.slice(0, 50)
    for (const r of sample) {
      const val = (r[h] || "").trim()
      if (emailRegex.test(val)) {
        count++
      }
    }
    if (count > maxCount) {
      maxCount = count
      bestHeader = h
    }
  }

  return bestHeader
}
