/**
 * SQL counterpart of src/lib/domain/asset-support-risk.ts.
 *
 * The customer obligation remains on the asset cache because every customer
 * contract revision updates it transactionally. Vendor backing comes from the
 * current vendor contract revision. Keep the CASE ordering aligned with
 * getAssetSupportRisk: customer gaps win first, then missing/failed vendor
 * backing, followed by the earliest renewal band.
 */
export const assetSupportRiskCtes = `
active_asset_support AS (
  SELECT a.id AS asset_id, a.company_id, a.asset_tag, a.vendor_asset_id,
         a.product_name, a.counterparty_id, a.site_id, a.site,
         a.contract_status AS customer_contract_status,
         a.support_until AS customer_support_until,
         a.next_inspection_date,
         vendor.status AS vendor_contract_status,
         vendor.ends_on AS vendor_support_until
  FROM assets a
  LEFT JOIN LATERAL (
    SELECT contract.status, contract.ends_on
    FROM asset_support_contracts contract
    WHERE contract.company_id = a.company_id
      AND contract.asset_id = a.id
      AND contract.scope = 'vendor_support'
      AND contract.is_current = true
    LIMIT 1
  ) vendor ON true
  WHERE a.status <> 'retired'
),
asset_support_bands AS (
  SELECT active_asset_support.*,
         CASE
           WHEN customer_contract_status = 'not_contracted' THEN 'not_contracted'
           WHEN customer_contract_status = 'expired'
             OR customer_support_until < moarix_company_today() THEN 'expired'
           WHEN customer_support_until IS NULL THEN 'unknown'
           WHEN customer_support_until = moarix_company_today() THEN 'expires_today'
           WHEN customer_support_until <= moarix_company_today() + 30 THEN 'renewal_30'
           WHEN customer_support_until <= moarix_company_today() + 60 THEN 'renewal_60'
           WHEN customer_support_until <= moarix_company_today() + 90 THEN 'renewal_90'
           WHEN customer_contract_status = 'pending_renewal' THEN 'renewal_90'
           ELSE 'covered'
         END AS customer_band,
         CASE
           WHEN vendor_contract_status IS NULL THEN 'unverified'
           WHEN vendor_contract_status = 'not_contracted' THEN 'not_contracted'
           WHEN vendor_contract_status = 'expired'
             OR vendor_support_until < moarix_company_today() THEN 'expired'
           WHEN vendor_support_until IS NULL THEN 'unknown'
           WHEN vendor_support_until = moarix_company_today() THEN 'expires_today'
           WHEN vendor_support_until <= moarix_company_today() + 30 THEN 'renewal_30'
           WHEN vendor_support_until <= moarix_company_today() + 60 THEN 'renewal_60'
           WHEN vendor_support_until <= moarix_company_today() + 90 THEN 'renewal_90'
           WHEN vendor_contract_status = 'pending_renewal' THEN 'renewal_90'
           ELSE 'covered'
         END AS vendor_band
  FROM active_asset_support
),
asset_support_risks AS (
  SELECT asset_support_bands.*,
         CASE
           WHEN customer_band = 'not_contracted' THEN 'not_contracted'
           WHEN customer_band = 'expired' THEN 'expired'
           WHEN vendor_band = 'unverified' AND customer_band = 'unknown' THEN 'unknown'
           WHEN vendor_band = 'unverified' THEN 'vendor_unverified'
           WHEN vendor_band IN ('not_contracted', 'expired') THEN 'vendor_gap'
           WHEN customer_band = 'expires_today' OR vendor_band = 'expires_today' THEN 'expires_today'
           WHEN customer_band = 'renewal_30' OR vendor_band = 'renewal_30' THEN 'renewal_30'
           WHEN customer_band = 'renewal_60' OR vendor_band = 'renewal_60' THEN 'renewal_60'
           WHEN customer_band = 'renewal_90' OR vendor_band = 'renewal_90' THEN 'renewal_90'
           WHEN customer_band = 'unknown' OR vendor_band = 'unknown' THEN 'unknown'
           ELSE 'covered'
         END AS support_state
  FROM asset_support_bands
)`;

/** SQL counterpart of getLicenseHealth for non-retired operational assets. */
export const assetLicenseHealthCte = `
operational_license_health AS (
  SELECT license.id AS license_id, license.asset_id, license.product_name AS license_product_name,
         license.license_type, license.status AS license_status, license.expires_on,
         asset.asset_tag, asset.vendor_asset_id, asset.product_name AS asset_product_name,
         CASE
           WHEN license.status = 'retired' THEN 'retired'
           WHEN license.status = 'suspended' THEN 'suspended'
           WHEN license.license_type = 'perpetual' AND license.expires_on IS NULL THEN 'perpetual'
           WHEN license.expires_on IS NULL THEN 'unknown'
           WHEN license.expires_on < moarix_company_today() THEN 'expired'
           WHEN license.expires_on = moarix_company_today() THEN 'expires_today'
           WHEN license.expires_on <= moarix_company_today() + 30 THEN 'renewal_30'
           WHEN license.expires_on <= moarix_company_today() + 60 THEN 'renewal_60'
           WHEN license.expires_on <= moarix_company_today() + 90 THEN 'renewal_90'
           ELSE 'covered'
         END AS license_state
  FROM asset_licenses license
  JOIN assets asset ON asset.company_id = license.company_id AND asset.id = license.asset_id
  WHERE asset.status <> 'retired'
)`;
