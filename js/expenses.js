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
 * @param {object} expenseData - The data for the expense.
 * @param {number} expenseData.amount - The total amount of the expense.
 * @param {string} expenseData.mainCategory - The main category of the expense.
 * @param {string} [expenseData.subCategory=null] - The sub-category of the expense.
 * @param {string} expenseData.description - A brief description of the expense.
 * @param {boolean} [expenseData.isImpulse=true] - Whether it's a variable/impulse purchase.
 * @param {string} [expenseData.relatedId=null] - The ID of a related document.
 */
export async function logExpense({ amount, mainCategory, subCategory = null, description, isImpulse = true, relatedId = null }) {
    if (!appState.currentUser || typeof amount !== 'number' || amount <= 0) {
        console.warn("logExpense aborted: Invalid user or amount.", { user: appState.currentUser, amount });
        return;
    }

    try {
        await addDoc(collection(db, 'expenses'), {
            userId: appState.currentUser.uid,
            amount: amount,
            mainCategory: mainCategory,
            subCategory: subCategory,
            description: description,
            date: serverTimestamp(),
            isImpulse: isImpulse, // Standard for logged expenses
            relatedId: relatedId
        });
    } catch (error) {
        handleError(error, "Udgiften kunne ikke logges.", "logExpense");
    }
}
