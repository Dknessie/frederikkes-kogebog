// js/utils.js

// This module contains generic helper functions that can be reused across the application.

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

export function debounce(func, delay = 300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

export function normalizeUnit(unit) {
    const u = (unit || '').toLowerCase().trim().replace(/\.$/, '');
    if (['g', 'gram', 'grams'].includes(u)) return 'g';
    if (['kg', 'kilogram', 'kilograms'].includes(u)) return 'kg';
    if (['ml', 'milliliter', 'milliliters'].includes(u)) return 'ml';
    if (['l', 'liter', 'liters'].includes(u)) return 'l';
    if (['stk', 'styk', 'styks', 'stk.'].includes(u)) return 'stk';
    if (['tsk', 'teske', 'teskefuld'].includes(u)) return 'tsk';
    if (['spsk', 'spiseske', 'spiseskefuld'].includes(u)) return 'spsk';
    if (['dl'].includes(u)) return 'dl';
    if (['fed'].includes(u)) return 'fed';
    if (['dåse', 'dåser'].includes(u)) return 'dåse';
    if (['bundt'].includes(u)) return 'bundt';
    if (['knivspids'].includes(u)) return 'knivspids';
    if (['pakke', 'pakker'].includes(u)) return 'pakke'; // Tilføjet 'pakke' som enhed
    return u;
}

export function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
}

export function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

export function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function convertToGrams(quantity, fromUnit, itemInfo) {
    if (!quantity || quantity === 0) return { amount: 0, error: null };
    
    const normalizedFrom = normalizeUnit(fromUnit);
    
    if (normalizedFrom === 'g') return { amount: quantity, error: null };
    if (normalizedFrom === 'kg') return { amount: quantity * 1000, error: null };
    if (normalizedFrom === 'ml') return { amount: quantity, error: null }; // 1:1 for simplicity
    if (normalizedFrom === 'l') return { amount: quantity * 1000, error: null }; // 1:1 for simplicity
    if (normalizedFrom === 'dl') return { amount: quantity * 100, error: null }; // 1:1 for simplicity

    if (itemInfo && itemInfo.unitConversions && itemInfo.unitConversions[normalizedFrom]) {
        const gramsPerUnit = itemInfo.unitConversions[normalizedFrom];
        return { amount: quantity * gramsPerUnit, error: null };
    }

    if (normalizedFrom === 'spsk') return { amount: quantity * 15, error: null }; // Fallback
    if (normalizedFrom === 'tsk') return { amount: quantity * 5, error: null }; // Fallback
    
    return { 
        amount: null, 
        error: `Mangler konvertering for '${fromUnit}' til gram for '${itemInfo?.name || 'varen'}'.` 
    };
}

export function calculateRecipePrice(recipe, ingredientInfo) {
    let minPrice = 0;
    let maxPrice = 0;
    if (!recipe.ingredients || !ingredientInfo) return { min: 0, max: 0 };

    recipe.ingredients.forEach(ing => {
        const info = ingredientInfo.find(i => i.name.toLowerCase() === ing.name.toLowerCase() || (i.aliases && i.aliases.includes(ing.name.toLowerCase())));
        
        if (info && (info.priceTo || info.priceFrom)) {
            const priceTo = info.priceTo;
            const priceFrom = info.priceFrom || priceTo;
            let pricePerGramMin = null;
            let pricePerGramMax = null;

            // Step 1: Beregn en standard pris pr. gram for varen
            switch (info.defaultUnit) {
                case 'kg':
                case 'l': // Antager 1l = 1000g
                    pricePerGramMin = priceFrom / 1000;
                    pricePerGramMax = priceTo / 1000;
                    break;
                case 'stk':
                    // For 'stk' kan vi kun beregne en pris pr. gram, hvis vi ved, hvad et stykke vejer.
                    if (info.unitConversions && info.unitConversions.stk) {
                        const gramsPerStk = info.unitConversions.stk;
                        pricePerGramMin = priceFrom / gramsPerStk;
                        pricePerGramMax = priceTo / gramsPerStk;
                    }
                    // Hvis vi ikke kender vægten af 'stk', kan vi ikke beregne en gram-pris.
                    break;
            }

            // Step 2: Beregn prisen for den specifikke mængde i opskriften
            if (pricePerGramMax !== null) { // Vi har en gram-pris
                const conversionToGrams = convertToGrams(ing.quantity || 0, ing.unit, info);
                if (conversionToGrams.amount !== null) {
                    minPrice += conversionToGrams.amount * pricePerGramMin;
                    maxPrice += conversionToGrams.amount * pricePerGramMax;
                } else {
                    console.warn(`Kunne ikke beregne pris for '${ing.name}' fra enhed '${ing.unit}'. Konvertering til gram mangler.`);
                }
            } else if (info.defaultUnit === 'stk') { // Prisen er pr. 'stk', og vi har ingen gram-pris
                if (normalizeUnit(ing.unit) === 'stk') {
                    // Simpelt tilfælde: Opskriften bruger 'stk', prisen er pr. 'stk'
                    minPrice += (ing.quantity || 0) * priceFrom;
                    maxPrice += (ing.quantity || 0) * priceTo;
                } else {
                    console.warn(`Kan ikke beregne 'stk' pris for '${ing.name}', da opskriften bruger '${ing.unit}' og konvertering mangler.`);
                }
            } else {
                console.warn(`Kunne ikke bestemme pris pr. gram for '${ing.name}' med prisenhed '${info.defaultUnit}'.`);
            }
        }
    });
    return { min: minPrice, max: maxPrice };
}


