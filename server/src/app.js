const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const STATUSES = ["applied", "interview", "offer", "rejected"];

const credsSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(100),
});
const appFields = {
  company: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(120),
  status: z.enum(STATUSES),
  applied_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD"),
  notes: z.string().max(2000),
};
// Create: status and notes get defaults when missing.
const appSchema = z.object({
  ...appFields,
  status: appFields.status.default("applied"),
  notes: appFields.notes.default(""),
});
// Update: every field optional and NO defaults, so a PATCH never overwrites fields it did not send.
const appPatchSchema = z.object(appFields).partial().refine((o) => Object.keys(o).length > 0, {
  message: "no fields to update",
});

function createApp(db, jwtSecret) {
  if (!jwtSecret) throw new Error("JWT secret is required");
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "50kb" }));

  const validate = (schema) => (req, res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      return res.status(400).json({ error: "validation_failed", details: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
    }
    req.body = r.data;
    next();
  };

  const auth = (req, res, next) => {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: "missing_token" });
    try {
      req.userId = jwt.verify(token, jwtSecret).sub;
      next();
    } catch {
      res.status(401).json({ error: "invalid_token" });
    }
  };

  const sign = (id) => jwt.sign({ sub: id }, jwtSecret, { expiresIn: "7d" });

  // ---------- auth ----------
  app.post("/api/auth/register", validate(credsSchema), (req, res) => {
    const { email, password } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    try {
      const info = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email.toLowerCase(), hash);
      res.status(201).json({ token: sign(info.lastInsertRowid) });
    } catch (e) {
      if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "email_taken" });
      throw e;
    }
  });

  app.post("/api/auth/login", validate(credsSchema), (req, res) => {
    const { email, password } = req.body;
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    res.json({ token: sign(user.id) });
  });

  // ---------- applications (all scoped to the logged-in user) ----------
  app.get("/api/applications", auth, (req, res) => {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
    const where = ["user_id = ?"];
    const params = [req.userId];
    if (req.query.status) {
      if (!STATUSES.includes(req.query.status)) return res.status(400).json({ error: "bad_status" });
      where.push("status = ?");
      params.push(req.query.status);
    }
    if (req.query.q) {
      where.push("(company LIKE ? OR role LIKE ?)");
      params.push(`%${req.query.q}%`, `%${req.query.q}%`);
    }
    const w = where.join(" AND ");
    const total = db.prepare(`SELECT COUNT(*) c FROM applications WHERE ${w}`).get(...params).c;
    const items = db
      .prepare(`SELECT * FROM applications WHERE ${w} ORDER BY applied_date DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, (page - 1) * limit);
    res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
  });

  app.post("/api/applications", auth, validate(appSchema), (req, res) => {
    const a = req.body;
    const info = db
      .prepare("INSERT INTO applications (user_id, company, role, status, applied_date, notes) VALUES (?,?,?,?,?,?)")
      .run(req.userId, a.company, a.role, a.status, a.applied_date, a.notes);
    res.status(201).json(db.prepare("SELECT * FROM applications WHERE id = ?").get(info.lastInsertRowid));
  });

  const owned = (req) => db.prepare("SELECT * FROM applications WHERE id = ? AND user_id = ?").get(req.params.id, req.userId);

  app.patch("/api/applications/:id", auth, validate(appPatchSchema), (req, res) => {
    if (!owned(req)) return res.status(404).json({ error: "not_found" });
    const fields = Object.keys(req.body);
    const sets = fields.map((f) => `${f} = ?`).join(", ");
    db.prepare(`UPDATE applications SET ${sets} WHERE id = ? AND user_id = ?`).run(...fields.map((f) => req.body[f]), req.params.id, req.userId);
    res.json(owned(req));
  });

  app.delete("/api/applications/:id", auth, (req, res) => {
    if (!owned(req)) return res.status(404).json({ error: "not_found" });
    db.prepare("DELETE FROM applications WHERE id = ? AND user_id = ?").run(req.params.id, req.userId);
    res.status(204).end();
  });

  app.get("/api/stats", auth, (req, res) => {
    const rows = db.prepare("SELECT status, COUNT(*) c FROM applications WHERE user_id = ? GROUP BY status").all(req.userId);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    rows.forEach((r) => (byStatus[r.status] = r.c));
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    res.json({ total, byStatus });
  });

  app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "bad_json" });
    console.error(err);
    res.status(500).json({ error: "server_error" });
  });

  return app;
}

module.exports = { createApp, STATUSES };
