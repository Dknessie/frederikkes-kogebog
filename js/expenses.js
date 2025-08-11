// js/expenses.js

import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
// Rettet import til at bruge den centrale fejlhåndtering fra utils.js
import { handleError } from './utils.js'; 

let state;

export function initExpenses(appState) {
    state = appState;
    
    const addExpenseForm = document.getElementById('add-expense-form');
    if (addExpenseForm) {
        addExpenseForm.addEventListener('submit', handleAddExpense);
    }
}

async function handleAddExpense(e) {
    e.preventDefault();
    if (!state.currentUser) {
        handleError(new Error("Bruger ikke logget ind"), "Du skal være logget ind for at tilføje en udgift.");
        return;
    }

    const form = e.target;
    const expenseData = {
        userId: state.currentUser.uid,
        description: form.description.value,
        amount: parseFloat(form.amount.value),
        category: form.category.value,
        date: new Date(form.date.value),
        createdAt: serverTimestamp()
    };

    if (isNaN(expenseData.amount)) {
        handleError(new Error("Ugyldigt beløb"), "Indtast venligst et gyldigt tal i beløbsfeltet.");
        return;
    }

    try {
        await addDoc(collection(db, 'expenses'), expenseData);
        form.reset();
        // Her kunne man lukke en modal, hvis formularen var i en
        // hideModal('add-expense-modal');
    } catch (error) {
        handleError(error, "Kunne ikke gemme udgiften.", "handleAddExpense");
    }
}
