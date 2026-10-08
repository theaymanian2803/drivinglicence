// server/serverless.ts
import { handle } from "hono/vercel";

// server/env.ts
import { readFileSync } from "node:fs";
import path from "node:path";
function loadEnvFile(file) {
  const envPath = path.resolve(process.cwd(), file);
  try {
    const content = readFileSync(envPath, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!key) continue;
      if (process.env[key] !== void 0) continue;
      let value = line.slice(eq + 1).trim();
      value = value.replace(/^["']|["']$/g, "");
      process.env[key] = value;
    }
  } catch {
  }
}
loadEnvFile(".env");

// server/app.ts
import { Hono as Hono13 } from "hono";

// server/routes/auth.ts
import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";

// server/db.ts
import { createClient } from "@libsql/client";
import { readdir, readFile } from "node:fs/promises";
import path2 from "node:path";
import { randomUUID } from "node:crypto";

// server/auth.ts
import { SignJWT, jwtVerify } from "jose";
import { hash, compare } from "bcryptjs";
import { getCookie, setCookie } from "hono/cookie";
var jwtSecret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "driving-licence-dev-secret"
);
async function hashPassword(password) {
  return hash(password, 10);
}
async function verifyPassword(password, passwordHash) {
  return compare(password, passwordHash);
}
async function signToken(user) {
  return new SignJWT({ email: user.email, role: user.role }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime("7d").sign(jwtSecret);
}
async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, jwtSecret);
    if (!payload.sub || typeof payload.email !== "string") return null;
    const role = payload.role === "admin" ? "admin" : payload.role === "student" ? "student" : null;
    if (!role) return null;
    return { id: payload.sub, email: payload.email, role };
  } catch {
    return null;
  }
}
async function getAuthUser(c) {
  const token = getCookie(c, "token");
  if (!token) return null;
  return verifyToken(token);
}
function setAuthCookie(c, token) {
  setCookie(c, "token", token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/"
  });
}

// server/db.ts
var url = process.env.TURSO_DATABASE_URL;
var db = createClient(
  url ? { url, authToken: process.env.TURSO_AUTH_TOKEN ?? void 0 } : { url: "file:local.db" }
);
function splitStatements(sql) {
  return sql.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter((s) => s.length > 0);
}
function unquoteIdent(ident) {
  return ident.replace(/^[`"[]/, "").replace(/[`"\]]$/, "");
}
var ADD_COLUMN_RE = /^\s*ALTER\s+TABLE\s+(\S+)\s+ADD\s+COLUMN\s+(\S+)/i;
async function alreadyApplied(stmt) {
  const m = ADD_COLUMN_RE.exec(stmt);
  if (!m) return false;
  const table = unquoteIdent(m[1]);
  const column = unquoteIdent(m[2]);
  const rows = await db.execute(`PRAGMA table_info("${table.replace(/"/g, '""')}")`);
  return rows.rows.some((r) => String(r.name).toLowerCase() === column.toLowerCase());
}
async function runMigrations() {
  const dir = path2.resolve(process.cwd(), "db", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  await db.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    file TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const appliedRes = await db.execute("SELECT file FROM schema_migrations");
  const applied = new Set(appliedRes.rows.map((r) => String(r.file)));
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path2.join(dir, file), "utf8");
    const batch = [];
    for (const stmt of splitStatements(sql)) {
      if (await alreadyApplied(stmt)) continue;
      batch.push({ sql: stmt });
    }
    batch.push({
      sql: "INSERT INTO schema_migrations (file, applied_at) VALUES (?, ?)",
      args: [file, (/* @__PURE__ */ new Date()).toISOString()]
    });
    await db.batch(batch, "write");
  }
}
async function bootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = await db.execute({
    sql: "SELECT 1 FROM users WHERE email = ? LIMIT 1",
    args: [email]
  });
  if (existing.rows.length > 0) return;
  const id = randomUUID();
  const password_hash = await hashPassword(password);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.execute({
    sql: "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    args: [id, email, password_hash, now]
  });
  console.log(`[init] created admin user ${email}`);
}
async function init() {
  await db.execute("PRAGMA foreign_keys = ON");
  await runMigrations();
  await bootstrapAdmin();
}

// server/routes/auth.ts
var authRoutes = new Hono();
authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) return c.json({ error: "Email and password are required" }, 400);
  const result = await db.execute({
    sql: "SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1",
    args: [email]
  });
  if (result.rows.length === 0) return c.json({ error: "Invalid email or password" }, 401);
  const row = result.rows[0];
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return c.json({ error: "Invalid email or password" }, 401);
  const user = { id: row.id, email: row.email, role: "admin" };
  setAuthCookie(c, await signToken(user));
  return c.json({ data: { user } });
});
authRoutes.post("/logout", (c) => {
  deleteCookie(c, "token", { path: "/" });
  return c.json({ data: { ok: true } });
});
authRoutes.get("/me", async (c) => {
  const user = await getAuthUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  return c.json({ data: { user } });
});

