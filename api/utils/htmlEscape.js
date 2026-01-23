/**
 * HTML Escaping Utilities
 * Prevents XSS attacks by escaping HTML special characters in user-provided content
 * before inserting into email templates or other HTML output
 */

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} text - The text to escape
 * @returns {string} - HTML-escaped text
 */
function escapeHtml(text) {
    if (text === null || text === undefined) {
        return '';
    }

    // Convert to string if not already
    const str = String(text);

    const htmlEscapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;',
    };

    return str.replace(/[&<>"'`=/]/g, (char) => htmlEscapeMap[char]);
}

/**
 * Escape HTML for use in email templates
 * Handles common fields that might contain user input
 * @param {string} text - The text to escape
 * @returns {string} - HTML-escaped text safe for email templates
 */
function escapeForEmail(text) {
    return escapeHtml(text);
}

/**
 * Escape an object's string values recursively
 * Useful for escaping entire objects before using in templates
 * @param {object} obj - Object with values to escape
 * @returns {object} - New object with escaped string values
 */
function escapeObjectHtml(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj === 'string') {
        return escapeHtml(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => escapeObjectHtml(item));
    }

    if (typeof obj === 'object') {
        const escaped = {};
        for (const key of Object.keys(obj)) {
            escaped[key] = escapeObjectHtml(obj[key]);
        }
        return escaped;
    }

    return obj;
}

/**
 * Strip all HTML tags from text
 * @param {string} text - Text potentially containing HTML
 * @returns {string} - Plain text with HTML tags removed
 */
function stripHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
}

/**
 * Format currency for safe display in emails
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency symbol (default: €)
 * @returns {string} - Formatted and escaped currency string
 */
function formatCurrencyForEmail(amount, currency = '€') {
    if (typeof amount !== 'number' || isNaN(amount)) {
        return escapeHtml(`${currency}0.00`);
    }
    return escapeHtml(`${currency}${amount.toFixed(2)}`);
}

module.exports = {
    escapeHtml,
    escapeForEmail,
    escapeObjectHtml,
    stripHtml,
    formatCurrencyForEmail,
};
