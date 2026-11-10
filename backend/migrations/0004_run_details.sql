ALTER TABLE returns ADD COLUMN shipping_deadline date;
ALTER TABLE returns ADD COLUMN delivered_at timestamptz;
ALTER TABLE returns ADD COLUMN resolved_at timestamptz;
ALTER TABLE returns ADD COLUMN dropped_off_at timestamptz;
ALTER TABLE run_assignments ADD COLUMN handed_over_at timestamptz;
ALTER TABLE run_assignments ADD COLUMN evidence_note text NOT NULL DEFAULT '';
ALTER TABLE purchases ADD COLUMN timezone text NOT NULL DEFAULT 'Europe/Berlin';