// server/routes/studentAuth.ts
import { Hono as Hono2 } from "hono";
var studentAuthRoutes = new Hono2();
studentAuthRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = body.email?.trim().toLowerCase();
  const code = body.accessCode?.trim().toUpperCase();
  if (!email || !code) return c.json({ error: "Email and access code are required" }, 400);
  const result = await db.execute({
    sql: "SELECT id, name, email, access_code, is_active FROM students WHERE email = ? LIMIT 1",
    args: [email]
  });
  if (result.rows.length === 0) return c.json({ error: "Invalid email or access code" }, 401);
  const row = result.rows[0];
  if (!row.is_active) return c.json({ error: "Invalid email or access code" }, 401);
  if (row.access_code.toUpperCase() !== code) {
    return c.json({ error: "Invalid email or access code" }, 401);
  }
  const user = { id: row.id, email: row.email, role: "student" };
  setAuthCookie(c, await signToken(user));
  return c.json({ data: { user, name: row.name } });
});
studentAuthRoutes.get("/me", async (c) => {
  const user = await getAuthUser(c);
  if (!user || user.role !== "student") return c.json({ error: "Unauthorized" }, 401);
  const result = await db.execute({
    sql: "SELECT id, name, email, is_active FROM students WHERE id = ? LIMIT 1",
    args: [user.id]
  });
  if (result.rows.length === 0) return c.json({ error: "Unauthorized" }, 401);
  const row = result.rows[0];
  return c.json({ data: { user, name: row.name } });
});

// server/routes/series.ts
import { Hono as Hono3 } from "hono";
import { randomUUID as randomUUID2 } from "node:crypto";

// server/middleware.ts
async function requireUser(c, next) {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", user);
  await next();
}
async function optionalUser(c, next) {
  const user = await getAuthUser(c);
  if (user) {
    c.set("user", user);
  }
  await next();
}
async function requireAdmin(c, next) {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "admin") {
    return c.json({ error: "Forbidden" }, 403);
  }
  c.set("user", user);
  await next();
}
async function requireStudent(c, next) {
  const user = await getAuthUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (user.role !== "student") {
    return c.json({ error: "Forbidden" }, 403);
  }
  const row = await db.execute({
    sql: "SELECT id FROM students WHERE id = ? AND is_active = 1 LIMIT 1",
    args: [user.id]
  });
  if (row.rows.length === 0) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", user);
  await next();
}

// server/serialize.ts
function toSeries(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    is_active: Number(row.is_active),
    category: row.category,
    pass_score: Number(row.pass_score),
    required_questions: Number(row.required_questions),
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...row.question_count !== void 0 ? { question_count: Number(row.question_count) } : {}
  };
}
function toQuestion(row) {
  let correctAnswers = [];
  try {
    const parsed = JSON.parse(row.correct_answers);
    if (Array.isArray(parsed)) correctAnswers = parsed;
  } catch {
    correctAnswers = [];
  }
  return {
    id: row.id,
    series_id: row.series_id,
    image_url: row.image_url ?? null,
    audio_url: row.audio_url ?? null,
    question_text: row.question_text,
    question_text_2: row.question_text_2 ?? null,
    option_1: row.option_1,
    option_2: row.option_2,
    option_3: row.option_3 ?? null,
    option_4: row.option_4 ?? null,
    correct_answers: correctAnswers,
    timer_duration: Number(row.timer_duration),
    category: row.category,
    position: Number(row.position),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
function toStudent(row) {
  return {
    id: row.id,
    name: row.name ?? null,
    email: row.email,
    access_code: row.access_code,
    is_active: Number(row.is_active),
    created_at: row.created_at,
    ...row.attempt_count !== void 0 ? { attempt_count: Number(row.attempt_count) } : {}
  };
}
function toAttempt(row) {
  return {
    id: row.id,
    series_id: row.series_id,
    series_title: row.series_title ?? null,
    score: Number(row.score),
    total_questions: Number(row.total_questions),
    passed: Number(row.passed),
    created_at: row.created_at
  };
}
function toSign(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    image_url: row.image_url,
    description: row.description,
    scenario_image_url: row.scenario_image_url ?? null,
    is_active: Number(row.is_active),
    position: Number(row.position),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// server/routes/series.ts
var seriesRoutes = new Hono3();
seriesRoutes.get("/", optionalUser, async (c) => {
  const user = c.get("user");
  const includeAll = c.req.query("all") === "true" && user?.role === "admin";
  if (!user) {
    const settings = await db.execute({
      sql: "SELECT value FROM settings WHERE key = ?",
      args: ["site_public"]
    });
    const isPublic = settings.rows[0] ? String(settings.rows[0].value) === "1" : false;
    if (!isPublic) return c.json({ error: "Unauthorized" }, 401);
    const active = await db.execute(
      `SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.series_id = s.id) AS question_count
       FROM series s
       WHERE s.is_active = 1 AND s.is_official = 0
       ORDER BY s.created_at ASC`
    );
    return c.json({ data: active.rows.map((r) => toSeries(r)) });
  }
  const where = includeAll ? "WHERE s.is_official = 0" : "WHERE s.is_active = 1 AND s.is_official = 0";
  const result = await db.execute(
    `SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.series_id = s.id) AS question_count
     FROM series s
     ${where}
     ORDER BY s.created_at ASC`
  );
  return c.json({ data: result.rows.map((r) => toSeries(r)) });
});
seriesRoutes.get("/:id", requireUser, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Invalid series id" }, 400);
  const result = await db.execute({ sql: "SELECT * FROM series WHERE id = ?", args: [id] });
  if (result.rows.length === 0) return c.json({ error: "Series not found" }, 404);
  return c.json({ data: toSeries(result.rows[0]) });
});
seriesRoutes.get("/:id/questions", requireUser, async (c) => {
  const seriesId = c.req.param("id");
  if (!seriesId) return c.json({ error: "Invalid series id" }, 400);
  const result = await db.execute({
    sql: "SELECT * FROM questions WHERE series_id = ? ORDER BY position ASC, created_at ASC",
    args: [seriesId]
  });
  return c.json({ data: result.rows.map((r) => toQuestion(r)) });
});
seriesRoutes.post("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.title?.trim()) return c.json({ error: "Title is required" }, 400);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = randomUUID2();
  await db.execute({
    sql: "INSERT INTO series (id, title, description, is_active, category, pass_score, required_questions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      id,
      body.title.trim(),
      body.description || null,
      body.is_active ? 1 : 0,
      body.category || "B",
      body.pass_score ?? 35,
      body.required_questions ?? 40,
      now,
      now
    ]
  });
  const created = await db.execute({ sql: "SELECT * FROM series WHERE id = ?", args: [id] });
  return c.json({ data: toSeries(created.rows[0]) }, 201);
});
seriesRoutes.put("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Invalid series id" }, 400);
  const body = await c.req.json().catch(() => ({}));
  if (!body.title?.trim()) return c.json({ error: "Title is required" }, 400);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.execute({
    sql: "UPDATE series SET title = ?, description = ?, is_active = ?, category = ?, pass_score = ?, required_questions = ?, updated_at = ? WHERE id = ?",
    args: [
      body.title.trim(),
      body.description || null,
      body.is_active ? 1 : 0,
      body.category || "B",
      body.pass_score ?? 35,
      body.required_questions ?? 40,
      now,
      id
    ]
  });
  const updated = await db.execute({ sql: "SELECT * FROM series WHERE id = ?", args: [id] });
  if (updated.rows.length === 0) return c.json({ error: "Series not found" }, 404);
  return c.json({ data: toSeries(updated.rows[0]) });
});
seriesRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Invalid series id" }, 400);
  const result = await db.execute({ sql: "DELETE FROM series WHERE id = ?", args: [id] });
  if (result.rowsAffected === 0) return c.json({ error: "Series not found" }, 404);
  return c.json({ data: { ok: true } });
});

