// Small fetch wrapper: attaches the JWT and throws readable errors.
export async function api(path, { method = "GET", body, token } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.details ? data.details.join(", ") : data.error || "Request failed";
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}
