export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

type ManualBrightnessPayload = { index: number; value: number };

export async function sendManualBrightnessCommands(
  address: string,
  payloads: ManualBrightnessPayload[],
  post = postJson
): Promise<void> {
  const sanitized = payloads
    .map(({ index, value }) => ({
      index: Number.isFinite(index) ? Math.trunc(index) : 0,
      value: Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0,
    }))
    .sort((a, b) => a.index - b.index);

  for (const { index, value } of sanitized) {
    await post(`/api/lights/${encodeURIComponent(address)}/brightness`, {
      brightness: value,
      color: index,
    });
  }
}
