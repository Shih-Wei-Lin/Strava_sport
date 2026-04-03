/**
 * Format a date as a local YYYY-MM-DD string.
 * @param {Date} date - The date to format.
 * @returns {string}
 */
export function toLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str - Unsafe string.
 * @returns {string}
 */
export function escapeHtml(str) {
    if (!str) return "";
    const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
    };
    return str.replace(/[&<>"']/g, (m) => map[m]);
}
