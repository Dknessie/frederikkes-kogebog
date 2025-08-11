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
    isInitialized: false // Flag for at sikre, at appen kun initialiseres én gang
};

/**
 * Funktion til at opdatere og re-renderere den aktive side.
 */
function updateActivePage() {
    const activeSection = document.querySelector('main section:not([style*="display: none"])');
    if (!activeSection) return;

    console.log(`Opdaterer indhold for sektion: ${activeSection.id}`);
    switch (activeSection.id) {
        case 'dashboard-section':
            initDashboard(state);
            break;
        case 'recipes-section':
            initRecipes(state);
            break;
        // Tilføj cases for andre sektioner her, efterhånden som de bliver opdateret
    }
}

/**
 * Initialiserer hele applikationen. Kører kun én gang pr. login.
 * @param {object} user - Brugerobjektet fra Firebase Auth.
 */
async function initializeApp(user) {
    if (state.isInitialized) return; // Stop hvis appen allerede er kørende
    state.isInitialized = true;
    state.user = user;
    
    // Vis en "Henter data..." spinner/besked
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('login-page').classList.add('hidden');
    
    // Hent alle data
    const allData = await getAllData(user.uid);
    Object.assign(state, allData);
    
    console.log("App er fuldt initialiseret med state:", state);

    // Opsæt navigation og logud-knap
    setupNavigation(updateActivePage); 
    setupLogout();
    
    // Bestem startsiden baseret på URL'en
    const initialHash = window.location.hash || '#dashboard';
    const initialSectionId = initialHash.substring(1) + '-section';

    // Opdater den aktive fane i navigationen
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    const initialLink = document.querySelector(`.nav-link[href="${initialHash}"]`);
    if (initialLink) {
        initialLink.classList.add('active');
    }

    // Vis den korrekte sektion og opdater dens indhold
    showSection(initialSectionId);
    updateActivePage();
}

/**
 * Håndterer situationen, hvor brugeren er logget ud.
 */
function handleLoggedOutUser() {
    state.isInitialized = false; // Nulstil flaget
    state.user = null;
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('login-page').classList.remove('hidden');
}

// Lytter centralt efter ændringer i brugerens login-status
onAuthStateChanged(auth, (user) => {
    if (user) {
        initializeApp(user);
    } else {
        handleLoggedOutUser();
    }
});

// Sæt login-formularen op, når siden indlæses
setupLogin();
