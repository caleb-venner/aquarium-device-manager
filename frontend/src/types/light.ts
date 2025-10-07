import type { Weekday } from './doser';

type Interp = 'step' | 'linear';

export interface ChannelDef {
  key: string;            // e.g., "R", "G", "B", "W"
  label?: string;         // UI name
  min?: number;           // default 0
  max?: number;           // default 100
  step?: number;          // default 1
}

export type ChannelLevels = Record<string, number>; // {R:74,G:50,B:82,W:30}

export interface LightDevice {
  id: string;
  name?: string;
  timezone: string;       // "Australia/Sydney"
  channels: ChannelDef[]; // order for UI sliders
  profile: Profile;       // discriminated union below
  createdAt?: string;
  updatedAt?: string;
}

/* --------- Modes --------- */

// Manual: fixed levels
export interface ManualProfile {
  mode: 'manual';
  levels: ChannelLevels;  // all channel keys present, 0..100
}

// Custom: up to 24 points with levels; piecewise interpolation
export interface CustomPoint {
  time: string;           // "HH:mm"
  levels: ChannelLevels;
}

export interface CustomProfile {
  mode: 'custom';
  interpolation: Interp;  // 'linear' approximates "ramp"; 'step' holds
  points: CustomPoint[];  // ≤ 24, strictly increasing times
}

// Auto: up to 7 programs
export interface AutoProgram {
  id: string;
  label?: string;
  enabled: boolean;
  days: Weekday[];        // day mask chips from UI
  sunrise: string;        // "HH:mm"
  sunset: string;         // "HH:mm" (must be after sunrise)
  rampMinutes: number;    // e.g., 0, 30, 60, ...
  levels: ChannelLevels;  // peak levels during "day"
}

export interface AutoProfile {
  mode: 'auto';
  programs: AutoProgram[]; // ≤ 7
}

export type Profile = ManualProfile | CustomProfile | AutoProfile;
export type { Interp };
