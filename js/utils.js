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

export function convertToBaseUnit(quantity, fromUnit, targetUnit, itemInfo) {
    if (!quantity) return { amount: 0, error: null };
    
    const normalizedFrom = normalizeUnit(fromUnit);
    
    if (normalizedFrom === targetUnit) {
        return { amount: quantity, error: null };
    }

    // Special case for 'stk' to 'g' conversion using itemInfo
    if (normalizedFrom === 'stk' && targetUnit === 'g' && itemInfo?.weightPerPiece) {
        return { amount: quantity * itemInfo.weightPerPiece, error: null };
    }

    const conversionsToMl = { 'l': 1000, 'dl': 100, 'spsk': 15, 'tsk': 5 };
    const conversionsToG = { 'kg': 1000 };
    
    if (targetUnit === 'ml' && conversionsToMl[normalizedFrom]) {
        return { amount: quantity * conversionsToMl[normalizedFrom], error: null };
    }
    
    if (targetUnit === 'g' && conversionsToG[normalizedFrom]) {
        return { amount: quantity * conversionsToG[normalizedFrom], error: null };
    }
    
    const pieceUnits = ['fed', 'dåse', 'bundt', 'knivspids'];
    if (targetUnit === 'stk' && pieceUnits.includes(normalizedFrom)) {
        return { amount: quantity, error: null };
    }

    return { 
        amount: null, 
        error: `Kan ikke konvertere fra '${fromUnit}' til '${targetUnit}'. Overvej at tilføje 'Vægt pr. stk' for varen.` 
    };
}

export function calculateRecipePrice(recipe, ingredientInfo, portionsOverride) {
    let minPrice = 0;
    let maxPrice = 0;
    if (!recipe.ingredients || !ingredientInfo) return { min: 0, max: 0 };

    const scaleFactor = (portionsOverride || recipe.portions || 1) / (recipe.portions || 1);

    recipe.ingredients.forEach(ing => {
        const info = ingredientInfo.find(i => i.name.toLowerCase() === ing.name.toLowerCase() || (i.aliases && i.aliases.includes(ing.name.toLowerCase())));
        if (info && (info.priceFrom || info.priceTo) && info.defaultUnit) {
            const scaledQuantity = (ing.quantity || 0) * scaleFactor;
            
            // Konverter opskriftens enhed til varens basisenhed (g, ml, stk)
            const conversion = convertToBaseUnit(scaledQuantity, ing.unit, info.defaultUnit, info);
            
            if (conversion.amount !== null) {
                // priceFrom er tilbudspris, priceTo er normalpris
                const priceFrom = info.priceFrom || info.priceTo;
                const priceTo = info.priceTo;
                
                if (priceFrom) {
                    minPrice += conversion.amount * priceFrom;
                }
                if (priceTo) {
                    maxPrice += conversion.amount * priceTo;
                }
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
            const conversion = convertToBaseUnit(ing.quantity || 0, ing.unit, 'g', info);
            if (conversion.amount !== null) {
                // Her antager vi at 1 ml ≈ 1 g for simplicitet
                totalGrams += conversion.amount;
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
            const conversion = convertToBaseUnit(ing.quantity || 0, ing.unit, 'g', info);

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

