// js/app.js

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { auth, setupRealtimeListeners } from './firebase.js';
import { setupLogin, setupLogout } from './auth.js';
import { showSection, setupNavigation } from './ui.js';
import { initDashboard } from './dashboard.js';
import { initRecipes } from './recipes.js';
// ... importer andre moduler efter behov

const state = {
    user: null,
    recipes: [],
    inventory: [],
    shoppingList: {},
    mealPlan: {},
    projects: [],
    isInitialized: false,
    unsubscribe: () => {} // Funktion til at stoppe listeners ved logud
};

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
    }
}

async function initializeApp(user) {
    if (state.isInitialized) return;
    state.isInitialized = true;
    state.user = user;
    
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('login-page').classList.add('hidden');
    
    // Opsæt listeners og vent på, at de første data er klar
    state.unsubscribe = setupRealtimeListeners(user.uid, state, () => {
        console.log("App er fuldt initialiseret med realtids-data:", state);

        setupNavigation(updateActivePage); 
        setupLogout(state.unsubscribe); // Giv unsubscribe-funktionen med til logud
        
        const initialHash = window.location.hash || '#dashboard';
        const initialSectionId = initialHash.substring(1) + '-section';

        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const initialLink = document.querySelector(`.nav-link[href="${initialHash}"]`);
        if (initialLink) {
            initialLink.classList.add('active');
        }

        showSection(initialSectionId);
        updateActivePage();
    });
}

function handleLoggedOutUser() {
    state.unsubscribe(); // Kør unsubscribe-funktionen for at stoppe alle listeners
    state.isInitialized = false;
    state.user = null;
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('login-page').classList.remove('hidden');
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        initializeApp(user);
    } else {
        handleLoggedOutUser();
    }
});

setupLogin();
