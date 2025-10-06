// js/utils.js

// This module contains generic helper functions that can be reused across the application.

/**
 * Komprimerer og tilpasser et billede, før det uploades.
 * @param {File} file - Billedfilen fra en input[type=file].
 * @param {object} options - Indstillinger for komprimering.
 * @param {number} [options.quality=0.7] - Kvaliteten af JPEG-billedet (0-1).
 * @param {number} [options.maxWidth=1200] - Maksimal bredde af billedet.
 * @param {number} [options.maxHeight=1200] - Maksimal højde af billedet.
 * @returns {Promise<string>} En Promise, der resolver til en Base64 data URL af det komprimerede billede.
 */
export async function compressImage(file, options = {}) {
    const { quality = 0.7, maxWidth = 1200, maxHeight = 1200 } = options;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

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
    
    if (targetUnit === 'stk') {
        // Simple 1-to-1 for units like 'fed', 'dåse' etc. when target is 'stk'
        const pieceUnits = ['stk', 'fed', 'dåse', 'bundt', 'knivspids'];
        if (pieceUnits.includes(normalizedFrom)) {
            return { amount: quantity, error: null };
        }
    }

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
        const info = ingredientInfo.find(i => i.name.toLowerCase() === ing.name.toLowerCase() || (i.aliases && i.aliases.includes(ing.name.toLowerCase())));
        if (info && info.averagePrice && info.defaultUnit) {
            const scaledQuantity = (ing.quantity || 0) * scaleFactor;
            
            const conversion = convertToBaseUnit(scaledQuantity, ing.unit, info.defaultUnit);
            
            if (conversion.amount !== null) {
                totalPrice += conversion.amount * info.averagePrice;
            }
        }
    });
    return totalPrice;
}

/**
 * NY FUNKTION: Beregner den samlede vægt af en opskrift i gram.
 * Ignorerer ingredienser målt i 'stk', 'fed' etc., medmindre der findes en konverteringsregel.
 * @param {object} recipe - Opskrift-objektet.
 * @param {Array} ingredientInfo - Hele ingrediensbiblioteket.
 * @returns {number} Den samlede vægt i gram.
 */
function calculateRecipeWeightInGrams(recipe, ingredientInfo) {
    let totalGrams = 0;
    if (!recipe.ingredients) return 0;

    recipe.ingredients.forEach(ing => {
        const info = ingredientInfo.find(i => i.name.toLowerCase() === ing.name.toLowerCase() || (i.aliases && i.aliases.includes(ing.name.toLowerCase())));
        if (info && (info.defaultUnit === 'g' || info.defaultUnit === 'ml')) {
             const conversion = convertToBaseUnit(ing.quantity || 0, ing.unit, 'g');
             if (conversion.amount !== null) {
                 totalGrams += conversion.amount;
             }
        }
    });
    return totalGrams;
}


/**
 * ÆNDRET: Beregner nu kalorier pr. 100g for en opskrift.
 * @param {object} recipe The recipe object.
 * @param {Array} ingredientInfo The full ingredient library.
 * @returns {number} The estimated calories per 100g.
 */
export function calculateRecipeNutrition(recipe, ingredientInfo) {
    let totalCalories = 0;
    if (!recipe.ingredients || !ingredientInfo) return 0;

    recipe.ingredients.forEach(ing => {
        const info = ingredientInfo.find(i => i.name.toLowerCase() === ing.name.toLowerCase() || (i.aliases && i.aliases.includes(ing.name.toLowerCase())));
        if (info && info.caloriesPer100g && (info.defaultUnit === 'g' || info.defaultUnit === 'ml')) {
            const conversion = convertToBaseUnit(ing.quantity || 0, ing.unit, info.defaultUnit);

            if (conversion.amount !== null) {
                const calories = (conversion.amount / 100) * info.caloriesPer100g;
                totalCalories += calories;
            }
        }
    });
    
    const totalGrams = calculateRecipeWeightInGrams(recipe, ingredientInfo);
    if (totalGrams === 0) return 0;

    return (totalCalories / totalGrams) * 100;
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

    if (monthlyPayment <= principal * monthlyRate) {
        return Infinity; 
    }

    const term = -Math.log(1 - (principal * monthlyRate) / monthlyPayment) / Math.log(1 + monthlyRate);
    
    return Math.ceil(term);
}

