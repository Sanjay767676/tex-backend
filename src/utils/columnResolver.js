const columnAliases = require('../config/columnAliases');

/**
 * Normalize value for comparison (trim and lowercase)
 */
const normalizeValue = (value) => (value ? String(value).trim() : '');

/**
 * Get column index from header map using alias key
 * @param {Map} headerMap - Map of normalized header -> index
 * @param {string} aliasKey - Alias key from columnAliases
 * @returns {number} Column index or -1 if not found
 */
const getColumnByAlias = (headerMap, aliasKey) => {
    const aliases = columnAliases[aliasKey];

    if (!aliases || !Array.isArray(aliases)) {
        console.error(`[Column Resolver] Unknown alias key: "${aliasKey}"`);
        return -1;
    }

    // Try each alias variation
    for (const variation of aliases) {
        const normalizedVariation = normalizeValue(variation).toLowerCase();
        if (headerMap.has(normalizedVariation)) {
            const index = headerMap.get(normalizedVariation);
            console.log(`[Column Resolver] ✅ Resolved "${aliasKey}" → "${variation}" (column ${index})`);
            return index;
        }
    }

    // No match found
    console.warn(`[Column Resolver] ❌ Could not resolve "${aliasKey}". Tried: ${aliases.join(', ')}`);
    return -1;
};

/**
 * Get column letter from index (A, B, C, ... Z, AA, AB, ...)
 */
const indexToColumn = (index) => {
    let col = '';
    let num = index + 1;
    while (num > 0) {
        const rem = (num - 1) % 26;
        col = String.fromCharCode(65 + rem) + col;
        num = Math.floor((num - 1) / 26);
    }
    return col;
};

/**
 * Build header map from headers array
 */
const buildHeaderMap = (headers) => {
    const map = new Map();
    headers.forEach((header, idx) => {
        const key = normalizeValue(header).toLowerCase();
        if (key && !map.has(key)) {
            map.set(key, idx);
        }
    });
    return map;
};

/**
 * Validate required columns exist using aliases
 * @param {Array} headers - Header row
 * @param {Map} headerMap - Header map
 * @param {Array} requiredAliases - Array of alias keys that must exist
 * @throws {Error} If any required column is missing
 */
const validateRequiredColumns = (headers, headerMap, requiredAliases) => {
    const missing = [];

    for (const aliasKey of requiredAliases) {
        const index = getColumnByAlias(headerMap, aliasKey);
        if (index === -1) {
            missing.push(aliasKey);
        }
    }

    if (missing.length > 0) {
        throw new Error(`Required columns missing: ${missing.join(', ')}. Check columnAliases.js for possible header variations.`);
    }

    return true;
};

/**
 * Get column letter for an alias
 */
const getColumnLetterByAlias = (headers, headerMap, aliasKey) => {
    const idx = getColumnByAlias(headerMap, aliasKey);
    if (idx === -1) return null;
    return indexToColumn(idx);
};

/**
 * Check if header matches any day1 or day2 pattern
 */
const getDayType = (headerText) => {
    const normalized = normalizeValue(headerText).toLowerCase();

    // Explicit exclusion for structural/grouping headers
    if (normalized.includes('list of departments') || normalized.includes('departments')) {
        return null;
    }

    const day1Patterns = columnAliases.day1 || [];
    const day2Patterns = columnAliases.day2 || [];

    for (const pattern of day1Patterns) {
        if (normalized.includes(pattern.toLowerCase())) {
            return 'day1';
        }
    }

    for (const pattern of day2Patterns) {
        if (normalized.includes(pattern.toLowerCase())) {
            return 'day2';
        }
    }

    return null;
};

module.exports = {
    normalizeValue,
    getColumnByAlias,
    indexToColumn,
    buildHeaderMap,
    validateRequiredColumns,
    getColumnLetterByAlias,
    getDayType,
};
