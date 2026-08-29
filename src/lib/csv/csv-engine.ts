/**
 * Zero-dependency RFC 4180 CSV parser and serializer with UTF-8 BOM stripping
 * and flexible alias matching for Korean/English headers.
 */

export interface ParsedCsvRow {
  lineNumber: number;
  data: Record<string, string>;
  rawValues: string[];
}

export interface ParseCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  rawRows: ParsedCsvRow[];
}

/**
 * Parses a CSV string following RFC 4180 rules:
 * - Strips UTF-8 BOM if present
 * - Handles \r\n, \r, \n line breaks
 * - Handles quotes, escaped quotes (""), and embedded commas/newlines
 * - Skips empty lines
 */
export function parseCsv(content: string): ParseCsvResult {
  if (!content) {
    return { headers: [], rows: [], rawRows: [] };
  }

  // Strip UTF-8 BOM (0xFEFF)
  let text = content;
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const records: { values: string[]; line: number }[] = [];
  let currentRecord: string[] = [];
  let currentField = "";
  let insideQuotes = false;
  let lineStart = 1;
  let currentLine = 1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++; // Skip the second quote
        } else {
          // Closing quote
          insideQuotes = false;
        }
      } else {
        if (char === "\n") currentLine++;
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ",") {
        currentRecord.push(currentField);
        currentField = "";
      } else if (char === "\r" || char === "\n") {
        currentRecord.push(currentField);
        currentField = "";

        // Only add non-empty record
        const hasContent = currentRecord.some((f) => f.trim().length > 0);
        if (hasContent) {
          records.push({ values: currentRecord, line: lineStart });
        }

        currentRecord = [];
        if (char === "\r" && nextChar === "\n") {
          i++; // Skip \n in \r\n
        }
        currentLine++;
        lineStart = currentLine;
      } else {
        currentField += char;
      }
    }
  }

  // Flush remaining field
  if (currentField.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentField);
    const hasContent = currentRecord.some((f) => f.trim().length > 0);
    if (hasContent) {
      records.push({ values: currentRecord, line: lineStart });
    }
  }

  if (records.length === 0) {
    return { headers: [], rows: [], rawRows: [] };
  }

  const firstRecord = records[0];
  if (!firstRecord) {
    return { headers: [], rows: [], rawRows: [] };
  }

  const headers = firstRecord.values.map((h) => h.trim());
  const rawRows: ParsedCsvRow[] = [];
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < records.length; i++) {
    const record = records[i];
    if (!record) continue;
    const { values, line } = record;
    const rowObj: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) {
      const headerKey = headers[h] || `column_${h + 1}`;
      const value = values[h];
      rowObj[headerKey] = value !== undefined ? value.trim() : "";
    }
    rawRows.push({ lineNumber: line, data: rowObj, rawValues: values });
    rows.push(rowObj);
  }

  return { headers, rows, rawRows };
}

/**
 * Matches extracted CSV header strings against an alias mapping dictionary.
 * Returns a map of index -> canonicalKey or null if unmatched.
 */
export function matchHeaderAlias(
  headers: string[],
  aliasMap: Record<string, string[]>
): Record<number, string | null> {
  const result: Record<number, string | null> = {};

  const normalizedAliases: { canonicalKey: string; pattern: string }[] = [];
  for (const [canonicalKey, aliases] of Object.entries(aliasMap)) {
    for (const alias of aliases) {
      normalizedAliases.push({
        canonicalKey,
        pattern: alias.toLowerCase().replace(/[\s_\-]/g, ""),
      });
    }
  }

  headers.forEach((header, index) => {
    const norm = header.toLowerCase().replace(/[\s_\-]/g, "");
    const match = normalizedAliases.find((a) => a.pattern === norm);
    result[index] = match ? match.canonicalKey : null;
  });

  return result;
}

export interface CsvColumnDef<T = unknown> {
  key: keyof T | string;
  label: string;
  format?: (value: unknown, row: T) => string;
}

/**
 * Serializes data array to UTF-8 CSV string with BOM for Excel compatibility.
 */
export function serializeCsv<T extends Record<string, unknown>>(
  columns: CsvColumnDef<T>[],
  rows: T[]
): string {
  const escapeField = (val: unknown): string => {
    if (val === null || val === undefined) return `""`;
    const str = String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const headerLine = columns.map((col) => escapeField(col.label)).join(",");
  const dataLines = rows.map((row) =>
    columns
      .map((col) => {
        const rawValue = (row as Record<string, unknown>)[col.key as string];
        const formatted = col.format ? col.format(rawValue, row) : rawValue;
        return escapeField(formatted);
      })
      .join(",")
  );

  // Prepend UTF-8 BOM ﻿ so Excel opens Korean CSV cleanly without encoding issues
  return `﻿${headerLine}\r\n${dataLines.join("\r\n")}`;
}
