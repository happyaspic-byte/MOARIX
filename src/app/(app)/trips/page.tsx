import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { CarFront, CircleCheck, Clock3, MapPinned, Plus, ReceiptText } from "lucide-react";
import { DrawerCloseButton } from "@/components/drawer-close-button";
import { EmptyState } from "@/components/empty-state";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requirePermission } from "@/lib/auth/current";
import {
  currentDrivingLogMonth,
  drivingLogStatuses,
  drivingLogWorkspaceActions,
  type DrivingLogStatus,
} from "@/lib/domain/driving-log-state";
import { formatMoney } from "@/lib/domain/money";
import { hasPermission } from "@/lib/security/permissions";
import {
  getDrivingLog,
  getDrivingLogMonthSummary,
  listDrivingLogs,
} from "@/lib/services/driving-logs";
import { listCounterparties } from "@/lib/services/master-data";
import { listCustomerSites } from "@/lib/services/operations-service";
import { listServiceCases } from "@/lib/services/service-cases";
import { drivingLogListSchema } from "@/lib/validation/forms";
import { DrivingLogForm } from "./driving-log-form";
import {
  QuickDrivingLogAction,
  ReasonDrivingLogAction,
} from "./driving-log-transition-forms";

export const metadata: Metadata = { title: "운행일지" };
export const dynamic = "force-dynamic";

type SearchValue = string | string[] | undefined;

