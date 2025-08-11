// js/kitchenCounter.js

import { db } from './firebase.js';
import { doc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { handleError } from './utils.js'; // Rettet import

let state;

export function initKitchenCounter(appState) {
    state = appState;
    // Eventuelle fremtidige event listeners for køkkenbordet kan tilføjes her.
}

export async function addToKitchenCounter(recipeId) {
    if (!state.currentUser) return;
    try {
        const userDocRef = doc(db, 'users', state.currentUser.uid);
        await updateDoc(userDocRef, {
            kitchenCounter: arrayUnion(recipeId)
        });
    } catch (error) {
        handleError(error, "Kunne ikke tilføje opskrift til køkkenbordet.", "addToKitchenCounter");
    }
}

export async function removeFromKitchenCounter(recipeId) {
    if (!state.currentUser) return;
    try {
        const userDocRef = doc(db, 'users', state.currentUser.uid);
        await updateDoc(userDocRef, {
            kitchenCounter: arrayRemove(recipeId)
        });
    } catch (error) {
        handleError(error, "Kunne ikke fjerne opskrift fra køkkenbordet.", "removeFromKitchenCounter");
    }
}
