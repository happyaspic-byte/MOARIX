"use client";

import { useActionState, useEffect, useRef } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type {
  AssetAssignableMember,
  AssetContractRow,
  AssetLicenseRow,
  AssetNetworkRow,
  AssetNodeRow,
  AssetRow,
  AssetVmRow,
} from "@/lib/services/assets-service";
import {
  createAssetContractAction,
  createAssetLicenseAction,
  createAssetNetworkAction,
  createAssetNodeAction,
  createAssetVmAction,
  updateAssetLicenseAction,
  updateAssetNetworkAction,
  updateAssetNodeAction,
  updateAssetProfileAction,
  updateAssetVmAction,
} from "./actions";

function useCloseOnSuccess(status: string) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (status === "success") formRef.current?.closest("details")?.removeAttribute("open");
  }, [status]);
  return formRef;
}

function dateTimeLocalValue(value: string | null | undefined, timeZone: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function AssetProfileForm({ asset, members, companyTimezone }: { asset: AssetRow; members: AssetAssignableMember[]; companyTimezone: string }) {
  const [state, action] = useActionState(updateAssetProfileAction, initialFormState);
  const formRef = useCloseOnSuccess(state.status);
  return <form ref={formRef} action={action} className="form-grid case-entry-form">
    <input type="hidden" name="assetId" value={asset.id} />
    <label><span>운영 상태 *</span><select name="status" defaultValue={asset.status}><option value="active">운영 중</option><option value="maintenance">점검 중</option><option value="retired">퇴역</option></select></label>
    <label><span>환경 *</span><select name="environment" defaultValue={asset.environment}><option value="production">운영</option><option value="staging">스테이징</option><option value="test">시험</option><option value="development">개발</option><option value="other">기타</option></select></label>
    <label><span>업무 시스템</span><input name="businessSystem" maxLength={160} defaultValue={asset.business_system ?? ""} placeholder="예: MES, 물류, DB" /></label>
    <label><span>담당 엔지니어</span><select name="assignedEngineerId" defaultValue={asset.assigned_engineer_id ?? ""}><option value="">미지정</option>{members.filter((member) => member.is_active).map((member) => <option key={member.user_id} value={member.user_id}>{member.name} · {member.role}</option>)}</select></label>
    <label><span>하드웨어 제조사</span><input name="hardwareVendor" maxLength={120} defaultValue={asset.hardware_vendor ?? ""} /></label>
    <label><span>랙 위치</span><input name="rackLocation" maxLength={120} defaultValue={asset.rack_location ?? ""} /></label>
    <label><span>하이퍼바이저</span><input name="hypervisor" maxLength={120} defaultValue={asset.hypervisor ?? ""} placeholder="예: VMware ESXi / Workstation" /></label>
    <label><span>정보 출처 *</span><select name="configurationSource" defaultValue={asset.configuration_source}><option value="manual">수동 등록</option><option value="inspection">점검 결과</option><option value="import">가져오기</option><option value="monitoring">모니터링</option></select></label>
    <label><span>구성 확인 시각</span><input name="configurationCheckedAt" type="datetime-local" defaultValue={dateTimeLocalValue(asset.configuration_checked_at, companyTimezone)} /></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>운영 프로필 저장</SubmitButton></div>
  </form>;
}

export function AssetNodeForm({ assetId, productFamily, initial, companyTimezone }: { assetId: string; productFamily: AssetRow["product_family"]; initial?: AssetNodeRow; companyTimezone: string }) {
  const [state, action] = useActionState(initial ? updateAssetNodeAction : createAssetNodeAction, initialFormState);
  const formRef = useCloseOnSuccess(state.status);
  const defaultRole = initial?.role ?? (productFamily === "ztc_endurance" ? "cma" : "node0");
  return <form ref={formRef} action={action} className="form-grid case-entry-form">
    <input type="hidden" name="assetId" value={assetId} />
    {initial ? <input type="hidden" name="assetNodeId" value={initial.id} /> : null}
    <label><span>역할 *</span><select name="role" defaultValue={defaultRole}><option value="node0">Node0</option><option value="node1">Node1</option><option value="cma">CMA</option><option value="cmb">CMB</option><option value="host">Host</option><option value="other">기타</option></select></label>
    <label><span>노드명 *</span><input name="name" maxLength={120} required defaultValue={initial?.name ?? ""} placeholder={defaultRole.toUpperCase()} /></label>
    <label><span>상태 *</span><select name="status" defaultValue={initial?.status ?? "active"}><option value="active">Active</option><option value="standby">Standby</option><option value="maintenance">Maintenance</option><option value="fault">Fault</option><option value="offline">Offline</option><option value="unknown">Unknown</option></select></label>
    <label><span>하드웨어 모델</span><input name="hardwareModel" maxLength={160} defaultValue={initial?.hardware_model ?? ""} /></label>
    <label><span>일련번호</span><input name="serialNumber" maxLength={120} defaultValue={initial?.serial_number ?? ""} /></label>
    <label><span>운영체제</span><input name="operatingSystem" maxLength={160} defaultValue={initial?.operating_system ?? ""} /></label>
    <label><span>관리 주소</span><input name="managementAddress" maxLength={200} defaultValue={initial?.management_address ?? ""} placeholder="예약 문서 주소 또는 운영 DB에서 입력" /></label>
    <label><span>BMC 주소</span><input name="bmcAddress" maxLength={200} defaultValue={initial?.bmc_address ?? ""} /></label>
    <label><span>CPU 코어</span><input name="cpuCores" type="number" min="1" max="4096" defaultValue={initial?.cpu_cores ?? ""} /></label>
    <label><span>메모리 (GB)</span><input name="memoryGb" type="number" min="0.01" step="0.01" defaultValue={initial?.memory_gb ?? ""} /></label>
    <label><span>확인 시각</span><input name="lastVerifiedAt" type="datetime-local" defaultValue={dateTimeLocalValue(initial?.last_verified_at, companyTimezone)} /></label>
    <label className="full"><span>비고</span><textarea name="notes" maxLength={2000} defaultValue={initial?.notes ?? ""} /></label>
    <div className="full"><FormMessage state={state} /></div><div className="form-actions"><SubmitButton>{initial ? "노드 저장" : "노드 등록"}</SubmitButton></div>
  </form>;
}

export function AssetNetworkForm({ assetId, nodes, initial, companyTimezone }: { assetId: string; nodes: AssetNodeRow[]; initial?: AssetNetworkRow; companyTimezone: string }) {
  const [state, action] = useActionState(initial ? updateAssetNetworkAction : createAssetNetworkAction, initialFormState);
  const formRef = useCloseOnSuccess(state.status);
  return <form ref={formRef} action={action} className="form-grid case-entry-form">
    <input type="hidden" name="assetId" value={assetId} />
    {initial ? <input type="hidden" name="networkInterfaceId" value={initial.id} /> : null}
    <label><span>연결 노드</span><select name="nodeId" defaultValue={initial?.node_id ?? ""}><option value="">공용/미지정</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name} · {node.role.toUpperCase()}</option>)}</select></label>
    <label><span>인터페이스명 *</span><input name="label" maxLength={120} required defaultValue={initial?.label ?? ""} placeholder="A-Link 1" /></label>
    <label><span>용도 *</span><select name="purpose" defaultValue={initial?.purpose ?? "management"}><option value="management">관리</option><option value="business">업무</option><option value="a_link">A-Link</option><option value="private">Private</option><option value="bmc">BMC</option><option value="storage">스토리지</option><option value="other">기타</option></select></label>
    <label><span>상태 *</span><select name="status" defaultValue={initial?.status ?? "unknown"}><option value="up">UP</option><option value="down">DOWN</option><option value="degraded">DEGRADED</option><option value="unknown">UNKNOWN</option></select></label>
    <label><span>주소</span><input name="address" maxLength={200} defaultValue={initial?.address ?? ""} /></label>
    <label><span>상대 주소</span><input name="peerAddress" maxLength={200} defaultValue={initial?.peer_address ?? ""} /></label>
    <label><span>MAC 주소</span><input name="macAddress" maxLength={50} defaultValue={initial?.mac_address ?? ""} /></label>
    <label><span>VLAN</span><input name="vlanId" type="number" min="1" max="4094" defaultValue={initial?.vlan_id ?? ""} /></label>
    <label><span>속도 (Mbps)</span><input name="speedMbps" type="number" min="1" max="800000" defaultValue={initial?.speed_mbps ?? ""} /></label>
    <label><span>스위치 포트</span><input name="switchPort" maxLength={120} defaultValue={initial?.switch_port ?? ""} /></label>
    <label><span>이중화 그룹</span><input name="redundancyGroup" maxLength={120} defaultValue={initial?.redundancy_group ?? ""} /></label>
    <label><span>확인 시각</span><input name="lastVerifiedAt" type="datetime-local" defaultValue={dateTimeLocalValue(initial?.last_verified_at, companyTimezone)} /></label>
    <label className="full"><span>비고</span><textarea name="notes" maxLength={2000} defaultValue={initial?.notes ?? ""} /></label>
    <div className="full"><FormMessage state={state} /></div><div className="form-actions"><SubmitButton>{initial ? "네트워크 저장" : "네트워크 등록"}</SubmitButton></div>
  </form>;
}

