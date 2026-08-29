"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { CounterpartyRow } from "@/lib/services/master-data";
import type { CustomerSiteRow } from "@/lib/services/operations-service";
import type { ServiceCaseRow } from "@/lib/services/service-cases";
import { createDrivingLogAction, updateDrivingLogAction } from "./actions";

export type DrivingLogFormInitial = {
  drivingLogId: string;
  expectedVersion: number;
  startDate: string;
  endDate: string;
  departure: string;
  destination: string;
  purpose: string;
  vehicleName: string;
  distanceKm: string;
  ratePerKm: string;
  tollAmount: string;
  parkingAmount: string;
  fuelAmount: string;
  dailyAllowanceAmount: string;
  counterpartyId: string;
  siteId: string;
  caseId: string;
  reason: string;
  notes: string;
};

export function DrivingLogForm({
  counterparties,
  sites,
  serviceCases,
  today,
  initial,
}: {
  counterparties: CounterpartyRow[];
  sites: CustomerSiteRow[];
  serviceCases: ServiceCaseRow[];
  today: string;
  initial?: DrivingLogFormInitial;
}) {
  const [state, action] = useActionState(
    initial ? updateDrivingLogAction : createDrivingLogAction,
    initialFormState,
  );
  const [counterpartyId, setCounterpartyId] = useState(initial?.counterpartyId ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const availableSites = sites.filter((row) => row.counterparty_id === counterpartyId);
  const availableCases = serviceCases.filter((row) => row.counterparty_id === counterpartyId);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.closest("details")?.removeAttribute("open");
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="form-grid">
      {initial ? (
        <>
          <input type="hidden" name="drivingLogId" value={initial.drivingLogId} />
          <input type="hidden" name="expectedVersion" value={initial.expectedVersion} />
        </>
      ) : null}
      <label>
        <span>출발일 *</span>
        <input name="startDate" type="date" required defaultValue={initial?.startDate ?? today} />
      </label>
      <label>
        <span>종료일 *</span>
        <input name="endDate" type="date" required defaultValue={initial?.endDate ?? today} />
      </label>
      <label>
        <span>출발지 *</span>
        <input name="departure" maxLength={160} required defaultValue={initial?.departure ?? ""} />
      </label>
      <label>
        <span>도착지 *</span>
        <input name="destination" maxLength={160} required defaultValue={initial?.destination ?? ""} />
      </label>
      <label className="full">
        <span>운행 목적 *</span>
        <input name="purpose" maxLength={500} required defaultValue={initial?.purpose ?? ""} />
      </label>
      <label>
        <span>차량 *</span>
        <input name="vehicleName" maxLength={120} required defaultValue={initial?.vehicleName ?? ""} />
      </label>
      <label>
        <span>운행 거리(km) *</span>
        <input name="distanceKm" inputMode="decimal" required defaultValue={initial?.distanceKm ?? ""} />
      </label>
      <label>
        <span>km당 단가</span>
        <input name="ratePerKm" inputMode="decimal" required defaultValue={initial?.ratePerKm ?? "0"} />
      </label>
      <label>
        <span>통행료</span>
        <input name="tollAmount" inputMode="decimal" required defaultValue={initial?.tollAmount ?? "0"} />
      </label>
      <label>
        <span>주차비</span>
        <input name="parkingAmount" inputMode="decimal" required defaultValue={initial?.parkingAmount ?? "0"} />
      </label>
      <label>
        <span>유류비</span>
        <input name="fuelAmount" inputMode="decimal" required defaultValue={initial?.fuelAmount ?? "0"} />
      </label>
      <label>
        <span>일비</span>
        <input name="dailyAllowanceAmount" inputMode="decimal" required defaultValue={initial?.dailyAllowanceAmount ?? "0"} />
      </label>
      <label className="full">
        <span>고객사</span>
        <select
          name="counterpartyId"
          value={counterpartyId}
          onChange={(event) => setCounterpartyId(event.target.value)}
        >
          <option value="">미지정</option>
          {counterparties.map((row) => (
            <option key={row.id} value={row.id}>{row.code} · {row.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>사업장</span>
        <select
          key={`site-${counterpartyId}`}
          name="siteId"
          disabled={!counterpartyId}
          defaultValue={availableSites.some((row) => row.id === initial?.siteId) ? initial?.siteId : ""}
        >
          <option value="">미지정</option>
          {availableSites.map((row) => (
            <option key={row.id} value={row.id}>{row.code} · {row.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>서비스 케이스</span>
        <select
          key={`case-${counterpartyId}`}
          name="caseId"
          disabled={!counterpartyId}
          defaultValue={availableCases.some((row) => row.id === initial?.caseId) ? initial?.caseId : ""}
        >
          <option value="">미지정</option>
          {availableCases.map((row) => (
            <option key={row.id} value={row.id}>{row.number} · {row.title}</option>
          ))}
        </select>
      </label>
      <label className="full">
        <span>정산 근거·사유</span>
        <textarea name="reason" maxLength={1000} rows={3} defaultValue={initial?.reason ?? ""} />
      </label>
      <label className="full">
        <span>비고</span>
        <textarea name="notes" maxLength={4000} rows={4} defaultValue={initial?.notes ?? ""} />
      </label>
      <div className="full"><FormMessage state={state} /></div>
      <div className="form-actions">
        <SubmitButton>{initial ? "운행일지 수정" : "운행일지 작성"}</SubmitButton>
      </div>
    </form>
  );
}
