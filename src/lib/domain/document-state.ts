export const documentStatuses = ["draft", "submitted", "approved", "posted", "cancelled"] as const;
export type DocumentStatus = (typeof documentStatuses)[number];

const transitions: Record<DocumentStatus, ReadonlySet<DocumentStatus>> = {
  draft: new Set(["submitted", "cancelled"]),
  submitted: new Set(["draft", "approved", "cancelled"]),
  approved: new Set(["posted", "cancelled"]),
  posted: new Set(),
  cancelled: new Set(),
};

export function canTransitionDocument(from: DocumentStatus, to: DocumentStatus) {
  return transitions[from].has(to);
}

export function assertDocumentTransition(from: DocumentStatus, to: DocumentStatus) {
  if (!canTransitionDocument(from, to)) {
    throw new Error(`Invalid document transition: ${from} -> ${to}`);
  }
}