function first(value: SearchValue) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function isDrivingLogStatus(value: string): value is DrivingLogStatus {
  return drivingLogStatuses.includes(value as DrivingLogStatus);
}

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchValue>>;
}) {
  const session = await requirePermission("trips:read");
  const query = await searchParams;
  const defaultMonth = currentDrivingLogMonth(session.companyTimezone);
  const requestedMonth = first(query.month);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
    ? requestedMonth
    : defaultMonth;
  const requestedStatus = first(query.status);
  const requestedQuery = first(query.q);
  const parsedFilters = drivingLogListSchema.safeParse({
    month,
    status: isDrivingLogStatus(requestedStatus) ? requestedStatus : undefined,
    query: requestedQuery || undefined,
    limit: 200,
  });
  const filters = parsedFilters.success
    ? parsedFilters.data
    : { month, limit: 200 };
  const status = filters.status;
  const search = filters.query ?? "";
  const canWrite = hasPermission(session.role, "trips:write");
  const canApprove = hasPermission(session.role, "trips:approve");
  const editParse = z.uuid().safeParse(first(query.edit));
  const editId = editParse.success ? editParse.data : undefined;

  const [logs, summary, counterparties, sites, serviceCases, editing] = await Promise.all([
    listDrivingLogs(session, filters),
    getDrivingLogMonthSummary(session, month),
    listCounterparties(session.companyId),
    listCustomerSites(session.companyId),
    listServiceCases(session.companyId),
    canWrite && editId ? getDrivingLog(session, editId) : Promise.resolve(null),
  ]);

  const customers = counterparties.filter(
    (row) => row.is_active && row.kind !== "supplier",
  );
  const draftToEdit = editing?.status === "draft" ? editing : null;
  const createPanel = canWrite ? (
    <details className="create-panel" open={Boolean(draftToEdit)}>
      <summary className="button primary">
        <Plus size={17} />{draftToEdit ? `${draftToEdit.number} 수정` : "운행일지 작성"}
      </summary>
      <div className="create-drawer">
        <div className="drawer-head">
          <div>
            <h2>{draftToEdit ? `${draftToEdit.number} 수정` : "새 운행일지"}</h2>
            <p>운행 경로와 실비를 기록합니다. 제출 후에는 승인자만 승인할 수 있습니다.</p>
          </div>
          <DrawerCloseButton />
        </div>
        <DrivingLogForm
          counterparties={customers}
          sites={sites}
          serviceCases={serviceCases}
          today={`${month}-01`}
          initial={draftToEdit ? {
            drivingLogId: draftToEdit.id,
            expectedVersion: draftToEdit.version,
            startDate: draftToEdit.start_date,
            endDate: draftToEdit.end_date,
            departure: draftToEdit.departure,
            destination: draftToEdit.destination,
            purpose: draftToEdit.purpose,
            vehicleName: draftToEdit.vehicle_name,
            distanceKm: draftToEdit.distance_km,
            ratePerKm: draftToEdit.rate_per_km,
            tollAmount: draftToEdit.toll_amount,
            parkingAmount: draftToEdit.parking_amount,
            fuelAmount: draftToEdit.fuel_amount,
            dailyAllowanceAmount: draftToEdit.daily_allowance_amount,
            counterpartyId: draftToEdit.counterparty_id ?? "",
            siteId: draftToEdit.site_id ?? "",
            caseId: draftToEdit.case_id ?? "",
            reason: draftToEdit.reason ?? "",
            notes: draftToEdit.notes ?? "",
          } : undefined}
        />
      </div>
    </details>
  ) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="FIELD TRIP LEDGER"
        title="운행일지"
        description="현장 방문 경로와 교통·차량 비용을 기록하고 작성자와 승인자를 분리해 정산 근거를 남깁니다."
        actions={createPanel}
      />
      <div className="metric-grid">
        <MetricCard
          label="월 운행 거리"
          value={`${formatMoney(summary.distance_km, "")} km`}
          helper={`유효 운행 ${summary.entry_count - summary.void_count}건`}
          icon={MapPinned}
          tone="blue"
        />
        <MetricCard
          label="월 청구액"
          value={formatMoney(summary.claimed_total_amount, "KRW")}
          helper={`작성 ${summary.entry_count}건 · 무효 ${summary.void_count}건`}
          icon={ReceiptText}
        />
        <MetricCard
          label="승인 대기"
          value={formatMoney(summary.pending_total_amount, "KRW")}
          helper={`${summary.submitted_count}건 처리 필요`}
          icon={Clock3}
          tone="amber"
        />
        <MetricCard
          label="승인 완료"
          value={formatMoney(summary.approved_total_amount, "KRW")}
          helper={`${summary.approved_count}건 승인`}
          icon={CircleCheck}
          tone="teal"
        />
      </div>
      <nav className="filter-bar" aria-label="운행일지 빠른 필터">
        <Link
          className={`button small ${!status ? "primary" : ""}`}
          href={`/trips?month=${encodeURIComponent(month)}`}
        >
          전체 상태
        </Link>
        <Link
          className={`button small ${status === "submitted" ? "primary" : ""}`}
          href={`/trips?month=${encodeURIComponent(month)}&status=submitted`}
        >
          승인 큐 {summary.submitted_count}
        </Link>
      </nav>
      <section className="card">
        <header className="card-header">
          <div>
            <h2>{month} 운행 기록</h2>
            <p>표시 {logs.length}건 · 최신 운행순</p>
          </div>
          <CarFront size={18} aria-hidden="true" />
        </header>
        <form className="filter-bar" method="get">
          <input type="month" name="month" defaultValue={month} required />
          <select name="status" defaultValue={status ?? ""}>
            <option value="">전체 상태</option>
            <option value="draft">작성 중</option>
            <option value="submitted">승인 대기</option>
            <option value="approved">승인됨</option>
            <option value="void">무효</option>
          </select>
          <input
            name="q"
            maxLength={200}
            defaultValue={search}
            placeholder="번호·경로·목적·차량 검색"
          />
          <button className="button small" type="submit">조회</button>
        </form>
        {logs.length === 0 ? (
          <EmptyState
            title="조건에 맞는 운행일지가 없습니다."
            description="필터를 변경하거나 새 운행일지를 작성하세요."
          />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>일자·번호</th>
                  <th>경로</th>
                  <th>목적·차량</th>
                  <th>고객·케이스</th>
                  <th>작성자</th>
                  <th className="numeric">거리</th>
                  <th className="numeric">청구액</th>
                  <th>상태</th>
                  {canWrite || canApprove ? <th>처리</th> : null}
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => {
                  const actions = drivingLogWorkspaceActions(row.status, {
                    canWrite,
                    canApprove,
                    isCreator: row.created_by === session.userId,
                  });
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="table-title">
                          <strong>{row.start_date === row.end_date ? row.start_date : `${row.start_date}–${row.end_date}`}</strong>
                          <small>{row.number}</small>
                        </div>
                      </td>
                      <td>
                        <div className="table-title">
                          <strong>{row.departure} → {row.destination}</strong>
                          <small>{row.site_name ?? "사업장 미지정"}</small>
                        </div>
                      </td>
                      <td>
                        <div className="table-title">
                          <strong>{row.purpose}</strong>
                          <small>{row.vehicle_name}</small>
                        </div>
                      </td>
                      <td>
                        <div className="table-title">
                          <strong>{row.counterparty_name ?? "미지정"}</strong>
                          <small>{row.case_number ?? "케이스 미지정"}</small>
                        </div>
                      </td>
                      <td>{row.created_by_name}</td>
                      <td className="numeric">{formatMoney(row.distance_km, "")} km</td>
                      <td className="numeric"><strong>{formatMoney(row.total_amount, "KRW")}</strong></td>
                      <td>
                        <div className="table-title">
                          <StatusBadge status={row.status} />
                          {row.approved_by_name ? <small>승인 {row.approved_by_name}</small> : null}
                          {row.void_reason ? <small>무효: {row.void_reason}</small> : null}
                        </div>
                      </td>
                      {canWrite || canApprove ? (
                        <td>
                          <div className="row-actions">
                            {actions.includes("edit") ? (
                              <Link className="button small" href={`/trips?month=${encodeURIComponent(month)}&edit=${row.id}`}>수정</Link>
                            ) : null}
                            {actions.includes("submit") ? (
                              <QuickDrivingLogAction
                                drivingLogId={row.id}
                                expectedVersion={row.version}
                                nextStatus="submitted"
                                label="제출"
                              />
                            ) : null}
                            {actions.includes("return") ? (
                              <ReasonDrivingLogAction
                                drivingLogId={row.id}
                                expectedVersion={row.version}
                                nextStatus="draft"
                                label="반려"
                              />
                            ) : null}
                            {actions.includes("approve") ? (
                              <QuickDrivingLogAction
                                drivingLogId={row.id}
                                expectedVersion={row.version}
                                nextStatus="approved"
                                label="승인"
                              />
                            ) : null}
                            {actions.includes("void") ? (
                              <ReasonDrivingLogAction
                                drivingLogId={row.id}
                                expectedVersion={row.version}
                                nextStatus="void"
                                label="무효"
                              />
                            ) : null}
                            {actions.length === 0 ? <span className="muted">처리 완료</span> : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
