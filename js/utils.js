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
 * @param {Date|string} date The date to format.
 * @returns {string} The formatted date string.
 */
export function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}


/**
 * Converts a quantity from a given recipe unit to a base unit (g, ml, or stk).
 * It uses standard conversion factors.
 * NOTE: This is simplified and does not use user-defined rules anymore.
 * @param {number} quantity The quantity to convert.
 * @param {string} fromUnit The unit to convert from (e.g., 'dl', 'spsk').
 * @param {string} targetUnit The target base unit ('g', 'ml', 'stk').
 * @returns {{ amount: number|null, error: string|null }} Result object.
 */
export function convertToBaseUnit(quantity, fromUnit, targetUnit) {
    if (!quantity) return { amount: 0, error: null };
    
    const normalizedFrom = normalizeUnit(fromUnit);
    
    if (normalizedFrom === targetUnit) {
        return { amount: quantity, error: null };
    }

    const conversionsToMl = { 'l': 1000, 'dl': 100, 'spsk': 15, 'tsk': 5 };
    const conversionsToG = { 'kg': 1000 };
    
    if (targetUnit === 'ml' && conversionsToMl[normalizedFrom]) {
        return { amount: quantity * conversionsToMl[normalizedFrom], error: null };
    }
    
    if (targetUnit === 'g' && conversionsToG[normalizedFrom]) {
        return { amount: quantity * conversionsToG[normalizedFrom], error: null };
    }

    // If it's 'stk' or any other unit that doesn't have a direct conversion path,
    // we assume it's a 1-to-1 conversion if the target is also 'stk'. Otherwise, it's an error.
    if (targetUnit === 'stk' && normalizedFrom === 'stk') {
         return { amount: quantity, error: null };
    }

    // We can't convert, e.g., 'stk' to 'g' without more info.
    return { 
        amount: null, 
        error: `Kan ikke konvertere fra '${fromUnit}' til '${targetUnit}'.` 
    };
}


/**
 * Calculates the estimated price of a recipe based on the ingredient library.
 * @param {object} recipe The recipe object.
 * @param {Array} ingredientInfo The full ingredient library.
 * @param {number} [portionsOverride] Optional number of portions to calculate for.
 * @returns {number} The total estimated price.
 */
export function calculateRecipePrice(recipe, ingredientInfo, portionsOverride) {
    let totalPrice = 0;
    if (!recipe.ingredients || !ingredientInfo) return 0;

    const scaleFactor = (portionsOverride || recipe.portions || 1) / (recipe.portions || 1);

    recipe.ingredients.forEach(ing => {
        const info = ingredientInfo.find(i => i.name.toLowerCase() === ing.name.toLowerCase());
        if (info && info.averagePrice && info.defaultUnit) {
            const scaledQuantity = (ing.quantity || 0) * scaleFactor;
            
            // Convert the ingredient's unit to the price unit defined in the library
            const conversion = convertToBaseUnit(scaledQuantity, ing.unit, info.defaultUnit);
            
            if (conversion.amount !== null) {
                totalPrice += conversion.amount * info.averagePrice;
            }
        }
    });
    return totalPrice;
}

/**
 * NY FUNKTION: Calculates the estimated nutrition (calories) of a recipe.
 * @param {object} recipe The recipe object.
 * @param {Array} ingredientInfo The full ingredient library.
 * @param {number} [portionsOverride] Optional number of portions to calculate for.
 * @returns {number} The total estimated calories for the entire dish.
 */
export function calculateRecipeNutrition(recipe, ingredientInfo, portionsOverride) {
    let totalCalories = 0;
    if (!recipe.ingredients || !ingredientInfo) return 0;

    const scaleFactor = (portionsOverride || recipe.portions || 1) / (recipe.portions || 1);

    recipe.ingredients.forEach(ing => {
        const info = ingredientInfo.find(i => i.name.toLowerCase() === ing.name.toLowerCase());
        // We can only calculate if we have calorie info and the unit is mass or volume
        if (info && info.caloriesPer100g && (info.defaultUnit === 'g' || info.defaultUnit === 'ml')) {
            const scaledQuantity = (ing.quantity || 0) * scaleFactor;
            
            // Convert ingredient unit to a base unit (g or ml) to calculate calories
            const conversion = convertToBaseUnit(scaledQuantity, ing.unit, info.defaultUnit);

            if (conversion.amount !== null) {
                // Calculate calories based on the amount in grams/ml
                const calories = (conversion.amount / 100) * info.caloriesPer100g;
                totalCalories += calories;
            }
        }
    });
    return totalCalories;
}


/**
 * Formaterer et tal som en dansk krone-streng.
 * @param {number} num - Tallet der skal formateres.
 * @returns {string} Den formaterede streng.
 */
export const toDKK = (num) => (num || 0).toLocaleString('da-DK');

/**
 * Parser en dansk krone-streng til et tal.
 * @param {string} str - Strengen der skal parses.
 * @returns {number} Det resulterende tal.
 */
export const parseDKK = (str) => parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;


// =================================================================
// NYE LÅNEBEREGNINGS-FUNKTIONER
// =================================================================

/**
 * Beregner den månedlige ydelse for et annuitetslån.
 * @param {number} principal - Lånets hovedstol (restgæld).
 * @param {number} annualRate - Den årlige rente i procent (f.eks. 5 for 5%).
 * @param {number} termMonths - Løbetiden i måneder.
 * @returns {number|null} Den månedlige ydelse, eller null hvis input er ugyldigt.
 */
export function calculateMonthlyPayment(principal, annualRate, termMonths) {
    if (principal <= 0 || annualRate < 0 || termMonths <= 0) return null;

    if (annualRate === 0) {
        return principal / termMonths;
    }

    const monthlyRate = (annualRate / 100) / 12;
    const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
    
    return payment;
}

/**
 * Beregner den resterende løbetid i måneder for et annuitetslån.
 * @param {number} principal - Lånets hovedstol (restgæld).
 * @param {number} annualRate - Den årlige rente i procent.
 * @param {number} monthlyPayment - Den månedlige ydelse.
 * @returns {number|null} Løbetiden i måneder, eller null hvis det er umuligt at afbetale.
 */
export function calculateTermMonths(principal, annualRate, monthlyPayment) {
    if (principal <= 0 || monthlyPayment <= 0) return 0;
    
    if (annualRate === 0) {
        return Math.ceil(principal / monthlyPayment);
    }

    const monthlyRate = (annualRate / 100) / 12;

    // Tjek om ydelsen overhovedet dækker renterne
    if (monthlyPayment <= principal * monthlyRate) {
        return Infinity; // Lånet vil aldrig blive betalt af
    }

    const term = -Math.log(1 - (principal * monthlyRate) / monthlyPayment) / Math.log(1 + monthlyRate);
    
    return Math.ceil(term);
}