export function AssetVmForm({ assetId, nodes, initial, companyTimezone }: { assetId: string; nodes: AssetNodeRow[]; initial?: AssetVmRow; companyTimezone: string }) {
  const [state, action] = useActionState(initial ? updateAssetVmAction : createAssetVmAction, initialFormState);
  const formRef = useCloseOnSuccess(state.status);
  return <form ref={formRef} action={action} className="form-grid case-entry-form">
    <input type="hidden" name="assetId" value={assetId} />
    {initial ? <input type="hidden" name="virtualMachineId" value={initial.id} /> : null}
    <label><span>VM 이름 *</span><input name="name" maxLength={160} required defaultValue={initial?.name ?? ""} /></label>
    <label><span>업무 역할</span><input name="businessRole" maxLength={160} defaultValue={initial?.business_role ?? ""} placeholder="MES / DB / 물류" /></label>
    <label><span>보호 방식 *</span><select name="protectionMode" defaultValue={initial?.protection_mode ?? "ft"}><option value="ft">FT</option><option value="ha">HA</option><option value="unprotected">비보호</option><option value="other">기타</option></select></label>
    <label><span>상태 *</span><select name="status" defaultValue={initial?.status ?? "running"}><option value="running">Running</option><option value="stopped">Stopped</option><option value="degraded">Degraded</option><option value="faulted">Faulted</option><option value="unknown">Unknown</option></select></label>
    <label><span>운영체제</span><input name="operatingSystem" maxLength={160} defaultValue={initial?.operating_system ?? ""} /></label>
    <label><span>vCPU</span><input name="vcpu" type="number" min="1" max="1024" defaultValue={initial?.vcpu ?? ""} /></label>
    <label><span>메모리 (GB)</span><input name="memoryGb" type="number" min="0.01" step="0.01" defaultValue={initial?.memory_gb ?? ""} /></label>
    <label><span>스토리지 (GB)</span><input name="storageGb" type="number" min="0.01" step="0.01" defaultValue={initial?.storage_gb ?? ""} /></label>
    <label><span>IP 주소</span><input name="ipAddresses" maxLength={500} defaultValue={initial?.ip_addresses ?? ""} /></label>
    <label><span>선호 노드</span><select name="preferredNode" defaultValue={initial?.preferred_node ?? ""}><option value="">미지정</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name} · {node.role.toUpperCase()}</option>)}</select></label>
    <label><span>확인 시각</span><input name="lastVerifiedAt" type="datetime-local" defaultValue={dateTimeLocalValue(initial?.last_verified_at, companyTimezone)} /></label>
    <label className="full"><span>비고</span><textarea name="notes" maxLength={2000} defaultValue={initial?.notes ?? ""} /></label>
    <div className="full"><FormMessage state={state} /></div><div className="form-actions"><SubmitButton>{initial ? "VM 저장" : "VM 등록"}</SubmitButton></div>
  </form>;
}

