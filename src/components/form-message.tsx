export type FormState = { status: "idle" | "success" | "error"; message?: string };
export const initialFormState: FormState = { status: "idle" };

export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>
      {state.message}
    </p>
  );
}
