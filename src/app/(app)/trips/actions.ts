"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/components/form-message";
import { requirePermission } from "@/lib/auth/current";
import { publicError } from "@/lib/errors";
import {
  createDrivingLog,
  transitionDrivingLog,
  updateDrivingLog,
} from "@/lib/services/driving-logs";
import {
  drivingLogSchema,
  drivingLogTransitionSchema,
  drivingLogUpdateSchema,
} from "@/lib/validation/forms";

function refreshDrivingLogs() {
  revalidatePath("/trips");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
}

export async function createDrivingLogAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = drivingLogSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }
  try {
    const session = await requirePermission("trips:write");
    const result = await createDrivingLog(session, parsed.data);
    refreshDrivingLogs();
    return { status: "success", message: `${result.number} 운행일지를 작성했습니다.` };
  } catch (error) {
    return {
      status: "error",
      message: publicError(error, "운행일지를 작성하지 못했습니다."),
    };
  }
}

export async function updateDrivingLogAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = drivingLogUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }
  try {
    const session = await requirePermission("trips:write");
    const result = await updateDrivingLog(session, parsed.data);
    refreshDrivingLogs();
    return { status: "success", message: `${result.number} 운행일지를 수정했습니다.` };
  } catch (error) {
    return {
      status: "error",
      message: publicError(error, "운행일지를 수정하지 못했습니다."),
    };
  }
}

export async function transitionDrivingLogAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = drivingLogTransitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요.",
    };
  }
  try {
    const session = await requirePermission(
      parsed.data.nextStatus === "approved" ? "trips:approve" : "trips:write",
    );
    const result = await transitionDrivingLog(session, parsed.data);
    refreshDrivingLogs();
    return { status: "success", message: `${result.number} 상태를 변경했습니다.` };
  } catch (error) {
    return {
      status: "error",
      message: publicError(error, "운행일지 상태를 변경하지 못했습니다."),
    };
  }
}