export function AssetContractForm({ assetId, members }: { assetId: string; members: AssetAssignableMember[] }) {
  const [state, action] = useActionState(createAssetContractAction, initialFormState);
  const formRef = useCloseOnSuccess(state.status);
  return <form ref={formRef} action={action} className="form-grid case-entry-form">
    <input type="hidden" name="assetId" value={assetId} />
    <label><span>계약 구분 *</span><select name="scope" defaultValue="customer_support"><option value="customer_support">고객 ↔ 우리 회사</option><option value="vendor_support">우리 회사 ↔ Stratus/Penguin</option></select></label>
    <label><span>계약 상태 *</span><select name="status" defaultValue="active"><option value="active">계약중</option><option value="pending_renewal">갱신협의</option><option value="not_contracted">미계약</option><option value="expired">만료</option></select></label>
    <label><span>계약번호</span><input name="contractNumber" maxLength={120} placeholder="합성 또는 내부 참조번호" /></label>
    <label><span>지원 제공자 *</span><input name="providerName" maxLength={160} required placeholder="우리 회사 또는 Demo Vendor" /></label>
    <label><span>지원 수혜자</span><input name="recipientName" maxLength={160} placeholder="고객사 또는 우리 회사" /></label>
    <label><span>채널·중간 파트너</span><input name="intermediaryName" maxLength={160} /></label>
    <label><span>지원 등급</span><input name="supportLevel" maxLength={120} /></label>
    <label><span>지원 방식 *</span><select name="serviceMethod" defaultValue="hybrid"><option value="remote">원격</option><option value="visit">방문</option><option value="hybrid">원격 + 방문</option></select></label>
    <label><span>시작일</span><input name="startsOn" type="date" /></label><label><span>종료일</span><input name="endsOn" type="date" /></label>
    <label><span>갱신 담당자</span><select name="renewalOwnerId" defaultValue=""><option value="">미지정</option>{members.filter((member) => member.is_active).map((member) => <option key={member.user_id} value={member.user_id}>{member.name}</option>)}</select></label>
    <label className="full"><span>지원 범위</span><textarea name="coverageSummary" maxLength={3000} placeholder="포함되는 제품·작업·응답 수준" /></label>
    <label className="full"><span>제외 범위</span><textarea name="exclusions" maxLength={3000} /></label>
    <label className="full"><span>비고</span><textarea name="notes" maxLength={2000} /></label>
    <div className="full"><FormMessage state={state} /></div><div className="form-actions"><SubmitButton>계약 개정 등록</SubmitButton></div>
  </form>;
}

