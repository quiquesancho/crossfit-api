export type PersonalRecordStatus = "suggested" | "confirmed" | "discarded";

export type PersonalRecordSourceType = "attempt" | "manual_historical";

export type MovementReference = {
  id: string;
  code: string;
  name: string;
};

export type ComplexReference = {
  id: string;
  code: string;
  name: string;
  versionNumber: number;
};

export type PersonalRecordView = {
  id: string;
  status: PersonalRecordStatus;
  sourceType: PersonalRecordSourceType;
  movement: MovementReference | null;
  complex: ComplexReference | null;
  repetitions: number;
  loadKg: number;
  achievedOn: string;
  confirmedAt: string | null;
  note: string | null;
  originAttemptId: string | null;
  previousLoadKg?: number | null;
};

export type PersonalRecordCursor = {
  achievedOn: string;
  id: string;
};

export type PersonalRecordListQuery = {
  movementId?: string;
  complexVersionId?: string;
  status?: PersonalRecordStatus;
  cursor?: PersonalRecordCursor;
  limit: number;
};

export type PersonalRecordPage = {
  items: PersonalRecordView[];
  nextCursor: string | null;
};

export type PersonalRecordReader = {
  list(query: PersonalRecordListQuery): Promise<PersonalRecordPage>;
  listCurrent(): Promise<PersonalRecordView[]>;
  listSuggestions(): Promise<PersonalRecordView[]>;
};

export type ManualPersonalRecordInput = {
  movementId?: string;
  complexVersionId?: string;
  repetitions: number;
  loadKg: number;
  achievedOn: string;
  note?: string;
};

export type PersonalRecordWriter = {
  createManual(id: string, input: ManualPersonalRecordInput): Promise<PersonalRecordView>;
  decide(id: string, decision: "confirmed" | "discarded"): Promise<PersonalRecordView>;
};

export type PersonalRecordValidationIssue = { path: string; message: string };

export class PersonalRecordLocalAthleteNotFoundError extends Error {}

export class PersonalRecordNotFoundError extends Error {}

export class PersonalRecordConflictError extends Error {
  constructor(
    public readonly code:
      | "not_better_than_current"
      | "record_not_suggested"
      | "manual_record_immutable"
      | "record_id_conflict",
    message: string,
  ) {
    super(message);
  }
}

export class PersonalRecordValidationError extends Error {
  constructor(public readonly issues: PersonalRecordValidationIssue[]) {
    super("Personal record validation failed.");
  }
}
