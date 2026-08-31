import { describe, expect, it } from "vitest";
import { parseCsv, serializeCsv, matchHeaderAlias } from "./csv-engine";

describe("csv-engine", () => {
  describe("parseCsv", () => {
    it("parses standard CSV with headers", () => {
      const csv = `asset_tag,product_family,status\nAST-001,ftserver,active\nAST-002,ztc_edge,maintenance`;
      const result = parseCsv(csv);
      expect(result.headers).toEqual(["asset_tag", "product_family", "status"]);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({
        asset_tag: "AST-001",
        product_family: "ftserver",
        status: "active",
      });
      expect(result.rows[1]).toEqual({
        asset_tag: "AST-002",
        product_family: "ztc_edge",
        status: "maintenance",
      });
    });

    it("strips UTF-8 BOM if present", () => {
      const csv = `﻿asset_tag,product_name\nAST-001,Stratus ftServer 2910`;
      const result = parseCsv(csv);
      expect(result.headers).toEqual(["asset_tag", "product_name"]);
      expect(result.rows[0]?.asset_tag).toBe("AST-001");
    });

    it("handles CRLF line breaks and trailing newlines", () => {
      const csv = "asset_tag,product_family\r\nAST-001,ftserver\r\nAST-002,ztc_edge\r\n";
      const result = parseCsv(csv);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.asset_tag).toBe("AST-001");
      expect(result.rows[1]?.asset_tag).toBe("AST-002");
    });

    it("handles quoted fields containing commas, quotes, and newlines", () => {
      const csv = `asset_tag,notes\n"AST-001","First line\nSecond line, with comma"\n"AST-002","Includes ""escaped"" quotes"`;
      const result = parseCsv(csv);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]?.notes).toBe("First line\nSecond line, with comma");
      expect(result.rows[1]?.notes).toBe('Includes "escaped" quotes');
    });

    it("ignores completely empty rows", () => {
      const csv = `asset_tag,product_family\nAST-001,ftserver\n\n   \nAST-002,ztc_edge\n`;
      const result = parseCsv(csv);
      expect(result.rows).toHaveLength(2);
    });

    it("returns line numbers corresponding to original CSV lines", () => {
      const csv = `asset_tag,notes\nAST-001,"Multi\nline"\nAST-002,Single`;
      const result = parseCsv(csv);
      expect(result.rawRows[0]?.lineNumber).toBe(2);
      expect(result.rawRows[1]?.lineNumber).toBe(4);
    });
  });

  describe("matchHeaderAlias", () => {
    const aliasMap: Record<string, string[]> = {
      assetTag: ["asset_tag", "자산태그", "자산번호", "Asset Tag"],
      productFamily: ["product_family", "제품군", "제품패밀리", "Product Family"],
      customerCode: ["customer_code", "고객사코드", "거래처코드", "Customer Code"],
      siteCode: ["site_code", "사업장코드", "설치사업장", "Site Code"],
    };

    it("maps Korean and English aliases to canonical keys", () => {
      const headers = ["자산태그", "Product Family", "고객사코드", "미확인헤더"];
      const mapping = matchHeaderAlias(headers, aliasMap);
      expect(mapping).toEqual({
        0: "assetTag",
        1: "productFamily",
        2: "customerCode",
        3: null,
      });
    });
  });

  describe("serializeCsv", () => {
    it("escapes fields with commas, quotes, or newlines correctly", () => {
      const headers = [
        { key: "tag", label: "자산 태그" },
        { key: "notes", label: "비고" },
      ];
      const rows = [
        { tag: "AST-001", notes: 'Line 1\nLine 2 with "quotes", and comma' },
        { tag: "AST-002", notes: "Normal" },
      ];
      const csv = serializeCsv(headers, rows);
      expect(csv).toBe(
        `﻿"자산 태그","비고"\r\n"AST-001","Line 1\nLine 2 with ""quotes"", and comma"\r\n"AST-002","Normal"`
      );
    });

    it("neutralizes spreadsheet formula prefixes in exported data", () => {
      const csv = serializeCsv(
        [{ key: "value", label: "값" }],
        [
          { value: "=HYPERLINK(\"https://example.invalid\",\"열기\")" },
          { value: "  +SUM(A1:A2)" },
          { value: "정상 값" },
        ],
      );
      expect(csv).toContain(`"'=HYPERLINK(""https://example.invalid"",""열기"")"`);
      expect(csv).toContain(`"'  +SUM(A1:A2)"`);
      expect(csv).toContain(`"정상 값"`);
    });
  });
});
