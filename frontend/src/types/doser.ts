type ModeKind = 'single' | 'every_hour' | 'custom_periods' | 'timer';
type Weekday = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'; // UI chips

export interface DoserDevice {
  id: string;
  name?: string;
  timezone: string;                // e.g., "Australia/Sydney"
  heads: DoserHead[];              // length ≤ 4
  createdAt?: string;              // ISO
  updatedAt?: string;              // ISO
}

export interface DoserHead {
  index: 1|2|3|4;
  label?: string;                  // e.g., "APT Zero"
  active: boolean;                 // "Activate schedule" toggle
  schedule: Schedule;              // discriminated union (below)
  recurrence: { days: Weekday[] }; // "Every day" = all seven
  missedDoseCompensation: boolean; // UI toggle; requires battery
  volumeTracking?: {
    enabled: boolean;              // UI toggle "Enter Vol in container"
    capacityMl?: number;
    currentMl?: number;
    lowThresholdMl?: number;
    updatedAt?: string;
  };
  calibration: {
    mlPerSecond: number;           // derived from calibration
    lastCalibratedAt: string;      // e.g., "2025-09-11"
  };
  // (Optional runtime/status)
  stats?: { dosesToday?: number; mlDispensedToday?: number };
}

/** ---- Schedules (modes) ---- */

// 1) Single: one dose at a set time, per day selected in recurrence
export interface SingleSchedule {
  mode: 'single';
  dailyDoseMl: number;             // full volume for that single event
  startTime: string;               // "HH:mm" local (e.g., "08:57")
}

// 2) 24 Hourly: split the daily dose into 24 equal doses across the day
export interface EveryHourSchedule {
  mode: 'every_hour';
  dailyDoseMl: number;             // split into 24 equal parts
  startTime: string;               // first event time; then every 60 min
}

// 3) Custom Periods: define windows and how many doses in each window
export interface CustomPeriod {
  startTime: string;               // "HH:mm"
  endTime: string;                 // "HH:mm"
  doses: number;                   // number of doses inside this window
}

export interface CustomPeriodsSchedule {
  mode: 'custom_periods';
  dailyDoseMl: number;             // split evenly across all doses in all periods
  periods: CustomPeriod[];         // sum(doses) ≤ 24
}

// 4) Timer: specify exact dose times (and per-dose volumes)
export interface TimerDose {
  time: string;                    // "HH:mm"
  quantityMl: number;              // per-event volume
}

export interface TimerSchedule {
  mode: 'timer';
  doses: TimerDose[];              // length ≤ 24
  // (optional convenience shown in UI)
  defaultDoseQuantityMl?: number;  // used when creating new TimerDose entries
  // dailyDoseMl can be derived: sum(d.quantityMl), but keep cached if convenient
  dailyDoseMl?: number;
}

export type Schedule = SingleSchedule | EveryHourSchedule | CustomPeriodsSchedule | TimerSchedule;
export type { ModeKind, Weekday };
