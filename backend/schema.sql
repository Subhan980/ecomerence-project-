CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock INT NOT NULL DEFAULT 100,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  total NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL
);

INSERT INTO products (name, category, price, icon) VALUES
('Steel water bottle','Home',18,'🍶'),
('Canvas tote bag','Fashion',12,'👜'),
('Wireless earbuds','Tech',49,'🎧'),
('Desk lamp','Home',34,'💡'),
('Running shoes','Fashion',65,'👟'),
('Power bank 10,000 mAh','Tech',27,'🔋'),
('Ceramic mug set','Home',22,'☕'),
('Cotton t-shirt','Fashion',15,'👕'),
('Mechanical keyboard','Tech',79,'⌨️'),
('Notebook (3-pack)','Stationery',9,'📓'),
('Gel pen set','Stationery',6,'🖊️'),
('Backpack','Fashion',42,'🎒')
ON CONFLICT DO NOTHING;
