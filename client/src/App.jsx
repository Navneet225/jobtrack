import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

const STATUSES = ["applied", "interview", "offer", "rejected"];

function AuthForm({ onToken }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const { token } = await api(`/api/auth/${mode}`, { method: "POST", body: { email, password } });
      onToken(token);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="card auth" onSubmit={submit}>
      <h1>JobTrack</h1>
      <p className="muted">Track your job applications in one place.</p>
      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="error">{error}</p>}
      <button type="submit">{mode === "login" ? "Log in" : "Create account"}</button>
      <button type="button" className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "New here? Register" : "Have an account? Log in"}
      </button>
    </form>
  );
}

function AddForm({ onAdd }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ company: "", role: "", status: "applied", applied_date: today, notes: "" });
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await onAdd(f);
      setF({ ...f, company: "", role: "", notes: "" });
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <form className="card add" onSubmit={submit}>
      <input placeholder="Company" value={f.company} onChange={set("company")} required />
      <input placeholder="Role" value={f.role} onChange={set("role")} required />
      <select value={f.status} onChange={set("status")}>
        {STATUSES.map((s) => <option key={s}>{s}</option>)}
      </select>
      <input type="date" value={f.applied_date} onChange={set("applied_date")} required />
      <button type="submit">Add</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams({ page, limit: 8 });
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    try {
      const [list, st] = await Promise.all([
        api(`/api/applications?${params}`, { token }),
        api("/api/stats", { token }),
      ]);
      setData(list);
      setStats(st);
    } catch (err) {
      if (err.status === 401) logout();
    }
  }, [token, page, status, q, logout]);

  useEffect(() => { load(); }, [load]);

  if (!token) {
    return <AuthForm onToken={(t) => { localStorage.setItem("token", t); setToken(t); }} />;
  }

  const add = async (body) => { await api("/api/applications", { method: "POST", body, token }); setPage(1); await load(); };
  const update = async (id, patch) => { await api(`/api/applications/${id}`, { method: "PATCH", body: patch, token }); await load(); };
  const remove = async (id) => { await api(`/api/applications/${id}`, { method: "DELETE", token }); await load(); };

  return (
    <main>
      <header>
        <h1>JobTrack</h1>
        <button className="link" onClick={logout}>Log out</button>
      </header>

      {stats && (
        <section className="stats">
          <div className="card"><b>{stats.total}</b><span>Total</span></div>
          {STATUSES.map((s) => (
            <div className="card" key={s}><b>{stats.byStatus[s]}</b><span>{s}</span></div>
          ))}
        </section>
      )}

      <AddForm onAdd={add} />

      <section className="filters">
        <input placeholder="Search company or role" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </section>

      <table className="card">
        <thead><tr><th>Company</th><th>Role</th><th>Applied</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {data.items.map((a) => (
            <tr key={a.id}>
              <td>{a.company}</td>
              <td>{a.role}</td>
              <td>{a.applied_date}</td>
              <td>
                <select value={a.status} onChange={(e) => update(a.id, { status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </td>
              <td><button className="link danger" onClick={() => remove(a.id)}>Delete</button></td>
            </tr>
          ))}
          {data.items.length === 0 && <tr><td colSpan="5" className="muted">No applications yet.</td></tr>}
        </tbody>
      </table>

      <footer>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
        <span>Page {page} of {Math.max(data.pages, 1)}</span>
        <button disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
      </footer>
    </main>
  );
}
