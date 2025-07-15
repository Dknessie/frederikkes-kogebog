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
    const u = (unit || '').toLowerCase().trim().replace(/\.$/, '');
    if (['g', 'gram', 'grams'].includes(u)) return 'g';
    if (['kg', 'kilogram', 'kilograms'].includes(u)) return 'kg';
    if (['ml', 'milliliter', 'milliliters'].includes(u)) return 'ml';
    if (['l', 'liter', 'liters'].includes(u)) return 'l';
    if (['stk', 'styk', 'styks'].includes(u)) return 'stk';
    if (['tsk', 'teske', 'teskefuld'].includes(u)) return 'tsk';
    if (['spsk', 'spiseske', 'spiseskefuld'].includes(u)) return 'spsk';
    if (['dl'].includes(u)) return 'dl';
    if (['fed'].includes(u)) return 'fed';
    if (['dåse', 'dåser'].includes(u)) return 'dåse';
    if (['bundt'].includes(u)) return 'bundt';
    if (['knivspids'].includes(u)) return 'knivspids';
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
    if (!(date instanceof Date) || isNaN(date)) return '';
    return date.toISOString().split('T')[0];
}

/**
 * Converts a quantity from a recipe unit to a base unit (grams or ml).
 * This is a simplified conversion utility.
 * @param {number} quantity The quantity to convert.
 * @param {string} fromUnit The unit to convert from.
 * @returns {{amount: number|null, unit: string|null, nonConvertible: boolean, error: string|null}} An object with the converted amount or an error.
 */
export function convertToBaseUnit(quantity, fromUnit) {
    if (!quantity) return { amount: 0, error: null };
    
    const normalizedUnit = normalizeUnit(fromUnit);

    const conversionMap = {
        'g': 1,
        'kg': 1000,
        'ml': 1,
        'l': 1000,
        'dl': 100,
        'spsk': 15, // Approx. 15ml
        'tsk': 5,   // Approx. 5ml
    };

    if (conversionMap[normalizedUnit] !== undefined) {
        return { amount: quantity * conversionMap[normalizedUnit], error: null, nonConvertible: false };
    }
    
    // For units like 'stk', 'fed', 'dåse', we cannot convert to g/ml without more context.
    // We return the original quantity and unit, and let the calling function decide what to do.
    if (['stk', 'fed', 'dåse', 'bundt', 'knivspids'].includes(normalizedUnit)) {
        return { amount: quantity, unit: normalizedUnit, error: null, nonConvertible: true };
    }

    return { amount: null, error: `Ukendt enhed for konvertering: '${fromUnit}'` };
}
