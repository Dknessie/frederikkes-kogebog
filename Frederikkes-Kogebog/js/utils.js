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
 * Converts a quantity from a given unit to the primary unit 'g' if possible.
 * @param {number} quantity The quantity to convert.
 * @param {string} fromUnit The unit to convert from.
 * @param {object} inventoryItem The corresponding inventory item for conversion factors.
 * @returns {object} An object with the converted quantity or an error.
 */
export function convertToPrimaryUnit(quantity, fromUnit, inventoryItem) {
    const primaryUnit = 'g';
    const normalizedFromUnit = normalizeUnit(fromUnit);

    if (normalizedFromUnit === primaryUnit) {
        return { convertedQuantity: quantity, error: null };
    }
    
    if (normalizedFromUnit === 'kg') {
        return { convertedQuantity: quantity * 1000, error: null };
    }

    if (inventoryItem && inventoryItem.grams_per_unit) {
        return { convertedQuantity: quantity * inventoryItem.grams_per_unit, error: null };
    }
    
    if (inventoryItem && normalizeUnit(inventoryItem.unit) === normalizedFromUnit) {
        return { convertedQuantity: null, error: null, directMatch: true, quantity: quantity };
    }

    return { convertedQuantity: null, error: `Kan ikke omregne fra '${fromUnit}' til '${primaryUnit}'.` };
}
