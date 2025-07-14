// js/utils.js

// This module contains generic helper functions that can be reused across the application.

/**
 * Debounces a function to limit the rate at which it gets called.
 * @param {Function} func The function to debounce.
 * @param {number} delay The debounce delay in milliseconds.
 * @returns {Function} The debounced function.
 */
export function debounce(func, delay = 300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

/**
 * Normalizes a unit string to a consistent format.
 * @param {string} unit The unit string to normalize.
 * @returns {string} The normalized unit.
 */
export function normalizeUnit(unit) {
    const u = (unit || '').toLowerCase().trim();
    if (['g', 'gram', 'grams'].includes(u)) return 'g';
    if (['kg', 'kilogram', 'kilograms'].includes(u)) return 'kg';
    if (['ml', 'milliliter', 'milliliters'].includes(u)) return 'ml';
    if (['l', 'liter', 'liters'].includes(u)) return 'l';
    if (['stk', 'stk.', 'styk', 'styks'].includes(u)) return 'stk';
    if (['tsk', 'tsk.'].includes(u)) return 'tsk';
    if (['spsk', 'spsk.'].includes(u)) return 'spsk';
    if (['dl', 'dl.'].includes(u)) return 'dl';
    if (['fed'].includes(u)) return 'fed';
    if (['dåse', 'dåser'].includes(u)) return 'dåse';
    return u;
}

/**
 * Gets the week number for a given date.
 * @param {Date} d The date.
 * @returns {number} The week number.
 */
export function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
}

/**
 * Gets the date of the first day (Monday) of the week for a given date.
 * @param {Date} date The date.
 * @returns {Date} The start of the week.
 */
export function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

/**
 * Formats a Date object into a YYYY-MM-DD string.
 * @param {Date} date The date to format.
 * @returns {string} The formatted date string.
 */
export function formatDate(date) {
    return date.toISOString().split('T')[0];
}

/**
 * Converts a quantity from a given recipe unit to grams, using the inventory item's conversion factor.
 * @param {number} quantity The quantity to convert (from a recipe).
 * @param {string} fromUnit The unit to convert from (from a recipe).
 * @param {object} inventoryItem The corresponding inventory item which holds the grams_per_unit conversion factor.
 * @returns {{grams: number|null, error: string|null}} An object with the converted quantity in grams or an error.
 */
export function convertToGrams(quantity, fromUnit, inventoryItem) {
    const normalizedFromUnit = normalizeUnit(fromUnit);
    const itemDisplayUnit = normalizeUnit(inventoryItem.unit);

    // Direct conversion for weight units
    if (normalizedFromUnit === 'g') {
        return { grams: quantity, error: null };
    }
    if (normalizedFromUnit === 'kg') {
        return { grams: quantity * 1000, error: null };
    }
    
    // Conversion if the recipe unit matches the item's display unit (e.g., recipe says "2 stk", item is stored in "stk")
    if (normalizedFromUnit === itemDisplayUnit && inventoryItem.grams_per_unit) {
        return { grams: quantity * inventoryItem.grams_per_unit, error: null };
    }

    // If units don't match, we can't be sure. Example: recipe says "1 dl", item is stored in "stk".
    // This requires a more complex conversion map in the future. For now, we return an error.
    // A special case could be added for volume-to-weight if needed, but grams_per_unit is the primary method.
    if (inventoryItem.grams_per_unit) {
         console.warn(`Potential unit mismatch for '${inventoryItem.name}'. Recipe unit: '${fromUnit}', Item unit: '${inventoryItem.unit}'. Falling back to grams_per_unit.`)
         return { grams: quantity * inventoryItem.grams_per_unit, error: null };
    }

    return { grams: null, error: `Kan ikke omregne '${fromUnit}' til gram for varen '${inventoryItem.name}'. Opdater varen med 'gram pr. enhed'.` };
}
