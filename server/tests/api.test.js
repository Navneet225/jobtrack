const request = require("supertest");
const { createDb } = require("../src/db");
const { createApp } = require("../src/app");

let app;
beforeEach(() => {
  app = createApp(createDb(":memory:"), "test-secret");
});

const register = async (email = "a@x.com") => {
  const r = await request(app).post("/api/auth/register").send({ email, password: "password123" });
  return r.body.token;
};
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const sample = { company: "Acme", role: "Backend Dev", applied_date: "2026-10-01" };

describe("auth", () => {
  test("register returns token; duplicate email gives 409", async () => {
    const r1 = await request(app).post("/api/auth/register").send({ email: "a@x.com", password: "password123" });
    expect(r1.status).toBe(201);
    expect(r1.body.token).toBeTruthy();
    const r2 = await request(app).post("/api/auth/register").send({ email: "A@x.com", password: "password123" });
    expect(r2.status).toBe(409);
  });
  test("rejects weak password and bad email", async () => {
    expect((await request(app).post("/api/auth/register").send({ email: "a@x.com", password: "short" })).status).toBe(400);
    expect((await request(app).post("/api/auth/register").send({ email: "nope", password: "password123" })).status).toBe(400);
  });
  test("login works and wrong password gives 401", async () => {
    await register();
    expect((await request(app).post("/api/auth/login").send({ email: "a@x.com", password: "password123" })).status).toBe(200);
    expect((await request(app).post("/api/auth/login").send({ email: "a@x.com", password: "wrongpass1" })).status).toBe(401);
  });
  test("protected routes need a valid token", async () => {
    expect((await request(app).get("/api/applications")).status).toBe(401);
    expect((await request(app).get("/api/applications").set(auth("garbage"))).status).toBe(401);
  });
  test("passwords are not stored in plain text", async () => {
    const db = createDb(":memory:");
    const a = createApp(db, "s");
    await request(a).post("/api/auth/register").send({ email: "a@x.com", password: "password123" });
    const row = db.prepare("SELECT password_hash FROM users").get();
    expect(row.password_hash).not.toContain("password123");
    expect(row.password_hash.startsWith("$2")).toBe(true);
  });
});

describe("applications", () => {
  test("create, validate, update, delete", async () => {
    const t = await register();
    const c = await request(app).post("/api/applications").set(auth(t)).send(sample);
    expect(c.status).toBe(201);
    expect(c.body.status).toBe("applied");

    const bad = await request(app).post("/api/applications").set(auth(t)).send({ ...sample, applied_date: "01/10/2026" });
    expect(bad.status).toBe(400);

    const u = await request(app).patch(`/api/applications/${c.body.id}`).set(auth(t)).send({ status: "interview" });
    expect(u.status).toBe(200);
    expect(u.body.status).toBe("interview");

    expect((await request(app).patch(`/api/applications/${c.body.id}`).set(auth(t)).send({ status: "bogus" })).status).toBe(400);
    expect((await request(app).delete(`/api/applications/${c.body.id}`).set(auth(t))).status).toBe(204);
    expect((await request(app).delete(`/api/applications/${c.body.id}`).set(auth(t))).status).toBe(404);
  });

  test("PATCH only changes the fields that were sent", async () => {
    const t = await register();
    const c = await request(app).post("/api/applications").set(auth(t)).send({ ...sample, status: "interview", notes: "call on Monday" });
    const p = await request(app).patch(`/api/applications/${c.body.id}`).set(auth(t)).send({ company: "Acme Corp" });
    expect(p.body.company).toBe("Acme Corp");
    expect(p.body.status).toBe("interview");
    expect(p.body.notes).toBe("call on Monday");
    expect((await request(app).patch(`/api/applications/${c.body.id}`).set(auth(t)).send({})).status).toBe(400);
  });

  test("pagination, status filter and search", async () => {
    const t = await register();
    for (let i = 1; i <= 25; i++) {
      await request(app).post("/api/applications").set(auth(t)).send({
        company: i % 2 ? "Alpha" : "Beta",
        role: "Dev " + i,
        status: i % 5 === 0 ? "offer" : "applied",
        applied_date: `2026-10-${String(i).padStart(2, "0")}`,
      });
    }
    const p1 = await request(app).get("/api/applications?limit=10&page=1").set(auth(t));
    expect(p1.body.items).toHaveLength(10);
    expect(p1.body.total).toBe(25);
    expect(p1.body.pages).toBe(3);
    expect(p1.body.items[0].applied_date).toBe("2026-10-25"); // newest first
    const p3 = await request(app).get("/api/applications?limit=10&page=3").set(auth(t));
    expect(p3.body.items).toHaveLength(5);
    const offers = await request(app).get("/api/applications?status=offer").set(auth(t));
    expect(offers.body.total).toBe(5);
    const alpha = await request(app).get("/api/applications?q=alpha").set(auth(t));
    expect(alpha.body.total).toBe(13);
    expect((await request(app).get("/api/applications?status=nope").set(auth(t))).status).toBe(400);
  });

  test("users cannot see or modify each other's data", async () => {
    const t1 = await register("one@x.com");
    const t2 = await register("two@x.com");
    const c = await request(app).post("/api/applications").set(auth(t1)).send(sample);
    expect((await request(app).get("/api/applications").set(auth(t2))).body.total).toBe(0);
    expect((await request(app).patch(`/api/applications/${c.body.id}`).set(auth(t2)).send({ status: "offer" })).status).toBe(404);
    expect((await request(app).delete(`/api/applications/${c.body.id}`).set(auth(t2))).status).toBe(404);
    expect((await request(app).get("/api/applications").set(auth(t1))).body.total).toBe(1);
  });

  test("stats count applications by status", async () => {
    const t = await register();
    for (const s of ["applied", "applied", "interview", "offer"]) {
      await request(app).post("/api/applications").set(auth(t)).send({ ...sample, status: s });
    }
    const r = await request(app).get("/api/stats").set(auth(t));
    expect(r.body).toEqual({ total: 4, byStatus: { applied: 2, interview: 1, offer: 1, rejected: 0 } });
  });
});
