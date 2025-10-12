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

/**
 * Konverterer en mængde fra en given enhed til gram, baseret på varens standardenhed
 * eller brugerdefinerede konverteringer.
 * @param {number} quantity - Mængden at konvertere.
 * @param {string} fromUnit - Enheden mængden er i (f.eks. 'stk', 'dl').
 * @param {object} itemInfo - Information om ingrediensen, inklusiv `defaultUnit` og `unitConversions`.
 * @returns {{amount: number|null, error: string|null}} Konverteret mængde i gram eller en fejl.
 */
export function convertToGrams(quantity, fromUnit, itemInfo) {
    if (!quantity || quantity === 0) return { amount: 0, error: null };
    
    const normalizedFrom = normalizeUnit(fromUnit);
    
    // Hvis enheden allerede er 'g', 'ml' (som antages at være 1:1 med gram for kalorier/pris) eller en anden ukendt enhed til enhedskonvertering.
    if (normalizedFrom === 'g') {
        return { amount: quantity, error: null };
    }
    if (normalizedFrom === 'ml') { // For simplicitet antages 1 ml = 1g for kalorier/prisberegning
        return { amount: quantity, error: null };
    }
    if (normalizedFrom === 'l') {
        return { amount: quantity * 1000, error: null };
    }
    if (normalizedFrom === 'dl') {
        return { amount: quantity * 100, error: null };
    }
    if (normalizedFrom === 'kg') {
        return { amount: quantity * 1000, error: null };
    }

    // Tjek for brugerdefinerede konverteringer (f.eks. 'stk' -> gram)
    if (itemInfo && itemInfo.unitConversions && itemInfo.unitConversions[normalizedFrom]) {
        const gramsPerUnit = itemInfo.unitConversions[normalizedFrom];
        return { amount: quantity * gramsPerUnit, error: null };
    }

    // Fallback for tsk/spsk (antager standardværdier, men kan gøres mere præcist med densitet)
    if (normalizedFrom === 'spsk') { // ca. 15g vand/mel
        return { amount: quantity * 15, error: null };
    }
    if (normalizedFrom === 'tsk') { // ca. 5g vand/mel
        return { amount: quantity * 5, error: null };
    }
    
    // Hvis enheden er 'stk' men der ingen konvertering er defineret
    if (normalizedFrom === 'stk' && !itemInfo?.unitConversions?.[normalizedFrom]) {
        return { amount: null, error: `Mangler konvertering for '${fromUnit}' til gram for '${itemInfo?.name || 'varen'}'.` };
    }

    // Hvis enheden er ukendt og ikke kan konverteres
    return { 
        amount: null, 
        error: `Ukendt enhed '${fromUnit}' for vare '${itemInfo?.name || 'varen'}' eller manglende konvertering.` 
    };
}


export function calculateRecipePrice(recipe, ingredientInfo) {
    let minPrice = 0;
    let maxPrice = 0;
    if (!recipe.ingredients || !ingredientInfo) return { min: 0, max: 0 };

    recipe.ingredients.forEach(ing => {
        const info = ingredientInfo.find(i => i.name.toLowerCase() === ing.name.toLowerCase() || (i.aliases && i.aliases.includes(ing.name.toLowerCase())));
        
        if (info && (info.priceFrom || info.priceTo) && info.defaultUnit) {
            
            // Konverter opskriftens enhed til gram for at beregne pris baseret på gram/kg pris
            const conversionToGrams = convertToGrams(ing.quantity || 0, ing.unit, info);
            
            if (conversionToGrams.amount !== null) {
                // Prisen er gemt pr. standardenhed (g/ml/stk). Hvis defaultUnit er 'stk', så bruges styk-prisen.
                // Ellers antager vi, at prisen er per gram.
                let pricePerGramMin = info.priceFrom; // priceFrom er nu direkte per defaultUnit
                let pricePerGramMax = info.priceTo;   // priceTo er nu direkte per defaultUnit

                if (info.defaultUnit === 'stk') {
                    // Hvis prisen er pr. styk, skal vi bruge antal 'stk' direkte, ikke gram
                    // Her antages det, at opskriften også angiver antal i 'stk', hvis prisen er pr. 'stk'
                    // Dette kræver en 1:1 match eller en logik til at konvertere opskriftens enhed til 'stk'
                    // For nu, hvis defaultUnit er 'stk' og opskriftens enhed er 'stk', så brug det direkte.
                    // Hvis opskriftens enhed er anderledes, er det en kompleks konvertering, der kræver 'stk' konvertering.
                    if (normalizeUnit(ing.unit) === 'stk') {
                        minPrice += (ing.quantity || 0) * (pricePerGramMin || pricePerGramMax);
                        maxPrice += (ing.quantity || 0) * pricePerGramMax;
                    } else {
                        // Kan ikke direkte beregne pris pr. stk, hvis opskriften bruger en anden enhed
                        // og vi ikke har en konvertering til 'stk' for opskriftens enhed.
                        // For nu ignoreres prisen for denne ingrediens, hvis den ikke kan matches.
                        console.warn(`Advarsel: Kan ikke beregne pris for '${ing.name}'. Pris angivet pr. '${info.defaultUnit}', men opskrift bruger '${ing.unit}'.`);
                    }
                } else {
                    // Hvis prisen er pr. g/ml/kg/l (som nu konverteres til g for konsistens)
                    minPrice += conversionToGrams.amount * (pricePerGramMin || pricePerGramMax);
                    maxPrice += conversionToGrams.amount * pricePerGramMax;
                }
            } else {
                console.warn(`Kunne ikke konvertere mængde for '${ing.name}' fra '${ing.unit}' for prisberegning. Fejl: ${conversionToGrams.error}`);
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
            // Konverter alle mulige enheder til gram for at få totalvægt
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
            // Konverter ingrediensens mængde til gram for at beregne kalorier
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

/**
 * Finder alle unikke enheder brugt for en specifik ingrediens på tværs af alle opskrifter.
 * @param {string} ingredientName - Navnet på ingrediensen.
 * @param {Array<object>} allRecipes - Alle opskrifter i applikationen.
 * @returns {Set<string>} En Set af unikke, normaliserede enheder.
 */
export function getRecipeUsedUnitsForIngredient(ingredientName, allRecipes) {
    const usedUnits = new Set();
    const normalizedIngredientName = ingredientName.toLowerCase();

    allRecipes.forEach(recipe => {
        if (recipe.ingredients) {
            recipe.ingredients.forEach(ing => {
                if (ing.name.toLowerCase() === normalizedIngredientName) {
                    const normalizedUnit = normalizeUnit(ing.unit);
                    // KORREKTION: Fjerner filtreringen, så ALLE enheder, der ikke er standard vægt/volumen, kommer med.
                    if (normalizedUnit && !['g', 'ml', 'kg', 'l', 'dl'].includes(normalizedUnit)) {
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

