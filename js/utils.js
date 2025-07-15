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
 * Converts a quantity from a given recipe unit to the master product's base unit (g or ml).
 * It prioritizes user-defined conversion rules on the master product.
 * @param {number} quantity The quantity to convert.
 * @param {string} fromUnit The unit to convert from (e.g., 'stk', 'dl').
 * @param {object} masterProduct The master product, which contains conversion_rules and defaultUnit.
 * @returns {{grams: number|null, error: string|null}} Result object.
 */
export function convertToGrams(quantity, fromUnit, masterProduct) {
    if (!quantity) return { grams: 0, error: null };
    
    const normalizedFromUnit = normalizeUnit(fromUnit);
    const rules = masterProduct.conversion_rules || {};
    const baseUnit = masterProduct.defaultUnit || 'g'; // 'g' or 'ml'

    // 1. Direct match with base unit
    if (normalizedFromUnit === baseUnit) {
        return { grams: quantity, error: null };
    }

    // 2. Check user-defined conversion rules on the master product
    if (rules[normalizedFromUnit]) {
        return { grams: quantity * rules[normalizedFromUnit], error: null };
    }

    // 3. Fallback to standard conversions if no user rule exists
    const standardConversions = {
        'g': { 'kg': 1000 },
        'ml': { 'l': 1000, 'dl': 100, 'spsk': 15, 'tsk': 5 }
    };
    
    if (standardConversions[baseUnit] && standardConversions[baseUnit][normalizedFromUnit]) {
        return { grams: quantity * standardConversions[baseUnit][normalizedFromUnit], error: null };
    }

    // 4. If no conversion is possible
    return { 
        grams: null, 
        error: `Kan ikke omregne '${fromUnit}' til '${baseUnit}' for varen '${masterProduct.name}'. Tilføj venligst en konverteringsregel på varekortet.` 
    };
}
