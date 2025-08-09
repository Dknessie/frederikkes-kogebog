// js/app.js

import { db } from './firebase.js';
import { collection, onSnapshot, doc, where, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { initAuth, setupAuthEventListeners } from './auth.js';
import { initUI, navigateTo, handleError } from './ui.js';
import { initInventory, renderInventory, setReferencesLoaded } from './inventory.js';
import { initRecipes, renderRecipes, renderPageTagFilters } from './recipes.js';
import { initMealPlanner, renderMealPlanner } from './mealPlanner.js';
import { initShoppingList } from './shoppingList.js';
import { initReferences, renderReferencesPage } from './references.js';
import { initDashboard, renderDashboardPage } from './dashboard.js';
import { initProjects, renderProjects } from './projects.js';
import { initWeeklyPlan, renderWeeklyPlan } from './weeklyPlan.js';
import { initKitchenCounter } from './kitchenCounter.js';
import { initExpenses } from './expenses.js';
import { initEvents } from './events.js';

document.addEventListener('DOMContentLoaded', () => {
    // Central state object for the entire application
    const state = {
        currentUser: null,
        inventoryItems: [],
        inventoryBatches: [],
        inventory: [],
        recipes: [],
        projects: [],
        weeklyPlan: null, // New state for the weekly plan
        events: [],
        references: {},
        preferences: {},
        mealPlan: {},
        shoppingLists: {
            groceries: {},
            materials: {},
            wishlist: {}
        },
        budget: { monthlyAmount: 4000 },
        activeRecipeFilterTags: new Set(),
        currentDate: new Date(), // Used for calendar and weekly plan navigation
        // ... other state properties
    };

    // Cache of DOM elements for performance
    const elements = {
        loginPage: document.getElementById('login-page'),
        appContainer: document.getElementById('app-container'),
        loginForm: document.getElementById('login-form'),
        logoutButtons: [document.getElementById('logout-btn-header')],
        navLinks: document.querySelectorAll('.desktop-nav .nav-link'),
        pages: document.querySelectorAll('#app-main-content .page'),
        headerTitleLink: document.querySelector('.header-title-link'),
        
        // Projects
        projectEditModal: document.getElementById('project-edit-modal'),
        projectForm: document.getElementById('project-form'),
        addProjectBtn: document.getElementById('add-project-btn'),
        projectsGrid: document.getElementById('projects-grid'),
        projectMaterialsContainer: document.getElementById('project-materials-container'),
        addMaterialBtn: document.getElementById('add-material-btn'),

        // Other elements...
    };

    function computeDerivedShoppingLists() {
        // Compute materials list from projects
        const materialsList = {};
        state.projects.forEach(project => {
            (project.materials || []).forEach(material => {
                const key = material.name.toLowerCase();
                materialsList[key] = {
                    name: material.name,
                    quantity_to_buy: material.quantity || 1,
                    unit: material.unit || 'stk',
                    price: material.price || null,
                    projectId: project.id,
                };
            });
        });
        state.shoppingLists.materials = materialsList;
    }

    function combineInventoryData() {
        // ... (this function remains the same)
    }

    function setupRealtimeListeners(userId) {
        if (!userId) return;
        Object.values(state.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
        const commonErrorHandler = (error, context) => handleError(error, `Kunne ikke hente data for ${context}.`, `onSnapshot(${context})`);
        
        const collections = {
            inventory_items: 'inventoryItems',
            inventory_batches: 'inventoryBatches',
            recipes: 'recipes',
            projects: 'projects',
            events: 'events'
        };

        for (const [coll, stateKey] of Object.entries(collections)) {
            const q = query(collection(db, coll), where("userId", "==", userId));
            state.listeners[stateKey] = onSnapshot(q, (snapshot) => {
                state[stateKey] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                if (stateKey === 'inventoryItems' || stateKey === 'inventoryBatches') {
                    combineInventoryData();
                }
                if (stateKey === 'projects') {
                    computeDerivedShoppingLists();
                }

                handleNavigation(window.location.hash);
            }, (error) => commonErrorHandler(error, coll));
        }
        
        // ... (other listeners remain the same)

        const referencesRef = doc(db, 'references', userId);
        state.listeners.references = onSnapshot(referencesRef, (doc) => {
            if (doc.exists()) {
                state.references = doc.data();
                setReferencesLoaded(true);
                handleNavigation(window.location.hash);
            }
        }, (error) => commonErrorHandler(error, 'referencer'));
    }

    function onLogin(user) {
        state.currentUser = user;
        elements.loginPage.classList.add('hidden');
        elements.appContainer.classList.remove('hidden');
        
        setupRealtimeListeners(user.uid); 
        window.addEventListener('hashchange', () => handleNavigation(window.location.hash));
        handleNavigation(window.location.hash || '#dashboard');
    }

    function onLogout() {
        // ... (this function remains the same)
    }

    function handleNavigation(hash) {
        try {
            const mainHash = hash.split('/')[0] || '#dashboard';
            
            navigateTo(mainHash);

            switch(mainHash) {
                case '#dashboard':
                    renderDashboardPage();
                    break;
                case '#calendar':
                    renderMealPlanner();
                    break;
                case '#hjem':
                    renderWeeklyPlan(); // New function call
                    break;
                case '#projects':
                    renderProjects();
                    break;
                case '#recipes':
                    renderPageTagFilters();
                    renderRecipes();
                    break;
                case '#inventory':
                    renderInventory();
                    break;
                case '#references':
                    renderReferencesPage();
                    break;
            }
        } catch (error) {
            console.error("Fejl under navigation:", error);
            handleError(error, "Der opstod en fejl under navigation.");
        }
    }

    function init() {
        initUI(state, elements);
        initInventory(state, elements);
        initRecipes(state, elements);
        initShoppingList(state, elements);
        initKitchenCounter(state);
        initMealPlanner(state, elements);
        initReferences(state, elements);
        initDashboard(state, elements);
        initProjects(state, elements);
        initWeeklyPlan(state, elements); // New module
        initExpenses(state);
        initEvents(state);
        setupAuthEventListeners(elements);
        
        initAuth(onLogin, onLogout);
    }

    init();
});
