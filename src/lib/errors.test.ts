import { describe, expect, it } from "vitest";
import { publicError } from "./errors";

describe("publicError", () => {
  it("maps warehouse and driving log field messages", () => {
    expect(publicError(new Error("Warehouse is required to post a shipment or receipt"))).toBe(
      "출고·입고를 확정하려면 창고를 선택하세요.",
    );
    expect(publicError(new Error("Driving log version conflict"))).toBe("다른 사용자가 이 운행일지를 먼저 수정했습니다. 다시 불러오세요.");
    expect(publicError(new Error("Self approval is not allowed for driving logs"))).toBe("작성자는 자신의 운행일지를 승인할 수 없습니다.");
    expect(publicError(new Error("Void reason is required"))).toBe("무효 처리 사유를 입력하세요.");
    expect(publicError(new Error("Return reason is required"))).toBe("반려 사유를 입력하세요.");
    expect(publicError(new Error("Invalid driving log transition: approved -> submitted"))).toBe(
      "현재 상태에서 요청한 운행일지 상태로 변경할 수 없습니다.",
    );
  });
});
