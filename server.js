/**
 * سيرفر بسيط لتخزين فواتير الوقود
 * يُنشر على Render.com مع قاعدة بيانات PostgreSQL (Render توفر نسخة مجانية)
 *
 * الإعداد على Render.com:
 * 1. أنشئ قاعدة بيانات PostgreSQL جديدة (Render Dashboard > New > PostgreSQL) — مجانية.
 *    بعد الإنشاء، انسخ رابط "Internal Database URL" أو "External Database URL".
 * 2. أنشئ Web Service جديد (New > Web Service) واربطه بهذا الكود
 *    (ارفعه على GitHub أولاً ثم اربط الـ repo، أو استخدم "Deploy from a Git repo").
 * 3. Build Command: npm install
 *    Start Command: npm start
 * 4. من إعدادات Web Service > Environment، أضف متغير بيئة:
 *    - Key: DATABASE_URL
 *    - Value: رابط قاعدة البيانات اللي نسخته بالخطوة 1
 * 5. من نفس الإعدادات، أضف متغير بيئة اختياري لتقييد الوصول:
 *    - Key: ALLOWED_ORIGIN
 *    - Value: https://username.github.io  (رابط موقعك)
 *    (أو اتركه فارغاً للسماح بالجميع مؤقتاً أثناء الاختبار)
 * 6. بعد النشر، انسخ رابط السيرفر (مثل: https://fuel-invoice-backend.onrender.com)
 *    وضعه في متغير RENDER_API_URL داخل ملف index.html.
 *
 * ملاحظة: الخطة المجانية على Render "تنام" السيرفر بعد فترة من عدم الاستخدام،
 * فأول طلب بعد فترة خمول قد يأخذ حتى 30-60 ثانية حتى يستيقظ السيرفر. هذا طبيعي.
 */

const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// إعداد الاتصال بقاعدة البيانات
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("render.com")
    ? { rejectUnauthorized: false }
    : false,
});

app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  })
);

// إنشاء الجدول تلقائياً إذا لم يكن موجوداً
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      plate_number TEXT NOT NULL,
      invoice_number TEXT,
      date TEXT,
      fuel_type TEXT,
      price_per_liter NUMERIC,
      liters NUMERIC,
      amount_before_tax NUMERIC,
      tax_amount NUMERIC,
      total_amount NUMERIC,
      saved_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// نقطة فحص صحة السيرفر
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "fuel-invoice-backend" });
});

// جلب كل الفواتير
app.get("/invoices", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM invoices ORDER BY date DESC NULLS LAST, saved_at DESC"
    );
    res.json({ invoices: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "تعذّر جلب الفواتير: " + err.message });
  }
});

// إضافة فاتورة جديدة
app.post("/invoices", async (req, res) => {
  try {
    const {
      plate_number,
      invoice_number,
      date,
      fuel_type,
      price_per_liter,
      liters,
      amount_before_tax,
      tax_amount,
      total_amount,
    } = req.body;

    if (!plate_number) {
      return res.status(400).json({ error: "رقم اللوحة مطلوب" });
    }

    const result = await pool.query(
      `INSERT INTO invoices
        (plate_number, invoice_number, date, fuel_type, price_per_liter, liters, amount_before_tax, tax_amount, total_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        plate_number,
        invoice_number || null,
        date || null,
        fuel_type || null,
        price_per_liter || 0,
        liters || 0,
        amount_before_tax || 0,
        tax_amount || 0,
        total_amount || 0,
      ]
    );

    res.json({ invoice: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "تعذّر حفظ الفاتورة: " + err.message });
  }
});

// حذف فاتورة
app.delete("/invoices/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM invoices WHERE id = $1", [id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "تعذّر حذف الفاتورة: " + err.message });
  }
});

ensureTable()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("فشل إعداد قاعدة البيانات:", err);
    process.exit(1);
  });
