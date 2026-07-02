DROP TRIGGER IF EXISTS users_sync_crm_contact_trigger ON users;
DROP FUNCTION IF EXISTS sync_user_to_crm_contact();
DROP TABLE IF EXISTS crm_activities;
DROP TABLE IF EXISTS crm_contacts;
