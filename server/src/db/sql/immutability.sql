-- Journal d'audit : append-only (aucune modification ni suppression possible, y compris par l'application)
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % en ajout seul : modification interdite', TG_TABLE_NAME;
END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
-- Événements de pointage : jamais supprimés ; seule la colonne superseded_by peut être renseignée une fois (correction tracée)
CREATE OR REPLACE FUNCTION attendance_events_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Suppression d''un événement de pointage interdite';
  END IF;
  IF (to_jsonb(NEW) - 'superseded_by') IS DISTINCT FROM (to_jsonb(OLD) - 'superseded_by') OR OLD.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'Un événement de pointage est immuable (seul superseded_by peut être renseigné une fois)';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER attendance_events_immutable BEFORE UPDATE OR DELETE ON attendance_events
  FOR EACH ROW EXECUTE FUNCTION attendance_events_guard();
--> statement-breakpoint
CREATE TRIGGER attendance_corrections_immutable BEFORE UPDATE OR DELETE ON attendance_corrections
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
