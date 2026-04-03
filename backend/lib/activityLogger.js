const { v4: uuidv4 } = require("uuid");
const ActivityLog = require("../models/ActivityLog");

/**
 * Log an activity event.
 * @param {Object} params
 * @param {string} params.action - LOGIN | CREATE | UPDATE | DELETE | EXPORT | IMPORT | CLEAR_DATA | BACKUP
 * @param {string} params.entity_type - e.g. "purchase", "printing_job", "user"
 * @param {string} [params.entity_id]
 * @param {string} [params.entity_label] - Human-readable identifier (sr_no, job_number, etc.)
 * @param {Object} params.user - { id, username }
 * @param {string} [params.details]
 * @param {string} [params.ip_address]
 */
async function logActivity({ action, entity_type, entity_id, entity_label, user, details, ip_address }) {
  try {
    await ActivityLog.create({
      id: uuidv4(),
      action,
      entity_type,
      entity_id: entity_id || null,
      entity_label: entity_label || null,
      user_id: user.id,
      username: user.username,
      details: details || null,
      ip_address: ip_address || null,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[ActivityLogger] Failed to log activity:", { action, entity_type, error: error.message });
  }
}

module.exports = { logActivity };