function calculateRecipeWeightInGrams(recipe, ingredientInfo) {
    let totalGrams = 0;
    if (!recipe.ingredients) return 0;

    recipe.ingredients.forEach(ing => {
        const info = ingredientInfo.find(i => i.name.toLowerCase() === ing.name.toLowerCase() || (i.aliases && i.aliases.includes(ing.name.toLowerCase())));
        if (info) {
            const conversion = convertToGrams(ing.quantity || 0, ing.unit, info);
            if (conversion.amount !== null) {
                totalGrams += conversion.amount;
            } else {
                console.warn(`Kunne ikke konvertere mængde for '${ing.name}' fra '${ing.unit}' til gram for vægtberegning. Fejl: ${conversion.error}`);
            }
        }
    });
    return totalGrams;
}


export function calculateRecipeNutrition(recipe, ingredientInfo) {
    let totalCalories = 0;
    if (!recipe.ingredients || !ingredientInfo) return 0;

    recipe.ingredients.forEach(ing => {
        const info = ingredientInfo.find(i => i.name.toLowerCase() === ing.name.toLowerCase() || (i.aliases && i.aliases.includes(ing.name.toLowerCase())));
        if (info && info.caloriesPer100g) {
            const conversion = convertToGrams(ing.quantity || 0, ing.unit, info);

            if (conversion.amount !== null) {
                const calories = (conversion.amount / 100) * info.caloriesPer100g;
                totalCalories += calories;
            } else {
                console.warn(`Kunne ikke konvertere mængde for '${ing.name}' fra '${ing.unit}' til gram for kalorieberegning. Fejl: ${conversion.error}`);
            }
        }
    });
    
    const totalGrams = calculateRecipeWeightInGrams(recipe, ingredientInfo);
    if (totalGrams === 0) return 0;

    return (totalCalories / totalGrams) * 100;
}

export function getRecipeUsedUnitsForIngredient(ingredientName, allRecipes) {
    const usedUnits = new Set();
    const normalizedIngredientName = ingredientName.toLowerCase();

    allRecipes.forEach(recipe => {
        if (recipe.ingredients) {
            recipe.ingredients.forEach(ing => {
                if (ing.name.toLowerCase() === normalizedIngredientName) {
                    const normalizedUnit = normalizeUnit(ing.unit);
                    if (normalizedUnit && !['g', 'kg', 'ml', 'l', 'dl'].includes(normalizedUnit)) {
                        usedUnits.add(normalizedUnit);
                    }
                }
            });
        }
    });
    return usedUnits;
}


export const toDKK = (num) => (num || 0).toLocaleString('da-DK');
export const parseDKK = (str) => parseFloat(String(str).replace(/\./g, '').replace(',', '.')) || 0;

export function calculateMonthlyPayment(principal, annualRate, termMonths) {
    if (principal <= 0 || annualRate < 0 || termMonths <= 0) return null;
    if (annualRate === 0) return principal / termMonths;
    const monthlyRate = (annualRate / 100) / 12;
    const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / (Math.pow(1 + monthlyRate, termMonths) - 1);
    return payment;
}

export function calculateTermMonths(principal, annualRate, monthlyPayment) {
    if (principal <= 0 || monthlyPayment <= 0) return 0;
    if (annualRate === 0) return Math.ceil(principal / monthlyPayment);
    const monthlyRate = (annualRate / 100) / 12;
    if (monthlyPayment <= principal * monthlyRate) return Infinity;
    const term = -Math.log(1 - (principal * monthlyRate) / monthlyPayment) / Math.log(1 + monthlyRate);
    return Math.ceil(term);
}