// server/routes/questions.ts
import { Hono as Hono4 } from "hono";
import { randomUUID as randomUUID3 } from "node:crypto";
var questionRoutes = new Hono4();
var INSERT_COLUMNS = "id, series_id, image_url, audio_url, question_text, question_text_2, option_1, option_2, option_3, option_4, correct_answers, timer_duration, category, position, created_at, updated_at";
questionRoutes.patch("/reorder", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string")) {
    return c.json({ error: "Invalid ids payload" }, 400);
  }
  const statements = body.ids.map((id, index) => ({
    sql: "UPDATE questions SET position = ? WHERE id = ?",
    args: [index, id]
  }));
  await db.batch(statements);
  return c.json({ data: { ok: true } });
});
questionRoutes.post("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.series_id || !body.question_text?.trim()) {
    return c.json({ error: "series_id and question_text are required" }, 400);
  }
  const pos = await db.execute({
    sql: "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM questions WHERE series_id = ?",
    args: [body.series_id]
  });
  const nextPosition = Number(pos.rows[0].next_position);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = randomUUID3();
  const args = [
    id,
    body.series_id,
    body.image_url || null,
    body.audio_url || null,
    body.question_text.trim(),
    body.question_text_2 || null,
    body.option_1 || "",
    body.option_2 || "",
    body.option_3 || null,
    body.option_4 || null,
    JSON.stringify(body.correct_answers ?? []),
    body.timer_duration ?? 20,
    body.category || "B",
    nextPosition,
    now,
    now
  ];
  await db.execute({
    sql: `INSERT INTO questions (${INSERT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args
  });
  const created = await db.execute({ sql: "SELECT * FROM questions WHERE id = ?", args: [id] });
  return c.json({ data: toQuestion(created.rows[0]) }, 201);
});
questionRoutes.put("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Invalid question id" }, 400);
  const body = await c.req.json().catch(() => ({}));
  if (!body.question_text?.trim() || !body.series_id) {
    return c.json({ error: "question_text and series_id are required" }, 400);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const args = [
    body.image_url || null,
    body.audio_url || null,
    body.question_text.trim(),
    body.question_text_2 || null,
    body.option_1 || "",
    body.option_2 || "",
    body.option_3 || null,
    body.option_4 || null,
    JSON.stringify(body.correct_answers ?? []),
    body.timer_duration ?? 20,
    body.category || "B",
    body.series_id,
    now,
    id
  ];
  await db.execute({
    sql: `UPDATE questions SET image_url = ?, audio_url = ?, question_text = ?, question_text_2 = ?, option_1 = ?, option_2 = ?, option_3 = ?, option_4 = ?, correct_answers = ?, timer_duration = ?, category = ?, series_id = ?, updated_at = ? WHERE id = ?`,
    args
  });
  const updated = await db.execute({ sql: "SELECT * FROM questions WHERE id = ?", args: [id] });
  if (updated.rows.length === 0) return c.json({ error: "Question not found" }, 404);
  return c.json({ data: toQuestion(updated.rows[0]) });
});
questionRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Invalid question id" }, 400);
  const result = await db.execute({ sql: "DELETE FROM questions WHERE id = ?", args: [id] });
  if (result.rowsAffected === 0) return c.json({ error: "Question not found" }, 404);
  return c.json({ data: { ok: true } });
});

// server/routes/students.ts
import { Hono as Hono5 } from "hono";
import { randomUUID as randomUUID4, randomBytes } from "node:crypto";
var studentsRoutes = new Hono5();
var CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function randomGroup(length) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}
async function generateAccessCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = `${randomGroup(4)}-${randomGroup(4)}`;
    const existing = await db.execute({
      sql: "SELECT 1 FROM students WHERE access_code = ? LIMIT 1",
      args: [code]
    });
    if (existing.rows.length === 0) return code;
  }
  throw new Error("Could not generate a unique access code");
}
studentsRoutes.get("/", requireAdmin, async (c) => {
  const result = await db.execute(
    `SELECT s.*, (SELECT COUNT(*) FROM exam_attempts a WHERE a.student_id = s.id) AS attempt_count
     FROM students s
     ORDER BY s.created_at DESC`
  );
  return c.json({ data: result.rows.map((r) => toStudent(r)) });
});
studentsRoutes.post("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = body.email?.trim().toLowerCase();
  if (!email) return c.json({ error: "Email is required" }, 400);
  const name = body.name?.trim() || null;
  const accessCode = await generateAccessCode();
  const id = randomUUID4();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await db.execute({
      sql: "INSERT INTO students (id, name, email, access_code, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
      args: [id, name, email, accessCode, now]
    });
  } catch {
    return c.json({ error: "A student with this email already exists" }, 409);
  }
  const created = await db.execute({ sql: "SELECT * FROM students WHERE id = ?", args: [id] });
  return c.json({ data: toStudent(created.rows[0]) }, 201);
});
studentsRoutes.post("/:id/reset-code", requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Invalid student id" }, 400);
  const accessCode = await generateAccessCode();
  const result = await db.execute({
    sql: "UPDATE students SET access_code = ? WHERE id = ?",
    args: [accessCode, id]
  });
  if (result.rowsAffected === 0) return c.json({ error: "Student not found" }, 404);
  const updated = await db.execute({ sql: "SELECT * FROM students WHERE id = ?", args: [id] });
  return c.json({ data: toStudent(updated.rows[0]) });
});
studentsRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Invalid student id" }, 400);
  const result = await db.execute({ sql: "DELETE FROM students WHERE id = ?", args: [id] });
  if (result.rowsAffected === 0) return c.json({ error: "Student not found" }, 404);
  return c.json({ data: { ok: true } });
});
studentsRoutes.get("/:id/attempts", requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Invalid student id" }, 400);
  const result = await db.execute({
    sql: `SELECT a.*, s.title AS series_title
     FROM exam_attempts a
     LEFT JOIN series s ON s.id = a.series_id
     WHERE a.student_id = ?
     ORDER BY a.created_at DESC`,
    args: [id]
  });
  return c.json({ data: result.rows.map((r) => toAttempt(r)) });
});

// server/routes/attempts.ts
import { Hono as Hono6 } from "hono";
import { randomUUID as randomUUID5 } from "node:crypto";
var attemptsRoutes = new Hono6();
attemptsRoutes.get("/", requireStudent, async (c) => {
  const user = c.get("user");
  const result = await db.execute({
    sql: `SELECT a.*, s.title AS series_title
     FROM exam_attempts a
     LEFT JOIN series s ON s.id = a.series_id
     WHERE a.student_id = ?
     ORDER BY a.created_at DESC`,
    args: [user.id]
  });
  return c.json({ data: result.rows.map((r) => toAttempt(r)) });
});
attemptsRoutes.post("/", requireStudent, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const { series_id, score, total_questions } = body;
  if (!series_id || typeof score !== "number" || typeof total_questions !== "number") {
    return c.json({ error: "series_id, score and total_questions are required" }, 400);
  }
  if (score < 0 || total_questions <= 0 || score > total_questions) {
    return c.json({ error: "Invalid score values" }, 400);
  }
  const seriesRes = await db.execute({
    sql: `SELECT s.pass_score, s.required_questions,
      (SELECT COUNT(*) FROM questions q WHERE q.series_id = s.id) AS question_count
     FROM series s WHERE s.id = ? LIMIT 1`,
    args: [series_id]
  });
  if (seriesRes.rows.length === 0) return c.json({ error: "Series not found" }, 404);
  const srow = seriesRes.rows[0];
  const passScore = Number(srow.pass_score);
  const requiredQuestions = Number(srow.required_questions);
  const questionCount = Number(srow.question_count);
  if (requiredQuestions > 0 && questionCount !== requiredQuestions) {
    return c.json(
      { error: `Series is incomplete (${questionCount}/${requiredQuestions} questions)` },
      400
    );
  }
  const passed = score >= passScore ? 1 : 0;
  const id = randomUUID5();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const requested = Array.isArray(body.wrong_question_ids) ? body.wrong_question_ids.filter((q) => typeof q === "string") : [];
  let wrongIds = [];
  if (requested.length > 0) {
    const placeholders = requested.map(() => "?").join(",");
    const qres = await db.execute({
      sql: `SELECT id FROM questions WHERE series_id = ? AND id IN (${placeholders})`,
      args: [series_id, ...requested]
    });
    wrongIds = qres.rows.map((r) => r.id);
  }
  const statements = [
    {
      sql: "INSERT INTO exam_attempts (id, student_id, series_id, score, total_questions, passed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [id, user.id, series_id, score, total_questions, passed, now]
    }
  ];
  wrongIds.forEach((questionId) => {
    statements.push({
      sql: `INSERT INTO student_revision (student_id, question_id, wrong_count, status, created_at, corrected_at)
       VALUES (?, ?, 1, 'to_review', ?, NULL)
       ON CONFLICT (student_id, question_id) DO UPDATE SET
         wrong_count = student_revision.wrong_count + 1,
         status = 'to_review',
         corrected_at = NULL`,
      args: [user.id, questionId, now]
    });
  });
  await db.batch(statements);
  const created = await db.execute({
    sql: `SELECT a.*, s.title AS series_title
     FROM exam_attempts a
     LEFT JOIN series s ON s.id = a.series_id
     WHERE a.id = ?`,
    args: [id]
  });
  return c.json({ data: toAttempt(created.rows[0]) }, 201);
});

// server/routes/revision.ts
import { Hono as Hono7 } from "hono";
var revisionRoutes = new Hono7();
var SUMMARY_SELECT = `
  SELECT q.*, r.wrong_count, r.corrected_at AS revision_corrected_at, s.title AS series_title
  FROM student_revision r
  JOIN questions q ON q.id = r.question_id
  LEFT JOIN series s ON s.id = q.series_id
  WHERE r.student_id = ?
`;
var WEAK_AREAS_SQL = `
  SELECT q.category AS category,
         COUNT(*) AS question_count,
         SUM(r.wrong_count) AS wrong_total
  FROM student_revision r
  JOIN questions q ON q.id = r.question_id
  WHERE r.student_id = ?
  GROUP BY q.category
  ORDER BY wrong_total DESC, question_count DESC
`;
async function weakAreas(studentId) {
  const res = await db.execute({ sql: WEAK_AREAS_SQL, args: [studentId] });
  return res.rows.map((row) => {
    const r = row;
    return {
      category: r.category,
      question_count: Number(r.question_count),
      wrong_total: Number(r.wrong_total)
    };
  });
}
async function revisionSummary(studentId) {
  const toReview = await db.execute({
    sql: `${SUMMARY_SELECT} AND r.status = 'to_review' ORDER BY r.created_at ASC`,
    args: [studentId]
  });
  const corrected = await db.execute({
    sql: `${SUMMARY_SELECT} AND r.status = 'corrected' ORDER BY r.corrected_at DESC`,
    args: [studentId]
  });
  const mapRow = (row) => {
    const r = row;
    return {
      ...toQuestion(r),
      wrong_count: Number(r.wrong_count),
      series_title: r.series_title ?? null,
      corrected_at: r.revision_corrected_at ?? null
    };
  };
  return {
    to_review: toReview.rows.map(mapRow),
    corrected: corrected.rows.map(mapRow),
    weak_areas: await weakAreas(studentId)
  };
}
revisionRoutes.get("/", requireStudent, async (c) => {
  const user = c.get("user");
  return c.json({ data: await revisionSummary(user.id) });
});
revisionRoutes.post("/complete", requireStudent, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  if (!Array.isArray(body.results)) {
    return c.json({ error: "results is required" }, 400);
  }
  const results = body.results.filter(
    (r) => !!r && typeof r === "object" && typeof r.question_id === "string" && typeof r.correct === "boolean"
  );
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const statements = results.map((r) => {
    if (r.correct) {
      return {
        sql: `INSERT INTO student_revision (student_id, question_id, wrong_count, status, created_at, corrected_at)
         VALUES (?, ?, 1, 'corrected', ?, ?)
         ON CONFLICT (student_id, question_id) DO UPDATE SET
           status = 'corrected',
           corrected_at = excluded.corrected_at`,
        args: [user.id, r.question_id, now, now]
      };
    }
    return {
      sql: `INSERT INTO student_revision (student_id, question_id, wrong_count, status, created_at, corrected_at)
       VALUES (?, ?, 1, 'to_review', ?, NULL)
       ON CONFLICT (student_id, question_id) DO UPDATE SET
         wrong_count = student_revision.wrong_count + 1,
         status = 'to_review',
         corrected_at = NULL`,
      args: [user.id, r.question_id, now]
    };
  });
  if (statements.length > 0) {
    await db.batch(statements);
  }
  return c.json({ data: { ok: true, summary: await revisionSummary(user.id) } });
});

// server/routes/upload.ts
import { Hono as Hono8 } from "hono";

// server/r2.ts
import { randomUUID as randomUUID6 } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
var PRESIGN_TTL_SECONDS = 300;
var IMAGE_PREFIX = "questions";
var ALLOWED_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};
function requireConfig() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const publicDomain = process.env.R2_PUBLIC_DOMAIN?.trim();
  const missing = [
    !accountId && "R2_ACCOUNT_ID",
    !accessKeyId && "R2_ACCESS_KEY_ID",
    !secretAccessKey && "R2_SECRET_ACCESS_KEY",
    !bucket && "R2_BUCKET_NAME",
    !publicDomain && "R2_PUBLIC_DOMAIN"
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`R2 upload is not configured. Missing: ${missing.join(", ")}`);
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicDomain
  };
}
var client = null;
function getClient() {
  if (!client) {
    const cfg = requireConfig();
    client = new S3Client({
      region: "auto",
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey
      },
      forcePathStyle: true
    });
  }
  return client;
}
async function createPresignedImageUpload(input) {
  const extension = ALLOWED_TYPES[input.contentType];
  if (!extension) {
    throw new UploadValidationError(
      `Unsupported image type "${input.contentType}". Allowed: ${Object.keys(ALLOWED_TYPES).join(", ")}`
    );
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    throw new UploadValidationError("File is empty.");
  }
  if (input.size > MAX_IMAGE_BYTES) {
    throw new UploadValidationError(
      `File is ${(input.size / 1024 / 1024).toFixed(1)} MB. Maximum is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`
    );
  }
  const cfg = requireConfig();
  const key = `${IMAGE_PREFIX}/${randomUUID6()}.${extension}`;
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: input.contentType,
    // Signing ContentLength makes R2 reject an oversized or truncated body.
    ContentLength: input.size
  });
  const uploadUrl = await getSignedUrl(getClient(), command, {
    expiresIn: PRESIGN_TTL_SECONDS
  });
  const publicUrl = `${cfg.publicDomain.replace(/\/+$/, "")}/${key}`;
  return { uploadUrl, publicUrl, key };
}
var UploadValidationError = class extends Error {
};

// server/routes/upload.ts
var uploadRoutes = new Hono8();
uploadRoutes.use("/*", requireAdmin);
uploadRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const contentType = body.contentType?.trim() ?? "";
  const size = Number(body.size);
  if (!contentType) {
    return c.json({ error: "contentType is required" }, 400);
  }
  if (!Number.isFinite(size)) {
    return c.json({ error: "size must be a number of bytes" }, 400);
  }
  try {
    const result = await createPresignedImageUpload({ contentType, size });
    return c.json({ data: result });
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return c.json({ error: err.message }, 400);
    }
    if (err instanceof Error && /Missing:/.test(err.message)) {
      return c.json({ error: "Image uploads are not configured on the server." }, 503);
    }
    console.error("Failed to presign R2 upload:", err);
    return c.json({ error: "Could not prepare the upload. Try again." }, 500);
  }
});

// server/routes/signs.ts
import { Hono as Hono9 } from "hono";
import { randomUUID as randomUUID7 } from "node:crypto";

// src/types/index.ts
var SIGN_CATEGORIES = [
  "Danger",
  "Interdiction",
  "Obligation",
  "Indication",
  "Pr\xE9c\xE9dence",
  "Signalisation temporaire"
];

// server/routes/signs.ts
var signRoutes = new Hono9();
var INSERT_COLUMNS2 = "id, title, category, image_url, description, scenario_image_url, is_active, position, created_at, updated_at";
signRoutes.get("/", optionalUser, async (c) => {
  const user = c.get("user");
  const includeAll = c.req.query("all") === "true" && user?.role === "admin";
  const result = await db.execute(
    `SELECT * FROM signs ${includeAll ? "" : "WHERE is_active = 1"}
     ORDER BY category ASC, position ASC, created_at ASC`
  );
  return c.json({ data: result.rows.map((r) => toSign(r)) });
});
signRoutes.get("/:id", optionalUser, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Invalid sign id" }, 400);
  const result = await db.execute({ sql: "SELECT * FROM signs WHERE id = ?", args: [id] });
  if (result.rows.length === 0) return c.json({ error: "Sign not found" }, 404);
  const row = result.rows[0];
  const user = c.get("user");
  if (user?.role !== "admin" && Number(row.is_active) !== 1) {
    return c.json({ error: "Sign not found" }, 404);
  }
  return c.json({ data: toSign(row) });
});
signRoutes.patch("/reorder", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string")) {
    return c.json({ error: "Invalid ids payload" }, 400);
  }
  const statements = body.ids.map((id, index) => ({
    sql: "UPDATE signs SET position = ? WHERE id = ?",
    args: [index, id]
  }));
  await db.batch(statements);
  return c.json({ data: { ok: true } });
});
signRoutes.post("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.title?.trim()) return c.json({ error: "Title is required" }, 400);
  if (!body.image_url?.trim()) return c.json({ error: "Sign image is required" }, 400);
  if (!body.description?.trim()) return c.json({ error: "Description is required" }, 400);
  const pos = await db.execute({
    sql: "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM signs"
  });
  const nextPosition = Number(pos.rows[0].next_position);
  const category = SIGN_CATEGORIES.includes(body.category) ? body.category : SIGN_CATEGORIES[0];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = randomUUID7();
  await db.execute({
    sql: `INSERT INTO signs (${INSERT_COLUMNS2}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      body.title.trim(),
      category,
      body.image_url.trim(),
      body.description.trim(),
      body.scenario_image_url || null,
      body.is_active ? 1 : 0,
      nextPosition,
      now,
      now
    ]
  });
  const created = await db.execute({ sql: "SELECT * FROM signs WHERE id = ?", args: [id] });
  return c.json({ data: toSign(created.rows[0]) }, 201);
});
signRoutes.put("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Invalid sign id" }, 400);
  const body = await c.req.json().catch(() => ({}));
  if (!body.title?.trim()) return c.json({ error: "Title is required" }, 400);
  if (!body.image_url?.trim()) return c.json({ error: "Sign image is required" }, 400);
  if (!body.description?.trim()) return c.json({ error: "Description is required" }, 400);
  const category = SIGN_CATEGORIES.includes(body.category) ? body.category : SIGN_CATEGORIES[0];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  await db.execute({
    sql: `UPDATE signs SET title = ?, category = ?, image_url = ?, description = ?, scenario_image_url = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    args: [
      body.title.trim(),
      category,
      body.image_url.trim(),
      body.description.trim(),
      body.scenario_image_url || null,
      body.is_active ? 1 : 0,
      now,
      id
    ]
  });
  const updated = await db.execute({ sql: "SELECT * FROM signs WHERE id = ?", args: [id] });
  if (updated.rows.length === 0) return c.json({ error: "Sign not found" }, 404);
  return c.json({ data: toSign(updated.rows[0]) });
});
signRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Invalid sign id" }, 400);
  const result = await db.execute({ sql: "DELETE FROM signs WHERE id = ?", args: [id] });
  if (result.rowsAffected === 0) return c.json({ error: "Sign not found" }, 404);
  return c.json({ data: { ok: true } });
});

// server/routes/settings.ts
import { Hono as Hono10 } from "hono";
var settingsRoutes = new Hono10();
async function readSitePublic() {
  const res = await db.execute({
    sql: "SELECT value FROM settings WHERE key = ?",
    args: ["site_public"]
  });
  const value = res.rows[0] ? String(res.rows[0].value) : "0";
  return value === "1";
}
settingsRoutes.get("/public", async (c) => {
  return c.json({ data: { site_public: await readSitePublic() } });
});
settingsRoutes.put("/", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const site_public = body.site_public ? "1" : "0";
  await db.execute({
    sql: `INSERT INTO settings (key, value) VALUES ('site_public', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [site_public]
  });
  return c.json({ data: { site_public: site_public === "1" } });
});

