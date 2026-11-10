CREATE TABLE purchase_items (id uuid PRIMARY KEY, purchase_id uuid NOT NULL REFERENCES purchases ON DELETE CASCADE, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 300), unit_amount bigint NOT NULL CHECK(unit_amount>0), quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 1000));
INSERT INTO purchase_items(id,purchase_id,name,unit_amount,quantity) SELECT id,id,item,amount,1 FROM purchases;
ALTER TABLE returns DROP CONSTRAINT returns_purchase_id_key;
CREATE TABLE return_items (return_id uuid NOT NULL REFERENCES returns ON DELETE CASCADE, item_id uuid NOT NULL REFERENCES purchase_items ON DELETE CASCADE, quantity integer NOT NULL CHECK(quantity>0), PRIMARY KEY(return_id,item_id));
INSERT INTO return_items(return_id,item_id,quantity) SELECT id,purchase_id,1 FROM returns;
ALTER TABLE returns ADD COLUMN feature_schema_version integer NOT NULL DEFAULT 1;
