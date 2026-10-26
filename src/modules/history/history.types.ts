export type ExecutionSummaryStatus = "draft" | "completed";
export type ExecutionOrigin = "planned" | "free";

export type ExecutionSummaryView = {
  id: string;
  executionDate: string;
  status: ExecutionSummaryStatus;
  origin: ExecutionOrigin;
  title: string;
  plannedSessionId: string | null;
  blockCount: number;
  rpe: number | null;
  revision: number;
  updatedAt: string;
};

export type ExecutionHistoryCursor = {
  executionDate: string;
  id: string;
};

export type ExecutionHistoryQuery = {
  from?: string;
  to?: string;
  cursor?: ExecutionHistoryCursor;
  limit: number;
};

export type ExecutionHistoryPage = {
  items: ExecutionSummaryView[];
  nextCursor: string | null;
};

export type CalendarPlannedSessionView = {
  id: string;
  title: string;
  objective: string | null;
};

export type CalendarDayView = {
  date: string;
  planned: CalendarPlannedSessionView[];
  executions: ExecutionSummaryView[];
};

export type CalendarView = {
  days: CalendarDayView[];
};

export type ExecutionHistoryReader = {
  listExecutions(query: ExecutionHistoryQuery): Promise<ExecutionHistoryPage>;
  getCalendar(from: string, to: string): Promise<CalendarView>;
};

export const FREE_TRAINING_TITLE = "Entrenamiento libre";