export function AssetLicenseForm({ assetId, contracts, initial }: { assetId: string; contracts: AssetContractRow[]; initial?: AssetLicenseRow }) {
  const [state, action] = useActionState(initial ? updateAssetLicenseAction : createAssetLicenseAction, initialFormState);
  const formRef = useCloseOnSuccess(state.status);
  return <form ref={formRef} action={action} className="form-grid case-entry-form">
    <input type="hidden" name="assetId" value={assetId} />
    {initial ? <input type="hidden" name="licenseId" value={initial.id} /> : null}
    <label><span>제품·라이선스명 *</span><input name="productName" maxLength={160} required defaultValue={initial?.product_name ?? ""} /></label>
    <label><span>유형 *</span><select name="licenseType" defaultValue={initial?.license_type ?? "perpetual"}><option value="perpetual">영구</option><option value="subscription">구독</option><option value="oem">OEM</option><option value="trial">평가판</option><option value="other">기타</option></select></label>
    <label><span>Entitlement 참조</span><input name="entitlementReference" maxLength={160} defaultValue={initial?.entitlement_reference ?? ""} /></label>
    <label><span>키 식별 힌트</span><input name="licenseKeyHint" maxLength={12} defaultValue={initial?.license_key_hint ?? ""} placeholder="마지막 4~12자만" /><small className="helper-text">전체 제품 키는 저장하지 않습니다.</small></label>
    <label><span>버전</span><input name="version" maxLength={120} defaultValue={initial?.version ?? ""} /></label>
    <label><span>수량 *</span><input name="quantity" type="number" min="1" max="1000000" defaultValue={initial?.quantity ?? 1} required /></label>
    <label><span>상태 *</span><select name="status" defaultValue={initial?.status ?? "active"}><option value="active">활성</option><option value="suspended">중지</option><option value="retired">종료</option></select></label>
    <label><span>연결 지원 계약</span><select name="supportContractId" defaultValue={initial?.support_contract_id ?? ""}><option value="">미연결</option>{contracts.filter((contract) => contract.is_current || contract.id === initial?.support_contract_id).map((contract) => <option key={contract.id} value={contract.id}>{contract.scope === "vendor_support" ? "벤더" : "고객"} · {contract.contract_number ?? contract.provider_name}</option>)}</select></label>
    <label><span>발급일</span><input name="issuedOn" type="date" defaultValue={initial?.issued_on ?? ""} /></label><label><span>만료일</span><input name="expiresOn" type="date" defaultValue={initial?.expires_on ?? ""} /></label>
    <label className="full"><span>비고</span><textarea name="notes" maxLength={2000} defaultValue={initial?.notes ?? ""} /></label>
    <div className="full"><FormMessage state={state} /></div><div className="form-actions"><SubmitButton>{initial ? "라이선스 저장" : "라이선스 등록"}</SubmitButton></div>
  </form>;
}
