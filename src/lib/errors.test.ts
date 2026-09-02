import { describe, expect, it } from "vitest";
import { publicError } from "./errors";

describe("publicError", () => {
  it("maps warehouse and driving log field messages", () => {
    expect(publicError(new Error("Warehouse is required to post a shipment, receipt, or sales order"))).toBe(
      "수주·출고·입고를 확정하려면 창고를 선택하세요.",
    );
    expect(publicError(new Error("Driving log version conflict"))).toBe("다른 사용자가 이 운행일지를 먼저 수정했습니다. 다시 불러오세요.");
    expect(publicError(new Error("Document version conflict"))).toBe("다른 사용자가 이 문서를 먼저 수정했습니다. 다시 불러오세요.");
    expect(publicError(new Error("Self approval is not allowed for driving logs"))).toBe("작성자는 자신의 운행일지를 승인할 수 없습니다.");
    expect(publicError(new Error("Void reason is required"))).toBe("무효 처리 사유를 입력하세요.");
    expect(publicError(new Error("Return reason is required"))).toBe("반려 사유를 입력하세요.");
    expect(publicError(new Error("Invalid driving log transition: approved -> submitted"))).toBe(
      "현재 상태에서 요청한 운행일지 상태로 변경할 수 없습니다.",
    );
    expect(publicError(new Error("Counterparty has linked assets"))).toBe(
      "연결된 운영 자산이 있어 거래처를 삭제할 수 없습니다. 자산을 먼저 옮기거나 퇴역하세요.",
    );
    expect(publicError(new Error("Customer site has linked assets"))).toBe(
      "연결된 운영 자산이 있어 사업장을 삭제하거나 고객사를 바꿀 수 없습니다. 자산을 먼저 옮기거나 퇴역하세요.",
    );
    expect(publicError(new Error("Counterparty not found"))).toBe("거래처를 찾을 수 없습니다.");
    expect(publicError(new Error("Counterparty has linked sites"))).toBe(
      "연결된 사업장이 있어 거래처를 삭제할 수 없습니다. 사업장을 먼저 삭제하세요.",
    );
    expect(publicError(new Error("Customer site not found"))).toBe("사업장을 찾을 수 없습니다.");
  });
});
