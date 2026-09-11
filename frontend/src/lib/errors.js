/**
 * Extract a human-readable message from a failed API call.
 *
 * The backend always shapes error responses as `{ detail: "message" }`, so that
 * field carries the explanation the user actually needs — e.g. why a raw
 * material cannot be deleted while printing jobs still reference it. Falls back
 * to the caller's generic string when the failure is a network/parse error with
 * no response body.
 *
 * @param {unknown} err - The caught error (typically an axios error)
 * @param {string} fallback - Message to show when no `detail` is available
 * @returns {string}
 */
export function getErrorMessage(err, fallback) {
    return err?.response?.data?.detail || fallback;
}
