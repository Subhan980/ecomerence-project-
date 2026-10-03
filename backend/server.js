const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || "change-me";

// ---------- helpers ----------
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Please log in first." });
  }
}

const sign = u => jwt.sign({ id: u.id, email: u.email }, JWT_SECRET, { expiresIn: "7d" });

// ---------- products ----------
app.get("/api/products", wrap(async (req, res) => {
  const { category, q } = req.query;
  const { rows } = await pool.query(
    `SELECT id, name, category, price::float, stock, icon FROM products
     WHERE ($1::text IS NULL OR category = $1)
       AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%')
     ORDER BY id`,
    [category || null, q || null]
  );
  res.json(rows);
}));

app.get("/api/products/:id", wrap(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, category, price::float, stock, icon FROM products WHERE id=$1",
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Product not found." });
  res.json(rows[0]);
}));

// ---------- auth ----------
app.post("/api/auth/register", wrap(async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 8)
    return res.status(400).json({ error: "Name, email and a password of 8+ characters are required." });
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email",
      [name, email.toLowerCase(), hash]
    );
    res.status(201).json({ user: rows[0], token: sign(rows[0]) });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "This email is already registered." });
    throw e;
  }
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [(email || "").toLowerCase()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password || "", u.password_hash)))
    return res.status(401).json({ error: "Wrong email or password." });
  res.json({ user: { id: u.id, name: u.name, email: u.email }, token: sign(u) });
}));

// ---------- orders ----------
// body: { name, email, address, payment_method, items: [{ product_id, quantity }] }
app.post("/api/orders", auth, wrap(async (req, res) => {
  const { name, email, address, payment_method, items } = req.body;
  if (!name || !email || !address || !Array.isArray(items) || !items.length)
    return res.status(400).json({ error: "Name, email, address and at least one item are required." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let total = 0;
    const lines = [];
    for (const it of items) {
      const qty = parseInt(it.quantity, 10);
      if (!(qty > 0)) throw Object.assign(new Error("Invalid quantity."), { status: 400 });
      // Price and stock come from the database, never from the client.
      const { rows } = await client.query(
        "UPDATE products SET stock = stock - $2 WHERE id=$1 AND stock >= $2 RETURNING price::float",
        [it.product_id, qty]
      );
      if (!rows[0]) throw Object.assign(new Error(`Product ${it.product_id} is unavailable or out of stock.`), { status: 409 });
      total += rows[0].price * qty;
      lines.push([it.product_id, qty, rows[0].price]);
    }
    const o = await client.query(
      `INSERT INTO orders (user_id, name, email, address, payment_method, total)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, total::float, status`,
      [req.user.id, name, email, address, payment_method || "Cash on delivery", total.toFixed(2)]
    );
    for (const [pid, qty, price] of lines)
      await client.query(
        "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)",
        [o.rows[0].id, pid, qty, price]
      );
    await client.query("COMMIT");
    res.status(201).json(o.rows[0]);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}));

app.get("/api/orders", auth, wrap(async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, total::float, status, created_at FROM orders WHERE user_id=$1 ORDER BY id DESC",
    [req.user.id]
  );
  res.json(rows);
}));

app.get("/api/health", (_, res) => res.json({ ok: true }));

// ---------- errors ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : "Something went wrong on the server." });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on port ${port}`));