// server/routes/exams.ts
import { Hono as Hono11 } from "hono";
import { randomUUID as randomUUID8 } from "node:crypto";
var examRoutes = new Hono11();
async function readOfficialConfig() {
  const res = await db.execute({
    sql: `SELECT key, value FROM settings WHERE key IN ('official_pass_score', 'official_question_count', 'official_timer_duration')`
  });
  const map = /* @__PURE__ */ new Map();
  for (const r of res.rows) {
    const row = r;
    map.set(String(row.key), String(row.value));
  }
  const DEFAULT_TIMERS = [10, 20, 30];
  let timer = Number(map.get("official_timer_duration") ?? "20");
  if (!DEFAULT_TIMERS.includes(timer)) timer = 20;
  return {
    pass_score: Number(map.get("official_pass_score") ?? "35"),
    question_count: Number(map.get("official_question_count") ?? "40"),
    timer_duration: timer
  };
}
async function officialSeriesId() {
  const res = await db.execute({ sql: "SELECT id FROM series WHERE is_official = 1 LIMIT 1" });
  return res.rows[0] ? res.rows[0].id : null;
}
examRoutes.get("/official/meta", requireStudent, async (c) => {
  return c.json({ data: await readOfficialConfig() });
});
examRoutes.get("/official", requireStudent, async (c) => {
  const config = await readOfficialConfig();
  const result = await db.execute({
    sql: `SELECT q.* FROM questions q
          JOIN series s ON s.id = q.series_id
          WHERE s.is_active = 1 AND s.is_official = 0
          ORDER BY RANDOM() LIMIT ?`,
    args: [config.question_count]
  });
  const questions = result.rows.map((r) => toQuestion(r));
  if (questions.length < config.question_count) {
    return c.json(
      {
        error: `Il n'y a pas encore assez de questions actives pour l'examen officiel (${questions.length}/${config.question_count}).`
      },
      409
    );
  }
  return c.json({ data: { ...config, questions } });
});
examRoutes.post("/official/complete", requireStudent, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));
  const { score, total_questions } = body;
  if (typeof score !== "number" || typeof total_questions !== "number") {
    return c.json({ error: "score and total_questions are required" }, 400);
  }
  const config = await readOfficialConfig();
  if (score < 0 || total_questions !== config.question_count || score > total_questions) {
    return c.json({ error: "Invalid score values" }, 400);
  }
  const seriesId = await officialSeriesId();
  if (!seriesId) return c.json({ error: "Official exam is not configured." }, 500);
  const passed = score >= config.pass_score ? 1 : 0;
  const id = randomUUID8();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const requested = (Array.isArray(body.wrong_question_ids) ? body.wrong_question_ids.filter((q) => typeof q === "string") : []).slice(0, config.question_count);
  let wrongIds = [];
  if (requested.length > 0) {
    const placeholders = requested.map(() => "?").join(",");
    const qres = await db.execute({
      sql: `SELECT id FROM questions WHERE id IN (${placeholders})
            AND series_id IN (SELECT id FROM series WHERE is_active = 1 AND is_official = 0)`,
      args: [...requested]
    });
    wrongIds = qres.rows.map((r) => r.id);
  }
  const statements = [
    {
      sql: "INSERT INTO exam_attempts (id, student_id, series_id, score, total_questions, passed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [id, user.id, seriesId, score, total_questions, passed, now]
    }
  ];
  wrongIds.forEach((questionId) => {
    statements.push({
      sql: `INSERT INTO student_revision (student_id, question_id, wrong_count, status, created_at, corrected_at)
       VALUES (?, ?, 1, 'to_review', ?, NULL)
       ON CONFLICT (student_id, question_id) DO UPDATE SET
         wrong_count = student_revision.wrong_count + 1,
         status = 'to_review',
         corrected_at = NULL`,
      args: [user.id, questionId, now]
    });
  });
  await db.batch(statements);
  const created = await db.execute({
    sql: `SELECT a.*, s.title AS series_title
     FROM exam_attempts a
     LEFT JOIN series s ON s.id = a.series_id
     WHERE a.id = ?`,
    args: [id]
  });
  return c.json({ data: toAttempt(created.rows[0]) }, 201);
});

