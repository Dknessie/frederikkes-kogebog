// js/app.js

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth, getAllData } from './firebase.js';
import { setupLogin, setupLogout } from './auth.js';
import { showSection, setupNavigation } from './ui.js';
import { initDashboard } from './dashboard.js';
import { initRecipes } from './recipes.js';
import { initInventory } from './inventory.js';
import { initShoppingList } from './shoppingList.js';
import { initMealPlanner } from './mealPlanner.js';
import { initProjects } from './projects.js';
// ... importer andre moduler efter behov

// Central state for hele applikationen
const state = {
    user: null,
    recipes: [],
    inventory: [],
    shoppingList: {},
    mealPlan: {},
    projects: [],
    // Tilføj andre state-egenskaber her
};

/**
 * Funktion til at opdatere og re-renderere de nødvendige dele af UI'en
 * baseret på den aktive sektion.
 */
function updateActivePage() {
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
    
    // Vis app-container og skjul login-side
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('login-page').classList.add('hidden');
    
    // Hent alle data fra Firestore og opdater state
    const allData = await getAllData(user.uid);
    Object.assign(state, allData); // Opdater state med de hentede data
    
    console.log("State er initialiseret:", state);

    // Opsæt navigation og logud-knap
    setupNavigation(updateActivePage); 
    setupLogout();
    
    // Vis dashboard som standard og kald updateActivePage for at rendere den
    showSection('dashboard-section');
    updateActivePage();
}

/**
 * Håndterer situationen, hvor brugeren ikke er logget ind.
 */
function handleLoggedOutUser() {
    state.user = null;
    // Vis login-side og skjul app-container
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('login-page').classList.remove('hidden');
}

// Lytter efter ændringer i brugerens login-status
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Bruger er logget ind
        initializeApp(user);
    } else {
        // Bruger er logget ud
        handleLoggedOutUser();
    }
});

// Initialiser login-funktionaliteten én gang, når appen starter
setupLogin();
