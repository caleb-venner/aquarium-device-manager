export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function pad2(value: number | null | undefined): string {
  if (!Number.isFinite(value ?? Number.NaN)) {
    return "00";
  }
  const normalized = Math.max(0, Math.min(99, Math.floor(value ?? 0)));
  return normalized.toString().padStart(2, "0");
}

export function formatRawPayload(hex: string): string {
  const cleaned = hex.replace(/\s+/g, "");
  const bytes: string[] = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    const part = cleaned.substring(i, i + 2);
    if (part.length === 2) {
      bytes.push(part.toUpperCase());
    }
  }
  return bytes.join(" ");
}

export function formatTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp)) {
    return "Unknown";
  }
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return `${date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })} ${date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

export function formatDayTime(
  weekday: number | null,
  hour: number | null,
  minute: number | null
): string {
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return "";
  }
  const time = `${pad2(hour)}:${pad2(minute)}`;
  if (Number.isFinite(weekday) && weekday !== null) {
    const index = Math.max(0, Math.min(WEEKDAY_NAMES.length - 1, Math.floor(weekday)));
    return `${WEEKDAY_NAMES[index]} ${time}`;
  }
  return time;
}

export function renderNotice(
  message: string,
  variant: "info" | "success" | "warning" | "error" = "info",
  escape = escapeHtml
): string {
  const role = variant === "error" ? "alert" : "status";
  const classes = ["notice", variant !== "info" ? variant : ""].filter(Boolean).join(" ");
  return `<div class="${classes}" role="${role}">${escape(message)}</div>`;
}

export function renderParsedRaw(parsed: Record<string, unknown> | null): string {
  if (!parsed) {
    return "<em>No decoded payload</em>";
  }
  try {
    const json = JSON.stringify(parsed, null, 2);
    return `<pre class="code-block">${escapeHtml(json)}</pre>`;
  } catch {
    return "<em>Unable to render decoded payload</em>";
  }
}
