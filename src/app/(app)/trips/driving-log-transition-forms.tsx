"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { DrivingLogStatus } from "@/lib/domain/driving-log-state";
import { transitionDrivingLogAction } from "./actions";

export function QuickDrivingLogAction({
  drivingLogId,
  expectedVersion,
  nextStatus,
  label,
}: {
  drivingLogId: string;
  expectedVersion: number;
  nextStatus: DrivingLogStatus;
  label: string;
}) {
  const [state, action] = useActionState(transitionDrivingLogAction, initialFormState);
  return (
    <form action={action} className="inline-action-form">
      <input type="hidden" name="drivingLogId" value={drivingLogId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      <SubmitButton className={`button small ${nextStatus === "approved" ? "primary" : ""}`}>
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ReasonDrivingLogAction({
  drivingLogId,
  expectedVersion,
  nextStatus,
  label,
}: {
  drivingLogId: string;
  expectedVersion: number;
  nextStatus: "draft" | "void";
  label: string;
}) {
  const [state, action] = useActionState(transitionDrivingLogAction, initialFormState);
  return (
    <form action={action} className="transition-form">
      <input type="hidden" name="drivingLogId" value={drivingLogId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      <input
        name="reason"
        maxLength={1000}
        required
        aria-label={`${label} 사유`}
        placeholder={`${label} 사유`}
      />
      <SubmitButton className={`button small ${nextStatus === "void" ? "danger" : ""}`}>
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
