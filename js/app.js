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
import { initRooms, renderRoomsListPage, renderRoomDetailsPage } from './rooms.js';
import { initKitchenCounter } from './kitchenCounter.js';
import { initExpenses } from './expenses.js';
import { initEvents } from './events.js';
import { initBudget, renderBudgetPage } from './budget.js';

document.addEventListener('DOMContentLoaded', () => {
    // Central state object for the entire application
    const state = {
        currentUser: null,
        users: [],
        inventoryItems: [],
        inventoryBatches: [],
        inventory: [],
        recipes: [],
        projects: [],
        rooms: [],
        maintenanceLogs: [],
        expenses: [],
        events: [],
        budgetEntries: [], // New state for budget entries
        references: {
            maintenanceTasks: []
        },
        preferences: {},
        mealPlan: {},
        shoppingLists: {
            groceries: {},
            materials: {},
            wishlist: {}
        },
        budget: { monthlyAmount: 4000 },
        activeRecipeFilterTags: new Set(),
        currentDate: new Date(),
        currentlyViewedRecipeId: null,
        currentlyViewedRoomId: null,
        recipeFormImage: { type: null, data: null },
        listeners: {}
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
        budget: document.getElementById('budget'), // Add budget page element
        // ... (rest of the elements remain the same)
    };

    function setupRealtimeListeners(userId) {
        if (!userId) return;
        Object.values(state.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
        const commonErrorHandler = (error, context) => handleError(error, `Kunne ikke hente data for ${context}.`, `onSnapshot(${context})`);
        
        const collectionsToListen = {
            inventory_items: 'inventoryItems', inventory_batches: 'inventoryBatches', recipes: 'recipes',
            projects: 'projects', rooms: 'rooms', events: 'events', expenses: 'expenses',
            budget_entries: 'budgetEntries' // Listen to the new collection
        };

        for (const [coll, stateKey] of Object.entries(collectionsToListen)) {
            const q = query(collection(db, coll), where("userId", "==", userId));
            state.listeners[stateKey] = onSnapshot(q, (snapshot) => {
                state[stateKey] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                if (['inventoryItems', 'inventoryBatches'].includes(stateKey)) combineInventoryData();
                handleNavigation(window.location.hash);
            }, (error) => commonErrorHandler(error, coll));
        }

        // ... (rest of the listeners remain the same)
        
        const referencesRef = doc(db, 'references', userId);
        state.listeners.references = onSnapshot(referencesRef, (doc) => {
            if (doc.exists()) {
                state.references = doc.data();
                setReferencesLoaded(true);
            } else {
                handleError(new Error("References not found"), "Opsæt venligst dine referencer for at bruge appen.");
                window.location.hash = '#references';
            }
            handleNavigation(window.location.hash);
        }, (error) => commonErrorHandler(error, 'referencer'));
    }

    function handleNavigation(hash) {
        try {
            const [mainHash, subId] = (hash || '#dashboard').split('/');
            state.currentlyViewedRoomId = subId || null;
            navigateTo(mainHash);
            switch(mainHash) {
                case '#dashboard': renderDashboardPage(); break;
                case '#calendar': renderMealPlanner(); break;
                case '#hjem': renderRoomsListPage(); renderProjects(); break;
                case '#room-details': state.currentlyViewedRoomId ? renderRoomDetailsPage() : (window.location.hash = '#hjem'); break;
                case '#recipes': renderPageTagFilters(); renderRecipes(); break;
                case '#inventory': renderInventory(); break;
                case '#budget': renderBudgetPage(); break;
                case '#references': renderReferencesPage(); break;
            }
        } catch (error) {
            console.error("Fejl under navigation:", error);
            handleError(error, "Der opstod en fejl under navigation.");
        }
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
        state.currentUser = null;
        elements.appContainer.classList.add('hidden');
        elements.loginPage.classList.remove('hidden');
        Object.values(state.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
        setReferencesLoaded(false);
    }
    
    function combineInventoryData() {
        if (!state.inventoryItems || !state.inventoryBatches) return;
        state.inventory = state.inventoryItems.map(item => {
            const batches = state.inventoryBatches.filter(batch => batch.itemId === item.id);
            const totalStock = item.defaultUnit === 'stk' ? batches.reduce((sum, b) => sum + (b.quantity || 0), 0) : batches.reduce((sum, b) => sum + ((b.quantity || 0) * (b.size || 0)), 0);
            return { ...item, batches: batches.sort((a,b) => new Date(a.expiryDate) - new Date(b.expiryDate)), totalStock };
        });
    }

    function init() {
        setupAuthEventListeners(elements);
        initAuth(onLogin, onLogout);
        initUI(state, elements);
        initInventory(state, elements);
        initRecipes(state, elements);
        initShoppingList(state, elements);
        initKitchenCounter(state);
        initMealPlanner(state, elements);
        initReferences(state, elements);
        initDashboard(state, elements);
        initProjects(state, elements);
        initRooms(state, elements);
        initExpenses(state);
        initEvents(state, elements);
        initBudget(state, elements);
    }

    init();
});
