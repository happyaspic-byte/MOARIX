import { describe, expect, it } from "vitest";
import {
  getAssetCsvTemplate,
  getContractCsvTemplate,
  validateAssetImportRow,
  validateContractImportRow,
} from "./asset-import-service";

describe("asset-import-service", () => {
  describe("templates", () => {
    it("generates asset CSV template with Korean headers and example rows", () => {
      const template = getAssetCsvTemplate();
      expect(template).toContain("자산태그");
      expect(template).toContain("제품군");
      expect(template).toContain("고객사코드");
      expect(template).toContain("ftserver");
    });

    it("generates contract CSV template with Korean headers and example rows", () => {
      const template = getContractCsvTemplate();
      expect(template).toContain("자산태그");
      expect(template).toContain("계약구분");
      expect(template).toContain("계약번호");
      expect(template).toContain("시작일");
      expect(template).toContain("종료일");
    });
  });

  describe("validateAssetImportRow", () => {
    it("validates valid asset row correctly", () => {
      const row = {
        assetTag: "AST-STRATUS-001",
        vendorAssetId: "ASN-98213",
        productName: "Stratus ftServer 2910",
        productFamily: "ftserver",
        protectionMode: "ft",
        status: "active",
        customerCode: "CUST-001",
        siteCode: "SITE-PANGYO",
        managementIp: "192.0.2.50",
        installedAt: "2024-01-15",
        warrantyUntil: "2027-01-14",
      };

      const result = validateAssetImportRow(row, 2);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.data?.assetTag).toBe("AST-STRATUS-001");
      expect(result.data?.productFamily).toBe("ftserver");
    });

    it("flags missing required fields and invalid enum values", () => {
      const invalidRow = {
        assetTag: "",
        productFamily: "invalid_family",
        protectionMode: "invalid_mode",
      };

      const result = validateAssetImportRow(invalidRow, 5);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.field === "assetTag")).toBe(true);
      expect(result.errors.some((e) => e.field === "productFamily")).toBe(true);
    });

    it("validates date formats YYYY-MM-DD", () => {
      const badDateRow = {
        assetTag: "AST-002",
        productFamily: "ztc_edge",
        customerCode: "CUST-001",
        installedAt: "2024/01/15", // Bad format
      };

      const result = validateAssetImportRow(badDateRow, 3);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "installedAt")).toBe(true);
    });
  });

  describe("validateContractImportRow", () => {
    it("validates valid contract row", () => {
      const row = {
        assetTag: "AST-STRATUS-001",
        scope: "customer_support",
        contractNumber: "CTR-2026-001",
        providerName: "모아릭스(주)",
        recipientName: "한국제조(주)",
        supportLevel: "24x7 4Hr",
        serviceMethod: "hybrid",
        startsOn: "2026-01-01",
        endsOn: "2026-12-31",
      };

      const result = validateContractImportRow(row, 2);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.data?.scope).toBe("customer_support");
    });

    it("rejects when endsOn is before startsOn", () => {
      const invertedDates = {
        assetTag: "AST-STRATUS-001",
        scope: "customer_support",
        providerName: "모아릭스",
        startsOn: "2026-12-31",
        endsOn: "2026-01-01",
      };

      const result = validateContractImportRow(invertedDates, 3);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.field === "endsOn")).toBe(true);
    });
  });
});
