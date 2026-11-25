/* LaporAman — API server
 * Tidak mencatat alamat IP atau header identifikasi.
 * Semua data yang disimpan berasal dari isian form, bukan identitas pelapor.
 */
require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const multer = require("multer");
const sharp = require("sharp");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const TICKET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TICKET_PATTERN = /^LA-\d{8}-[A-HJ-NP-Z2-9]{6}$/;

const STATUS_LABELS = {
  menunggu: "Menunggu peninjauan",
  diverifikasi: "Sedang diverifikasi",
  prioritas: "Prioritas ditentukan",
  diteruskan: "Diteruskan ke pihak setempat",
  ditutup: "Selesai ditangani",
};

const PRIORITY_LABELS = {
  rendah: "Rendah",
  sedang: "Sedang",
  tinggi: "Tinggi",
};

/* ---------- Konfigurasi wajib ---------- */
const missing = [];
if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12) {
  missing.push("ADMIN_PASSWORD (minimal 12 karakter)");
}
if (!process.env.TICKET_SECRET || process.env.TICKET_SECRET.length < 16) {
  missing.push("TICKET_SECRET (minimal 16 karakter)");
}
if (missing.length) {
  console.error("[LaporAman] Konfigurasi belum lengkap: " + missing.join(", "));
  console.error("[LaporAman] Salin .env.example menjadi .env lalu isi nilainya.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

const app = express();
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));

/* ---------- Utilitas ---------- */
function hashTicket(ticket) {
  return crypto
    .createHmac("sha256", process.env.TICKET_SECRET)
    .update(String(ticket).trim().toUpperCase())
    .digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function clean(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || "");
}

async function makeUniqueTicket(client) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("");
    const bytes = crypto.randomBytes(6);
    const suffix = Array.from(bytes, (byte) => TICKET_ALPHABET[byte % TICKET_ALPHABET.length]).join("");
    const ticket = `LA-${date}-${suffix}`;
    const result = await client.query("SELECT 1 FROM reports WHERE ticket_hash = $1", [hashTicket(ticket)]);
    if (!result.rowCount) return ticket;
  }
  throw new Error("Gagal membuat kode tiket unik.");
}

/* ---------- Upload foto ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return callback(new Error("Tipe berkas tidak didukung. Gunakan gambar JPG, PNG, atau WebP."));
    }
    callback(null, true);
  },
});

/* ---------- Autentikasi admin (Basic Auth) ---------- */
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const challenge = () => res.set("WWW-Authenticate", 'Basic realm="LaporAman Admin"');

  if (!header.startsWith("Basic ")) {
    challenge();
    return res.status(401).json({ error: "Autentikasi admin diperlukan." });
  }

  let decoded = "";
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch (error) {
    challenge();
    return res.status(401).json({ error: "Autentikasi tidak valid." });
  }

  const separator = decoded.indexOf(":");
  const user = separator >= 0 ? decoded.slice(0, separator) : "";
  const password = separator >= 0 ? decoded.slice(separator + 1) : "";

  if (!safeEqual(user, process.env.ADMIN_USER || "admin") || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
    challenge();
    return res.status(401).json({ error: "Kredensial salah." });
  }

  next();
}

/* ---------- Kesehatan layanan ---------- */
app.get("/api/health", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch (error) {
    next(error);
  }
});

