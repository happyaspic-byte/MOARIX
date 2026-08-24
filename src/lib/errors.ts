export function publicError(error: unknown, fallback = "요청을 처리하지 못했습니다.") {
  if (error instanceof Error) {
    if (error.message.startsWith("Permission denied")) return "이 작업을 수행할 권한이 없습니다.";
    if (error.message.includes("duplicate key") || error.message.includes("unique constraint")) {
      return "이미 사용 중인 코드 또는 번호입니다.";
    }
    if (error.message.includes("Negative stock") || error.message.includes("Reserved stock")) {
      return error.message;
    }
    if (error.message.includes("last active owner")) return "회사의 마지막 소유자는 비활성화하거나 역할을 변경할 수 없습니다.";
    if (error.message.includes("cannot manage an owner")) return "관리자는 소유자 계정을 변경할 수 없습니다.";
    if (error.message.includes("cannot assign the owner role")) return "소유자 역할은 현재 소유자만 지정할 수 있습니다.";
  }
  return fallback;
}
