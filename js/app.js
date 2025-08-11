// js/app.js

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth } from './firebase.js';
import { showSection, setupNavigation } from './ui.js';
import { initDashboard } from './dashboard.js';
import { initRecipes } from './recipes.js';
import { initInventory } from './inventory.js';
import { initShoppingList } from './shoppingList.js';
import { initMealPlanner } from './mealPlanner.js';
import { initProjects } from './projects.js';
// Importer andre moduler efter behov...
import { getAllData } from './firebase.js';

// Central state for hele applikationen
const state = {
    user: null,
    recipes: [],
    inventory: [],
    shoppingList: [],
    mealPlan: [],
    projects: [],
    // Tilføj andre state-egenskaber her
};

/**
 * Funktion til at opdatere og re-renderere de nødvendige dele af UI'en
 * baseret på den aktive sektion.
 */
function updateUI() {
    const activeSection = document.querySelector('main section:not([style*="display: none"])');
    if (!activeSection) return;

    switch (activeSection.id) {
        case 'dashboard-section':
            initDashboard(state);
            break;
        case 'recipes-section':
            initRecipes(state);
            break;
        case 'inventory-section':
            initInventory(state);
            break;
        case 'shopping-list-section':
            initShoppingList(state);
            break;
        case 'meal-planner-section':
            initMealPlanner(state);
            break;
        case 'projects-section':
            initProjects(state);
            break;
        // Tilføj cases for andre sektioner her
    }
}

/**
 * Initialiserer applikationen, når brugerens login-status er bekræftet.
 * @param {object} user - Brugerobjektet fra Firebase Auth.
 */
async function initializeApp(user) {
    state.user = user;
    document.body.classList.remove('logged-out');
    document.body.classList.add('logged-in');
    
    // Hent alle data fra Firestore og opdater state
    try {
        const allData = await getAllData(user.uid);
        state.recipes = allData.recipes || [];
        state.inventory = allData.inventory || [];
        state.shoppingList = allData.shoppingList || [];
        state.mealPlan = allData.mealPlan || [];
        state.projects = allData.projects || [];
        // ... opdater resten af state
    } catch (error) {
        console.error("Fejl ved hentning af data:", error);
        // Vis en fejlbesked til brugeren i UI'et
    }
    
    console.log("State er initialiseret:", state);

    // Opsæt navigation, der kalder updateUI ved sideskift
    setupNavigation(updateUI); 
    
    // Vis dashboard som standard og kald updateUI for at rendere den
    showSection('dashboard-section');
    updateUI();
}

/**
 * Håndterer situationen, hvor brugeren ikke er logget ind.
 */
function handleLoggedOutUser() {
    state.user = null;
    document.body.classList.remove('logged-in');
    document.body.classList.add('logged-out');
    showSection('login-section');
}

// Lytter efter ændringer i brugerens login-status
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Bruger er logget ind
        if (!state.user || state.user.uid !== user.uid) {
            initializeApp(user);
        }
    } else {
        // Bruger er logget ud
        handleLoggedOutUser();
    }
});
