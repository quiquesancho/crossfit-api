export type VolumeGroupBy = "movement" | "family";

export type MovementReference = {
  id: string;
  code: string;
  name: string;
};

export type MovementFamilyReference = {
  id: string;
  code: string;
  name: string;
};

export type VolumeAggregate = {
  repetitions: number;
  technicalRepetitions: number;
  durationSeconds: number;
  technicalDurationSeconds: number;
  volumeKg: number;
  technicalVolumeKg: number;
  sessions: number;
  lastPracticedOn: string | null;
};

export type VolumeItem = VolumeAggregate & {
  movement: MovementReference | null;
  family: MovementFamilyReference;
};

export type VolumeQuery = {
  from: string;
  to: string;
  groupBy: VolumeGroupBy;
};

export type VolumeResponse = {
  from: string;
  to: string;
  groupBy: VolumeGroupBy;
  totals: VolumeAggregate;
  items: VolumeItem[];
};

export type ProgressReader = {
  getVolume(query: VolumeQuery): Promise<VolumeResponse>;
};

export class ProgressLocalAthleteNotFoundError extends Error {}
