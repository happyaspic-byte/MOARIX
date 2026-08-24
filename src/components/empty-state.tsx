import { Inbox } from "lucide-react";

export function EmptyState({ title = "표시할 데이터가 없습니다.", description = "새 항목을 등록하면 여기에 표시됩니다." }) {
  return (
    <div className="empty-state">
      <Inbox size={28} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
