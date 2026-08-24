export default function Loading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <span className="spinner" />
      데이터를 불러오는 중입니다.
    </div>
  );
}
