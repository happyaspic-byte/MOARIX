import type { AssetNodeRow, AssetNetworkRow, AssetVmRow, AssetRow } from "@/lib/services/assets-service";

interface StratusTopologyProps {
  asset: AssetRow;
  nodes: AssetNodeRow[];
  networks: AssetNetworkRow[];
  virtualMachines: AssetVmRow[];
}

function nodeByRole(nodes: AssetNodeRow[], role: string) {
  return nodes.find((n) => n.role === role);
}

function networksByPurpose(networks: AssetNetworkRow[], purpose: string) {
  return networks.filter((n) => n.purpose === purpose);
}

function statusTone(status: string) {
  if (["active", "up", "running"].includes(status)) return "ok";
  if (["standby", "degraded", "warning"].includes(status)) return "warn";
  if (["fault", "offline", "down", "faulted", "stopped"].includes(status)) return "bad";
  return "unknown";
}

export function StratusTopology({ asset, nodes, networks, virtualMachines }: StratusTopologyProps) {
  const isFt = asset.product_family === "ftserver";
  const isEndurance = asset.product_family === "ztc_endurance";
  const isEverRun = asset.product_family === "everrun";

  const leftRole = isEndurance ? "cma" : "node0";
  const rightRole = isEndurance ? "cmb" : "node1";
  const leftLabel = isEndurance ? "CMA" : "Node 0";
  const rightLabel = isEndurance ? "CMB" : "Node 1";

  const leftNode = nodeByRole(nodes, leftRole) ?? nodes[0];
  const rightNode = nodeByRole(nodes, rightRole) ?? nodes[1];

  const aLink = networksByPurpose(networks, "a_link");
  const bmc = networksByPurpose(networks, "bmc");
  const mgmt = networksByPurpose(networks, "management");
  const business = networksByPurpose(networks, "business");

  const ftVms = virtualMachines.filter((vm) => vm.protection_mode === "ft");
  const haVms = virtualMachines.filter((vm) => vm.protection_mode === "ha");
  const unprotectedVms = virtualMachines.filter((vm) => vm.protection_mode === "unprotected" || vm.protection_mode === "other");

  if (nodes.length === 0 && virtualMachines.length === 0) {
    return (
      <div className="topology-empty">
        <p>토폴로지 데이터가 없습니다. 노드·네트워크·VM을 등록하면 이중화 구성이 여기에 그려집니다.</p>
      </div>
    );
  }

  return (
    <div className="topology-board" role="img" aria-label={`${asset.product_name} 이중화 토폴로지`}>
      <header className="topology-legend">
        <span className="topo-chip ok">정상</span>
        <span className="topo-chip warn">대기·저하</span>
        <span className="topo-chip bad">장애·오프라인</span>
        <span className="topo-chip link">A-Link {aLink.length}개</span>
        <span className="topo-chip link">BMC {bmc.length}개</span>
        <strong>{isFt ? "Lockstep FT" : isEverRun ? "everRun HA/FT" : isEndurance ? "ztC Endurance" : "HA"}</strong>
      </header>

      <div className="topology-chassis">
        <article className={`topo-node tone-${statusTone(leftNode?.status ?? "unknown")}`}>
          <h3>{leftLabel}</h3>
          <p>{leftNode?.name ?? "미등록"}</p>
          <dl>
            <div><dt>상태</dt><dd>{leftNode?.status ?? "—"}</dd></div>
            <div><dt>관리</dt><dd>{leftNode?.management_address ?? "—"}</dd></div>
            <div><dt>BMC</dt><dd>{leftNode?.bmc_address ?? "—"}</dd></div>
            <div><dt>자원</dt><dd>{leftNode?.cpu_cores ? `${leftNode.cpu_cores}C` : "—"} {leftNode?.memory_gb ? `· ${leftNode.memory_gb}GB` : ""}</dd></div>
          </dl>
        </article>

        <div className="topo-mid">
          <div className={`topo-alink ${aLink.some((n) => n.status === "up") ? "up" : aLink.length ? "down" : "empty"}`}>
            <span>A-Link</span>
            <small>{aLink.map((n) => n.address ?? n.label).join(" ↔ ") || "미구성"}</small>
          </div>
          <div className="topo-bmc-row">
            {bmc.length === 0 ? <span className="topo-bmc empty">BMC 미등록</span> : bmc.map((n) => (
              <span key={n.id} className={`topo-bmc tone-${statusTone(n.status)}`}>BMC {n.address ?? n.label}</span>
            ))}
          </div>
          <div className="topo-mgmt">
            {mgmt.map((n) => <span key={n.id}>MGMT {n.address ?? n.label}</span>)}
            {business.map((n) => <span key={n.id}>업무 {n.address ?? n.label}</span>)}
          </div>
        </div>

        <article className={`topo-node tone-${statusTone(rightNode?.status ?? "unknown")}`}>
          <h3>{rightLabel}</h3>
          <p>{rightNode?.name ?? "미등록"}</p>
          <dl>
            <div><dt>상태</dt><dd>{rightNode?.status ?? "—"}</dd></div>
            <div><dt>관리</dt><dd>{rightNode?.management_address ?? "—"}</dd></div>
            <div><dt>BMC</dt><dd>{rightNode?.bmc_address ?? "—"}</dd></div>
            <div><dt>자원</dt><dd>{rightNode?.cpu_cores ? `${rightNode.cpu_cores}C` : "—"} {rightNode?.memory_gb ? `· ${rightNode.memory_gb}GB` : ""}</dd></div>
          </dl>
        </article>
      </div>

      <section className="topology-vms" aria-label="가상 머신 보호 배치">
        {ftVms.length > 0 ? (
          <div className="topo-vm-group ft">
            <h4>FT Lockstep</h4>
            <ul>
              {ftVms.map((vm) => (
                <li key={vm.id} className={`tone-${statusTone(vm.status)}`}>
                  <strong>{vm.name}</strong>
                  <small>{vm.vcpu ?? "?"} vCPU · {vm.memory_gb ?? "?"}GB · {vm.status}{(vm.vcpu ?? 0) > 8 ? " · vCPU 한도 확인" : ""}</small>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {haVms.length > 0 ? (
          <div className="topo-vm-group ha">
            <h4>HA</h4>
            <ul>
              {haVms.map((vm) => (
                <li key={vm.id} className={`tone-${statusTone(vm.status)}`}>
                  <strong>{vm.name}</strong>
                  <small>{vm.preferred_node_name ?? "선호 노드 없음"} · {vm.status}</small>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {unprotectedVms.length > 0 ? (
          <div className="topo-vm-group unprotected">
            <h4>비보호</h4>
            <ul>
              {unprotectedVms.map((vm) => (
                <li key={vm.id} className={`tone-${statusTone(vm.status)}`}>
                  <strong>{vm.name}</strong>
                  <small>{vm.status}</small>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