/* ---------- Kirim laporan ---------- */
app.post("/api/reports", upload.single("bukti"), async (req, res, next) => {
  try {
    const kategori = clean(req.body.kategori, 80);
    const lokasi = clean(req.body.lokasi, 200);
    const waktu = clean(req.body.waktu, 80);
    const urgensi = clean(req.body.urgensi, 40).toLowerCase();
    const kronologi = clean(req.body.kronologi, 5000);

    if (!kategori || !lokasi || !waktu || !urgensi || kronologi.length < 20) {
      return res.status(400).json({ error: "Lengkapi kategori, lokasi, waktu, urgensi, dan kronologi minimal 20 karakter." });
    }
    if (!["rendah", "sedang", "tinggi"].includes(urgensi)) {
      return res.status(400).json({ error: "Nilai urgensi tidak dikenali." });
    }

    let evidence = null;
    let evidenceType = null;
    if (req.file) {
      // rotate() membaca orientasi EXIF; output JPEG tanpa metadata (GPU/EXIF/GPS ikut terhapus).
      evidence = await sharp(req.file.buffer)
        .rotate()
        .resize({ width: 1600, withoutEnlargement: true })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      evidenceType = "image/jpeg";
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const ticket = await makeUniqueTicket(client);
      const inserted = await client.query(
        `INSERT INTO reports
          (ticket_hash, ticket_hint, kategori, lokasi, waktu, urgensi, kronologi, evidence, evidence_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, created_at`,
        [hashTicket(ticket), ticket.slice(-4), kategori, lokasi, waktu, urgensi, kronologi, evidence, evidenceType]
      );

      await client.query(
        `INSERT INTO events (report_id, status, label, note)
         VALUES ($1, 'menunggu', $2, $3)`,
        [inserted.rows[0].id, STATUS_LABELS.menunggu, "Aduan tersimpan tanpa identitas pelapor."]
      );

      await client.query("COMMIT");
      return res.status(201).json({ ticket: ticket, createdAt: inserted.rows[0].created_at });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

/* ---------- Cek status oleh pelapor ---------- */
app.get("/api/reports/:ticket/status", async (req, res, next) => {
  try {
    const ticket = String(req.params.ticket || "").trim().toUpperCase();
    if (!TICKET_PATTERN.test(ticket)) {
      return res.status(400).json({ error: "Format kode tiket tidak valid." });
    }

    const report = await pool.query(
      "SELECT id, status, prioritas, public_note, updated_at FROM reports WHERE ticket_hash = $1",
      [hashTicket(ticket)]
    );
    if (!report.rowCount) {
      return res.status(404).json({ error: "Kode tiket tidak ditemukan." });
    }

    const current = report.rows[0];
    const events = await pool.query(
      "SELECT label, note, created_at FROM events WHERE report_id = $1 ORDER BY created_at ASC, id ASC",
      [current.id]
    );

    return res.json({
      ticket: ticket,
      status: current.status,
      statusLabel: STATUS_LABELS[current.status] || current.status,
      prioritas: PRIORITY_LABELS[current.prioritas] || current.prioritas,
      publicNote: current.public_note || "",
      updatedAt: current.updated_at,
      timeline: events.rows.map((event) => ({
        label: event.label,
        note: event.note,
        at: event.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/* ---------- Halaman & API admin ---------- */
app.get(["/admin", "/admin.html"], requireAdmin, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

app.use("/api/admin", requireAdmin);

app.get("/api/admin/summary", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'menunggu')::int AS menunggu,
        COUNT(*) FILTER (WHERE status IN ('diverifikasi', 'prioritas'))::int AS diproses,
        COUNT(*) FILTER (WHERE status = 'diteruskan')::int AS diteruskan,
        COUNT(*) FILTER (WHERE urgensi = 'tinggi')::int AS urgensi_tinggi
      FROM reports
    `);
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/reports", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, ticket_hint, kategori, lokasi, waktu, urgensi, status, prioritas,
             public_note, created_at, updated_at,
             (evidence IS NOT NULL) AS has_evidence
      FROM reports
      ORDER BY created_at DESC
      LIMIT 200
    `);
    res.json({ reports: result.rows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/reports/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!isUuid(id)) return res.status(400).json({ error: "ID laporan tidak valid." });

    const report = await pool.query(`
      SELECT id, ticket_hint, kategori, lokasi, waktu, urgensi, kronologi, status, prioritas,
             public_note, admin_note, created_at, updated_at,
             (evidence IS NOT NULL) AS has_evidence
      FROM reports WHERE id = $1
    `, [id]);
    if (!report.rowCount) return res.status(404).json({ error: "Laporan tidak ditemukan." });

    const events = await pool.query(
      "SELECT status, label, note, created_at FROM events WHERE report_id = $1 ORDER BY created_at ASC, id ASC",
      [id]
    );

    return res.json({ report: report.rows[0], timeline: events.rows });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/reports/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!isUuid(id)) return res.status(400).json({ error: "ID laporan tidak valid." });

    const status = typeof req.body.status === "string" && req.body.status ? req.body.status : null;
    const prioritas = typeof req.body.prioritas === "string" && req.body.prioritas ? req.body.prioritas : null;
    const publicNote = typeof req.body.publicNote === "string" ? clean(req.body.publicNote, 1000) : null;
    const adminNote = typeof req.body.adminNote === "string" ? clean(req.body.adminNote, 2000) : null;

    if (status && !Object.prototype.hasOwnProperty.call(STATUS_LABELS, status)) {
      return res.status(400).json({ error: "Status tidak dikenali." });
    }
    if (prioritas && !Object.prototype.hasOwnProperty.call(PRIORITY_LABELS, prioritas)) {
      return res.status(400).json({ error: "Prioritas tidak dikenali." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const before = await client.query("SELECT status FROM reports WHERE id = $1", [id]);
      if (!before.rowCount) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Laporan tidak ditemukan." });
      }

      const updated = await client.query(
        `UPDATE reports
         SET status = COALESCE($2, status),
             prioritas = COALESCE($3, prioritas),
             public_note = COALESCE($4, public_note),
             admin_note = COALESCE($5, admin_note),
             updated_at = now()
         WHERE id = $1
         RETURNING id, status, prioritas, public_note, admin_note, updated_at`,
        [id, status, prioritas, publicNote, adminNote]
      );

      if (status && status !== before.rows[0].status) {
        await client.query(
          `INSERT INTO events (report_id, status, label, note) VALUES ($1, $2, $3, $4)`,
          [id, status, STATUS_LABELS[status], publicNote || "Status diperbarui oleh peninjau."]
        );
      }

      await client.query("COMMIT");
      return res.json({ report: updated.rows[0] });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/reports/:id/evidence", async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!isUuid(id)) return res.status(400).json({ error: "ID laporan tidak valid." });

    const result = await pool.query(
      "SELECT evidence, evidence_type FROM reports WHERE id = $1",
      [id]
    );
    if (!result.rowCount || !result.rows[0].evidence) {
      return res.status(404).json({ error: "Bukti foto tidak tersedia." });
    }

    res.set("Cache-Control", "no-store");
    res.type(result.rows[0].evidence_type || "image/jpeg");
    return res.send(result.rows[0].evidence);
  } catch (error) {
    next(error);
  }
});

/* ---------- Aset statis ---------- */
app.use(express.static(PUBLIC_DIR, { index: "index.html" }));

/* ---------- Penanganan error ---------- */
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Ukuran foto maksimal 5 MB."
      : "Berkas tidak dapat diproses.";
    return res.status(400).json({ error: message });
  }
  if (error && typeof error.message === "string" && error.message.startsWith("Tipe berkas")) {
    return res.status(400).json({ error: error.message });
  }

  // Sengaja tidak mencatat IP, URL lengkap, atau header identifikasi.
  console.error("[LaporAman] " + (error && error.message ? error.message : "Kesalahan tidak diketahui"));

  if (res.headersSent) return next(error);
  return res.status(500).json({ error: "Terjadi kesalahan pada server. Coba lagi nanti." });
});

/* ---------- Start ---------- */
pool.query("SELECT 1")
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[LaporAman] Siap di http://localhost:${PORT}`);
      console.log(`[LaporAman] Panel admin: http://localhost:${PORT}/admin`);
    });
  })
  .catch((error) => {
    console.error("[LaporAman] Gagal terhubung ke database: " + error.message);
    process.exit(1);
  });

process.on("SIGTERM", () => {
  pool.end().then(() => process.exit(0));
});
