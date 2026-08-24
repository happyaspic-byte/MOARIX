const statusLabels: Record<string, string> = {
  draft: "작성 중",
  submitted: "승인 대기",
  approved: "승인됨",
  posted: "확정",
  cancelled: "취소",
  active: "운영 중",
  maintenance: "점검 중",
  retired: "폐기",
  open: "접수",
  in_progress: "처리 중",
  waiting: "대기",
  resolved: "해결",
  closed: "종료",
  low: "낮음",
  normal: "보통",
  high: "높음",
  critical: "긴급",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`}>{statusLabels[status] ?? status}</span>;
}
