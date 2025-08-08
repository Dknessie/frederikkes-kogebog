// js/expenses.js

import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleError } from './ui.js';

let appState;

/**
 * Initializes the expenses module.
 * @param {object} state - The global app state.
 */
export function initExpenses(state) {
    appState = state;
}

/**
 * Logs a new expense to the Firestore 'expenses' collection.
 * @param {number} amount - The total amount of the expense.
 * @param {string} category - The category of the expense (e.g., 'Dagligvarer', 'Projekter').
 * @param {string} description - A brief description of the expense.
 * @param {string} [relatedId=null] - The ID of the related document (e.g., itemId, projectId).
 */
export async function logExpense(amount, category, description, relatedId = null) {
    if (!appState.currentUser || typeof amount !== 'number' || amount <= 0) {
        return; // Do not log invalid or zero-amount expenses
    }

    try {
        await addDoc(collection(db, 'expenses'), {
            userId: appState.currentUser.uid,
            amount: amount,
            category: category,
            description: description,
            date: serverTimestamp(), // Use server timestamp for accuracy
            relatedId: relatedId
        });
    } catch (error) {
        handleError(error, "Udgiften kunne ikke logges.", "logExpense");
    }
}
