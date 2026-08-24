ALTER TABLE assets
  ADD COLUMN business_system text,
  ADD COLUMN environment text NOT NULL DEFAULT 'production'
    CHECK (environment IN ('production', 'staging', 'test', 'development', 'other')),
  ADD COLUMN hardware_vendor text,
  ADD COLUMN rack_location text,
  ADD COLUMN hypervisor text,
  ADD COLUMN assigned_engineer_id uuid,
  ADD COLUMN configuration_source text NOT NULL DEFAULT 'manual'
    CHECK (configuration_source IN ('manual', 'inspection', 'import', 'monitoring')),
  ADD COLUMN configuration_checked_at timestamptz,
  ADD CONSTRAINT assets_assigned_engineer_member_fk
    FOREIGN KEY (company_id, assigned_engineer_id)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT;

CREATE TABLE asset_nodes (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL,
  role text NOT NULL
    CHECK (role IN ('node0', 'node1', 'cma', 'cmb', 'host', 'other')),
  name text NOT NULL,
  hardware_model text,
  serial_number text,
  operating_system text,
  status text NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('active', 'standby', 'maintenance', 'fault', 'offline', 'unknown')),
  management_address text,
  bmc_address text,
  cpu_cores integer CHECK (cpu_cores > 0 AND cpu_cores <= 4096),
  memory_gb numeric(10,2) CHECK (memory_gb > 0 AND memory_gb <= 1048576),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'inspection', 'import', 'monitoring')),
  last_verified_at timestamptz,
  notes text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  UNIQUE (company_id, asset_id, id),
  FOREIGN KEY (company_id, asset_id)
    REFERENCES assets(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, created_by)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX asset_nodes_name_unique
  ON asset_nodes (company_id, asset_id, lower(name));
CREATE UNIQUE INDEX asset_nodes_singleton_role_unique
  ON asset_nodes (company_id, asset_id, role)
  WHERE role IN ('node0', 'node1', 'cma', 'cmb');
CREATE INDEX asset_nodes_asset_idx
  ON asset_nodes (company_id, asset_id, role);

CREATE TABLE asset_network_interfaces (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL,
  node_id uuid,
  label text NOT NULL,
  purpose text NOT NULL
    CHECK (purpose IN ('management', 'business', 'a_link', 'private', 'bmc', 'storage', 'other')),
  address text,
  peer_address text,
  mac_address text,
  vlan_id integer CHECK (vlan_id BETWEEN 1 AND 4094),
  speed_mbps integer CHECK (speed_mbps > 0 AND speed_mbps <= 800000),
  switch_port text,
  redundancy_group text,
  status text NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('up', 'down', 'degraded', 'unknown')),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'inspection', 'import', 'monitoring')),
  last_verified_at timestamptz,
  notes text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, asset_id)
    REFERENCES assets(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, asset_id, node_id)
    REFERENCES asset_nodes(company_id, asset_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, created_by)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX asset_network_interfaces_asset_idx
  ON asset_network_interfaces (company_id, asset_id, purpose);
CREATE UNIQUE INDEX asset_network_interfaces_node_label_unique
  ON asset_network_interfaces (company_id, asset_id, node_id, lower(label))
  WHERE node_id IS NOT NULL;
CREATE UNIQUE INDEX asset_network_interfaces_shared_label_unique
  ON asset_network_interfaces (company_id, asset_id, lower(label))
  WHERE node_id IS NULL;

CREATE TABLE asset_virtual_machines (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL,
  name text NOT NULL,
  business_role text,
  operating_system text,
  protection_mode text NOT NULL DEFAULT 'other'
    CHECK (protection_mode IN ('ha', 'ft', 'unprotected', 'other')),
  status text NOT NULL DEFAULT 'unknown'
    CHECK (status IN ('running', 'stopped', 'degraded', 'faulted', 'unknown')),
  vcpu integer CHECK (vcpu > 0 AND vcpu <= 1024),
  memory_gb numeric(10,2) CHECK (memory_gb > 0 AND memory_gb <= 1048576),
  storage_gb numeric(12,2) CHECK (storage_gb > 0 AND storage_gb <= 1073741824),
  ip_addresses text,
  preferred_node uuid,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'inspection', 'import', 'monitoring')),
  last_verified_at timestamptz,
  notes text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, id),
  FOREIGN KEY (company_id, asset_id)
    REFERENCES assets(company_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, asset_id, preferred_node)
    REFERENCES asset_nodes(company_id, asset_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id, created_by)
    REFERENCES company_members(company_id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX asset_virtual_machines_name_unique
  ON asset_virtual_machines (company_id, asset_id, lower(name));
CREATE INDEX asset_virtual_machines_asset_idx
  ON asset_virtual_machines (company_id, asset_id, protection_mode);

DROP TRIGGER IF EXISTS asset_nodes_touch_updated_at ON asset_nodes;
CREATE TRIGGER asset_nodes_touch_updated_at BEFORE UPDATE ON asset_nodes
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();

DROP TRIGGER IF EXISTS asset_network_interfaces_touch_updated_at ON asset_network_interfaces;
CREATE TRIGGER asset_network_interfaces_touch_updated_at BEFORE UPDATE ON asset_network_interfaces
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();

DROP TRIGGER IF EXISTS asset_virtual_machines_touch_updated_at ON asset_virtual_machines;
CREATE TRIGGER asset_virtual_machines_touch_updated_at BEFORE UPDATE ON asset_virtual_machines
FOR EACH ROW EXECUTE FUNCTION moarix_touch_updated_at();

ALTER TABLE asset_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_nodes FORCE ROW LEVEL SECURITY;
CREATE POLICY asset_nodes_company_isolation ON asset_nodes
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE asset_network_interfaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_network_interfaces FORCE ROW LEVEL SECURITY;
CREATE POLICY asset_network_interfaces_company_isolation ON asset_network_interfaces
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

ALTER TABLE asset_virtual_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_virtual_machines FORCE ROW LEVEL SECURITY;
CREATE POLICY asset_virtual_machines_company_isolation ON asset_virtual_machines
  USING (company_id = moarix_current_company_id())
  WITH CHECK (company_id = moarix_current_company_id());

CREATE INDEX service_cases_asset_active_idx
  ON service_cases (company_id, asset_id, status)
  WHERE asset_id IS NOT NULL AND status IN ('open', 'in_progress', 'waiting');

CREATE INDEX maintenance_inspections_asset_active_idx
  ON maintenance_inspections (company_id, asset_id, status, scheduled_date)
  WHERE status IN ('scheduled', 'in_progress', 'issue_found');
