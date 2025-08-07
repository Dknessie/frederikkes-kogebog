// js/kitchenCounter.js

import { db } from './firebase.js';
import { doc, runTransaction, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { convertToGrams } from './utils.js';

let appState;

export function initKitchenCounter(state) {
    appState = state;
}

export async function confirmAndDeductIngredients(recipeId, portions) {
    const recipe = appState.recipes.find(r => r.id === recipeId);
    if (!recipe) {
        handleError(new Error("Opskrift ikke fundet"), "Kunne ikke finde opskriften for at fratrække ingredienser.");
        return false;
    }

    const confirmed = await showNotification({
        title: "Bekræft Madlavning",
        message: `Vil du trække ingredienserne til <strong>${recipe.title}</strong> fra dit varelager? Handlingen kan ikke fortrydes.`,
        type: 'confirm'
    });

    if (!confirmed) {
        return false;
    }

    try {
        await deductIngredientsFromInventory(recipe, portions);
        showNotification({ title: "Lager Opdateret", message: `Ingredienserne for ${recipe.title} er blevet trukket fra lageret.` });
        return true;
    } catch (error) {
        handleError(error, `Kunne ikke opdatere lageret: <br><br>${error.message.replace(/\n/g, '<br>')}`, "deductIngredients");
        return false;
    }
}

async function deductIngredientsFromInventory(recipe, portions) {
    const scaleFactor = (portions || recipe.portions || 1) / (recipe.portions || 1);

    await runTransaction(db, async (transaction) => {
        const validationErrors = [];
        const deductionPlan = [];

        for (const ingredient of recipe.ingredients) {
            const inventoryItem = appState.inventory.find(inv => inv.name.toLowerCase() === ingredient.name.toLowerCase());

            if (!inventoryItem) {
                validationErrors.push(`Varen '${ingredient.name}' findes ikke på lager.`);
                continue;
            }

            const scaledQuantity = (ingredient.quantity || 0) * scaleFactor;
            const conversion = convertToGrams(scaledQuantity, ingredient.unit, inventoryItem);

            if (conversion.error) {
                validationErrors.push(conversion.error);
                continue;
            }

            let amountToDeduct = conversion.grams;

            if (inventoryItem.totalStock < amountToDeduct) {
                validationErrors.push(`Ikke nok '${ingredient.name}' på lager. Mangler ${(amountToDeduct - inventoryItem.totalStock).toFixed(0)}${inventoryItem.defaultUnit}.`);
                continue;
            }

            // Sort batches by expiry date (FIFO), nulls last
            const sortedBatches = [...inventoryItem.batches].sort((a, b) => {
                if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate) - new Date(b.expiryDate);
                if (a.expiryDate) return -1;
                if (b.expiryDate) return 1;
                return new Date(a.purchaseDate) - new Date(b.purchaseDate);
            });

            for (const batch of sortedBatches) {
                if (amountToDeduct <= 0) break;

                const batchStock = (batch.quantity || 0) * (batch.size || 0);
                const amountFromThisBatch = Math.min(amountToDeduct, batchStock);

                const newQuantity = (batchStock - amountFromThisBatch) / batch.size;

                deductionPlan.push({
                    batchId: batch.id,
                    newQuantity: newQuantity,
                });

                amountToDeduct -= amountFromThisBatch;
            }
        }

        if (validationErrors.length > 0) {
            throw new Error(validationErrors.join('\n'));
        }

        // Execute deductions
        for (const plan of deductionPlan) {
            const batchRef = doc(db, 'inventory_batches', plan.batchId);
            if (plan.newQuantity > 0) {
                transaction.update(batchRef, { quantity: plan.newQuantity });
            } else {
                transaction.delete(batchRef);
            }
        }
    });
}
