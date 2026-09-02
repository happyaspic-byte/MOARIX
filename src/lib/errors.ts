export function publicError(error: unknown, fallback = "요청을 처리하지 못했습니다.") {
  if (error instanceof Error) {
    if (error.message.startsWith("Permission denied")) return "이 작업을 수행할 권한이 없습니다.";
    if (error.message.includes("duplicate key") || error.message.includes("unique constraint")) {
      return "이미 사용 중인 코드 또는 번호입니다.";
    }
    if (error.message.includes("Negative stock") || error.message.includes("Reserved stock")) {
      return error.message;
    }
    if (error.message.includes("Warehouse is required")) return "수주·출고·입고를 확정하려면 창고를 선택하세요.";
    if (error.message.includes("Driving log version conflict") || error.message.includes("Document version conflict")) {
      return "다른 사용자가 이 운행일지를 먼저 수정했습니다. 다시 불러오세요.".replace("운행일지", error.message.includes("Document") ? "문서" : "운행일지");
    }
    if (error.message.includes("Self approval")) return "작성자는 자신의 운행일지를 승인할 수 없습니다.";
    if (error.message.includes("Void reason is required")) return "무효 처리 사유를 입력하세요.";
    if (error.message.includes("Return reason is required")) return "반려 사유를 입력하세요.";
    if (error.message.includes("Invalid driving log transition")) return "현재 상태에서 요청한 운행일지 상태로 변경할 수 없습니다.";
    if (error.message.includes("last active owner")) return "회사의 마지막 소유자는 비활성화하거나 역할을 변경할 수 없습니다.";
    if (error.message.includes("cannot manage an owner")) return "관리자는 소유자 계정을 변경할 수 없습니다.";
    if (error.message.includes("cannot assign the owner role")) return "소유자 역할은 현재 소유자만 지정할 수 있습니다.";
    if (error.message.includes("Counterparty not found")) return "거래처를 찾을 수 없습니다.";
    if (error.message.includes("Counterparty has linked assets")) return "연결된 운영 자산이 있어 거래처를 삭제할 수 없습니다. 자산을 먼저 옮기거나 퇴역하세요.";
    if (error.message.includes("Counterparty has linked sites")) return "연결된 사업장이 있어 거래처를 삭제할 수 없습니다. 사업장을 먼저 삭제하세요.";
    if (error.message.includes("Counterparty has linked documents")) return "연결된 거래 문서가 있어 거래처를 삭제할 수 없습니다.";
    if (error.message.includes("Counterparty has linked cases")) return "진행 중인 서비스 케이스가 있어 거래처를 삭제할 수 없습니다.";
    if (error.message.includes("Counterparty still has customer records")) return "연결된 사업장·자산·케이스가 있어 고객 유형을 해제할 수 없습니다.";
    if (error.message.includes("Counterparty already inactive")) return "이미 삭제된 거래처입니다.";
    if (error.message.includes("Customer site already inactive")) return "이미 삭제된 사업장입니다.";
    if (error.message.includes("Customer site not found")) return "사업장을 찾을 수 없습니다.";
    if (error.message.includes("Customer site has linked assets")) return "연결된 운영 자산이 있어 사업장을 삭제하거나 고객사를 바꿀 수 없습니다. 자산을 먼저 옮기거나 퇴역하세요.";
    if (error.message.includes("Customer site has linked cases")) return "진행 중인 서비스 케이스가 있어 사업장을 삭제할 수 없습니다.";
    if (error.message.includes("Customer site mismatch")) return "선택한 사업장이 고객사에 속하지 않습니다.";
    if (error.message.includes("Service case customer mismatch")) return "활성 고객사만 서비스 케이스에 연결할 수 있습니다.";
    if (error.message.includes("Service case asset mismatch")) return "선택한 자산이 고객사에 속하지 않습니다.";
    if (error.message.includes("Service case not found")) return "서비스 케이스를 찾을 수 없습니다.";
    if (error.message.includes("External activity author is required")) return "외부 회신의 작성자를 입력하세요.";
    if (error.message.includes("HTTPS URL required")) return "사용자 정보가 포함되지 않은 HTTPS 주소를 입력하세요.";
    if (error.message.includes("Asset site is required")) return "사업장이 연결된 자산만 점검할 수 있습니다.";
    if (error.message.includes("Invalid service case transition")) return "현재 상태에서 요청한 케이스 상태로 변경할 수 없습니다.";
    if (error.message.includes("Invalid inspection transition")) return "현재 상태에서 요청한 점검 상태로 변경할 수 없습니다.";
    if (error.message.includes("Waiting reason is required")) return "대기 상태로 변경하려면 대기 사유가 필요합니다.";
    if (error.message.includes("Resolution summary is required")) return "해결 처리하려면 해결 내용을 입력하세요.";
    if (error.message.includes("Inspection result is incomplete")) return "시스템·Protection·Sync·Service 점검 결과를 모두 입력하세요.";
    if (error.message.includes("Inspection findings are required")) return "조치 필요 상태에서는 발견 사항을 입력하세요.";
  }
  return fallback;
}
