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
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
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
 * Formats a Date object into a YYYY-MM-DD string, respecting the local timezone.
 * @param {Date} date The date to format.
 * @returns {string} The formatted date string.
 */
export function formatDate(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    // FIX: Use local date parts to avoid timezone issues with toISOString()
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
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

/**
 * Calculates the estimated price of a recipe.
 * @param {object} recipe The recipe object.
 * @param {Array} inventory The full inventory list.
 * @param {number} [portionsOverride] Optional number of portions to calculate for.
 * @returns {number} The total estimated price.
 */
export function calculateRecipePrice(recipe, inventory, portionsOverride) {
    let totalPrice = 0;
    if (!recipe.ingredients) return 0;

    const scaleFactor = (portionsOverride || recipe.portions || 1) / (recipe.portions || 1);

    recipe.ingredients.forEach(ing => {
        const inventoryItem = inventory.find(inv => inv.name.toLowerCase() === ing.name.toLowerCase());
        if (inventoryItem && inventoryItem.batches && inventoryItem.batches.length > 0) {
            const cheapestBatch = inventoryItem.batches
                .filter(b => b.price && b.size > 0 && b.quantity > 0)
                .sort((a, b) => (a.price / (a.quantity * a.size)) - (b.price / (b.quantity * b.size)))[0];
            
            if (cheapestBatch) {
                const scaledQuantity = (ing.quantity || 0) * scaleFactor;
                const conversion = convertToGrams(scaledQuantity, ing.unit, inventoryItem);
                
                if (conversion.grams !== null) {
                    const pricePerBaseUnit = cheapestBatch.price / (cheapestBatch.quantity * cheapestBatch.size);
                    totalPrice += conversion.grams * pricePerBaseUnit;
                }
            }
        }
    });
    return totalPrice;
}

/**
 * Viser en toast-notifikation.
 * @param {string} message - Meddelelsen, der skal vises.
 * @param {string} [type='info'] - Typen af notifikation ('info', 'success', 'error').
 */
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        console.error('Toast container not found!');
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Vis toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    // Skjul og fjern toast efter 3 sekunder
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }, 3000);
}

/**
 * Håndterer og logger fejl til konsollen med en standardiseret besked.
 * @param {string} message - En beskrivende besked om fejlen.
 * @param {Error} error - Det faktiske fejl-objekt.
 */
export function handleError(message, error) {
    console.error(`[APP_ERROR] ${message}`, error);
    // Her kan vi senere udvide med mere avanceret fejlhåndtering, f.eks. logging til en service.
}
export function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show';
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}

export function generateId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Formaterer et tal til dansk valuta (DKK).
 * @param {number} value - Tallet der skal formateres.
 * @returns {string} Det formaterede beløb som en string.
 */
export function formatCurrency(value) {
    return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' }).format(value || 0);
}

/**
 * Beregner det gennemsnitlige månedlige beløb for en periodisk post.
 * @param {object} item - Den periodiske post med 'amount' og 'interval'.
 * @returns {number} Det gennemsnitlige månedlige beløb.
 */
export function getMonthlyAmount(item) {
    const divisors = { monthly: 1, quarterly: 3, yearly: 12 };
    return (item.amount || 0) / (divisors[item.interval] || 1);
}

/**
 * Beregner antallet af hele måneder mellem to datoer.
 * @param {Date} date1 - Startdato.
 * @param {Date} date2 - Slutdato.
 * @returns {number} Antallet af måneder.
 */
export function monthsBetween(date1, date2) {
    let months = (date2.getFullYear() - date1.getFullYear()) * 12;
    months -= date1.getMonth();
    months += date2.getMonth();
    return months <= 0 ? 0 : months;
}