// server/routes/readiness.ts
import { Hono as Hono12 } from "hono";
var readinessRoutes = new Hono12();
readinessRoutes.get("/", requireStudent, async (c) => {
  const user = c.get("user");
  const attemptsRes = await db.execute({
    sql: `SELECT passed, created_at FROM exam_attempts
          WHERE student_id = ? ORDER BY created_at DESC LIMIT 10`,
    args: [user.id]
  });
  const attempts = attemptsRes.rows;
  const passedFlags = attempts.map((r) => Number(r.passed) === 1 ? 1 : 0);
  let attempts_pass_rate = 0;
  if (passedFlags.length > 0) {
    const n = passedFlags.length;
    const totalWeight = n * (n + 1) / 2;
    let weighted = 0;
    passedFlags.forEach((p, i) => {
      weighted += p * (n - i);
    });
    attempts_pass_rate = weighted / totalWeight;
  }
  const revisionRes = await db.execute({
    sql: `SELECT status, COUNT(*) AS c FROM student_revision
          WHERE student_id = ? GROUP BY status`,
    args: [user.id]
  });
  const statusCounts = /* @__PURE__ */ new Map();
  for (const r of revisionRes.rows) {
    statusCounts.set(String(r.status), Number(r.c));
  }
  const toReview = statusCounts.get("to_review") ?? 0;
  const corrected = statusCounts.get("corrected") ?? 0;
  let revision_clearance = 0;
  const revTotal = toReview + corrected;
  if (revTotal > 0) {
    revision_clearance = corrected / revTotal;
  }
  const raw = 0.7 * attempts_pass_rate + 0.3 * revision_clearance;
  const readiness_pct = Math.max(0, Math.min(100, Math.round(raw * 100)));
  let trend = "flat";
  if (passedFlags.length >= 4) {
    const recent = passedFlags.slice(0, 3);
    const older = passedFlags.slice(3, 6);
    const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    const d = avg(recent) - avg(older);
    trend = d > 1e-3 ? "up" : d < -1e-3 ? "down" : "flat";
  }
  return c.json({
    data: {
      readiness_pct,
      attempts_pass_rate,
      revision_clearance,
      trend,
      attempts_count: passedFlags.length,
      to_review: toReview,
      corrected
    }
  });
});

// server/app.ts
function buildApp() {
  const app2 = new Hono13();
  app2.get("/api/health", (c) => c.json({ data: { ok: true } }));
  app2.route("/api/auth", authRoutes);
  app2.route("/api/student-auth", studentAuthRoutes);
  app2.route("/api/series", seriesRoutes);
  app2.route("/api/questions", questionRoutes);
  app2.route("/api/students", studentsRoutes);
  app2.route("/api/attempts", attemptsRoutes);
  app2.route("/api/revision", revisionRoutes);
  app2.route("/api/upload", uploadRoutes);
  app2.route("/api/signs", signRoutes);
  app2.route("/api/settings", settingsRoutes);
  app2.route("/api/exams", examRoutes);
  app2.route("/api/readiness", readinessRoutes);
  return app2;
}

// server/serverless.ts
var ready = null;
async function ensureReady() {
  if (!ready) ready = init();
  await ready;
}
var app = buildApp();
var handler = handle(app);
async function serve(req) {
  await ensureReady();
  return handler(req);
}
var GET = serve;
var POST = serve;
var PUT = serve;
var PATCH = serve;
var DELETE = serve;
export {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT
};
