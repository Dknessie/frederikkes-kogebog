// js/app.js

import { db } from './firebase.js';
import { collection, onSnapshot, doc, where, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { initAuth, setupAuthEventListeners } from './auth.js';
import { initUI, navigateTo, handleError } from './ui.js';
import { initInventory, renderInventory, setReferencesLoaded } from './inventory.js';
import { initRecipes, renderRecipes, renderPageTagFilters } from './recipes.js';
import { initMealPlanner, renderMealPlanner } from './mealPlanner.js';
import { initShoppingList, renderShoppingList } from './shoppingList.js';
import { initKitchenCounter, renderKitchenCounter } from './kitchenCounter.js';
import { initReferences, renderReferencesPage } from './references.js';
import { initOverview, renderOverviewPage } from './overview.js';

document.addEventListener('DOMContentLoaded', () => {
    // Central state object for the entire application
    const state = {
        currentUser: null,
        inventoryItems: [], // Formerly masterProducts
        inventoryBatches: [], // Formerly inventoryVariants
        inventory: [], // Will contain the combined/nested data of items and their batches
        recipes: [],
        references: {},
        preferences: {},
        mealPlan: {},
        shoppingList: {},
        kitchenCounter: {},
        budget: { monthlyAmount: 4000 },
        activeRecipeFilterTags: new Set(),
        currentDate: new Date(),
        currentlyViewedRecipeId: null,
        recipeFormImage: { type: null, data: null },
        listeners: {} // To hold unsubscribe functions for Firestore listeners
    };

    // Cache of DOM elements for performance
    const elements = {
        loginPage: document.getElementById('login-page'),
        appContainer: document.getElementById('app-container'),
        loginForm: document.getElementById('login-form'),
        logoutButtons: [document.getElementById('logout-btn-header'), document.getElementById('logout-btn-profile')],
        navLinks: document.querySelectorAll('.desktop-nav .nav-link'),
        pages: document.querySelectorAll('#app-main-content .page'),
        headerTitleLink: document.querySelector('.header-title-link'),
        inventoryItemModal: document.getElementById('inventory-item-modal'),
        inventoryItemForm: document.getElementById('inventory-item-form'),
        addInventoryItemBtn: document.getElementById('add-inventory-item-btn'),
        inventoryModalTitle: document.getElementById('inventory-item-modal-title'),
        recipeEditModal: document.getElementById('recipe-edit-modal'),
        recipeForm: document.getElementById('recipe-form'),
        addRecipeBtn: document.getElementById('add-recipe-btn'),
        recipeEditModalTitle: document.getElementById('recipe-edit-modal-title'),
        recipeGrid: document.querySelector('.recipe-grid'),
        ingredientsContainer: document.getElementById('ingredients-container'),
        addIngredientBtn: document.getElementById('add-ingredient-btn'),
        recipeImportTextarea: document.getElementById('recipe-import-textarea'),
        recipeImagePreview: document.getElementById('recipe-image-preview'),
        recipeImageUrlInput: document.getElementById('recipe-imageUrl'),
        recipeImageUploadInput: document.getElementById('recipe-image-upload'),
        recipeFilterContainer: document.getElementById('recipe-filter-container'),
        sortByStockToggle: document.getElementById('sort-by-stock-toggle'),
        recipeReadModal: document.getElementById('recipe-read-modal'),
        readViewPlanBtn: document.getElementById('read-view-plan-btn'),
        readViewCookBtn: document.getElementById('read-view-cook-btn'),
        readViewEditBtn: document.getElementById('read-view-edit-btn'),
        readViewDeleteBtn: document.getElementById('read-view-delete-btn'),
        readViewPrice: document.getElementById('read-view-price'),
        calendarGrid: document.getElementById('calendar-grid'),
        calendarTitle: document.getElementById('calendar-title'),
        prevWeekBtn: document.getElementById('prev-week-btn'),
        nextWeekBtn: document.getElementById('next-week-btn'),
        clearMealPlanBtn: document.getElementById('clear-meal-plan-btn'),
        desktopPanelTabs: document.querySelectorAll('#meal-planner-sidebar-left .panel-tab'),
        desktopSidebarPanels: document.querySelectorAll('#meal-planner-sidebar-left .sidebar-panel'),
        planMealModal: document.getElementById('plan-meal-modal'),
        planMealForm: document.getElementById('plan-meal-form'),
        planMealModalTitle: document.getElementById('plan-meal-modal-title'),
        mealTypeSelector: document.querySelector('#plan-meal-modal .meal-type-selector'),
        referencesContainer: document.getElementById('references-container'),
        inventorySummaryCard: document.getElementById('inventory-summary-card'),
        mobileTabBar: document.getElementById('mobile-tab-bar'),
        mobileTabLinks: document.querySelectorAll('.mobile-tab-link'),
        mobilePanelOverlay: document.getElementById('mobile-panel-overlay'),
        mobileShoppingListPanel: document.getElementById('mobile-shopping-list-panel'),
        mobileKitchenCounterPanel: document.getElementById('mobile-kitchen-counter-panel'),
        notificationModal: document.getElementById('notification-modal'),
        notificationTitle: document.getElementById('notification-title'),
        notificationMessage: document.getElementById('notification-message'),
        notificationActions: document.getElementById('notification-actions'),
        editBudgetModal: document.getElementById('edit-budget-modal'),
        editBudgetForm: document.getElementById('edit-budget-form'),
        monthlyBudgetInput: document.getElementById('monthly-budget-input'),
        budgetSpentEl: document.getElementById('budget-spent'),
        budgetTotalEl: document.getElementById('budget-total'),
        budgetProgressBar: document.getElementById('budget-progress-bar'),
        weeklyPriceDisplay: document.getElementById('weekly-price-display'),
        reorderAssistantBtn: document.getElementById('reorder-assistant-btn'),
        reorderAssistantModal: document.getElementById('reorder-assistant-modal'),
        reorderListContainer: document.getElementById('reorder-list-container'),
        reorderForm: document.getElementById('reorder-form'),
        inventorySearchInput: document.getElementById('inventory-search-input'),
        inventoryListContainer: document.getElementById('inventory-list-container'),
        favoriteStoreSelect: document.getElementById('profile-favorite-store'),
        shoppingList: {
            generateBtn: document.getElementById('generate-weekly-shopping-list-btn'),
            clearBtn: document.getElementById('clear-shopping-list-btn'),
            confirmBtn: document.getElementById('confirm-purchase-btn'),
            totalContainer: document.getElementById('shopping-list-total-container'),
            container: document.getElementById('shopping-list-container'),
            addForm: document.getElementById('add-shopping-item-form'),
            addInput: document.getElementById('add-shopping-item-name'),
        },
        shoppingListMobile: {
            generateBtn: document.getElementById('generate-weekly-shopping-list-btn-mobile'),
            clearBtn: document.getElementById('clear-shopping-list-btn-mobile'),
            confirmBtn: document.getElementById('confirm-purchase-btn-mobile'),
            totalContainer: document.getElementById('shopping-list-total-container-mobile'),
            container: document.getElementById('shopping-list-container-mobile'),
            addForm: document.getElementById('add-shopping-item-form-mobile'),
            addInput: document.getElementById('add-shopping-item-name-mobile'),
        },
        kitchenCounter: {
            clearBtn: document.getElementById('clear-kitchen-counter-btn'),
            confirmBtn: document.getElementById('confirm-cooking-btn'),
            container: document.getElementById('kitchen-counter-container'),
        },
        kitchenCounterMobile: {
            clearBtn: document.getElementById('clear-kitchen-counter-btn-mobile'),
            confirmBtn: document.getElementById('confirm-cooking-btn-mobile'),
            container: document.getElementById('kitchen-counter-container-mobile'),
        }
    };

    /**
     * Combines inventory items and their corresponding batches into a unified data structure.
     * This function is central to the new inventory model. It calculates total stock
     * based on all active batches for each item.
     */
    function combineInventoryData() {
        if (!state.inventoryItems || !state.inventoryBatches) return;

        state.inventory = state.inventoryItems.map(item => {
            const batches = state.inventoryBatches.filter(batch => batch.itemId === item.id);
            
            let totalStock = 0;
            // The method of calculating total stock depends on the item's default unit.
            if (item.defaultUnit === 'stk') {
                totalStock = batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
            } else { // Assumes 'g' or 'ml'
                totalStock = batches.reduce((sum, b) => {
                    const batchTotalSize = (b.quantity || 0) * (b.size || 0);
                    return sum + batchTotalSize;
                }, 0);
            }

            return {
                ...item,
                batches: batches.sort((a,b) => new Date(a.expiryDate) - new Date(b.expiryDate)), // Sort batches by expiry
                totalStock: totalStock
            };
        });
    }

    /**
     * Sets up real-time Firestore listeners for all data collections.
     * @param {string} userId - The UID of the currently logged-in user.
     */
    function setupRealtimeListeners(userId) {
        if (!userId) return;

        // Clean up any existing listeners to prevent memory leaks
        Object.values(state.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());

        const commonErrorHandler = (error, context) => handleError(error, `Kunne ikke hente data for ${context}.`, `onSnapshot(${context})`);

        // Listener for inventory items
        const qItems = query(collection(db, 'inventory_items'), where("userId", "==", userId));
        state.listeners.inventoryItems = onSnapshot(qItems, (snapshot) => {
            state.inventoryItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            combineInventoryData();
            handleNavigation(window.location.hash); // Re-render current page with new data
        }, (error) => commonErrorHandler(error, 'varer'));

        // Listener for inventory batches
        const qBatches = query(collection(db, 'inventory_batches'), where("userId", "==", userId));
        state.listeners.inventoryBatches = onSnapshot(qBatches, (snapshot) => {
            state.inventoryBatches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            combineInventoryData();
            handleNavigation(window.location.hash); // Re-render current page with new data
        }, (error) => commonErrorHandler(error, 'vare-batches'));

        // Listener for recipes
        const qRecipes = query(collection(db, 'recipes'), where("userId", "==", userId));
        state.listeners.recipes = onSnapshot(qRecipes, (snapshot) => {
            state.recipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            document.getElementById('profile-recipe-count').textContent = state.recipes.length;
            document.getElementById('profile-favorite-count').textContent = state.recipes.filter(r => r.is_favorite).length;
            handleNavigation(window.location.hash);
        }, (error) => commonErrorHandler(error, 'opskrifter'));
        
        // Listeners for other parts of the app (unchanged)
        const year = state.currentDate.getFullYear();
        state.listeners.mealPlan = onSnapshot(doc(db, 'meal_plans', `plan_${year}`), (doc) => {
            state.mealPlan = doc.exists() ? doc.data() : {};
            if (document.querySelector('#meal-planner:not(.hidden)')) renderMealPlanner();
            if (document.querySelector('#overview:not(.hidden)')) renderOverviewPage();
        }, (error) => commonErrorHandler(error, 'madplan'));

        state.listeners.shoppingList = onSnapshot(doc(db, 'shopping_lists', userId), (doc) => {
            state.shoppingList = doc.exists() ? doc.data().items || {} : {};
            renderShoppingList();
        }, (error) => commonErrorHandler(error, 'indkøbsliste'));

        state.listeners.kitchenCounter = onSnapshot(doc(db, 'kitchen_counters', userId), (doc) => {
            state.kitchenCounter = doc.exists() ? doc.data().items || {} : {};
            renderKitchenCounter();
        }, (error) => commonErrorHandler(error, 'køkkenbord'));
        
        const settingsRef = doc(db, 'users', userId, 'settings', 'budget');
        state.listeners.budget = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) {
                state.budget = doc.data();
            }
            if (document.querySelector('#overview:not(.hidden)')) renderOverviewPage();
        }, (error) => commonErrorHandler(error, 'budget'));

        const preferencesRef = doc(db, 'users', userId, 'settings', 'preferences');
        state.listeners.preferences = onSnapshot(preferencesRef, (doc) => {
            if (doc.exists()) {
                state.preferences = doc.data();
            }
            if (document.querySelector('#overview:not(.hidden)')) renderOverviewPage();
        }, (error) => commonErrorHandler(error, 'præferencer'));

        const referencesRef = doc(db, 'references', userId);
        state.listeners.references = onSnapshot(referencesRef, (doc) => {
            if (doc.exists()) {
                state.references = doc.data();
                elements.addInventoryItemBtn.disabled = false;
                elements.reorderAssistantBtn.disabled = false;
                elements.addRecipeBtn.disabled = false;
                setReferencesLoaded(true);
                if (document.querySelector('#references:not(.hidden)')) renderReferencesPage();
                if (document.querySelector('#inventory:not(.hidden)')) renderInventory();
            }
        }, (error) => commonErrorHandler(error, 'referencer'));
    }

    /**
     * Callback function executed on successful user login.
     * @param {object} user - The Firebase user object.
     */
    function onLogin(user) {
        state.currentUser = user;
        document.getElementById('profile-email').textContent = user.email;
        elements.loginPage.classList.add('hidden');
        elements.appContainer.classList.remove('hidden');
        setupRealtimeListeners(user.uid); 
        
        const currentHash = window.location.hash || '#meal-planner';
        navigateTo(currentHash);
        handleNavigation(currentHash);
    }

    /**
     * Callback function executed on user logout.
     */
    function onLogout() {
        state.currentUser = null;
        elements.appContainer.classList.add('hidden');
        elements.loginPage.classList.remove('hidden');
        Object.values(state.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
        
        elements.addInventoryItemBtn.disabled = true;
        elements.reorderAssistantBtn.disabled = true;
        elements.addRecipeBtn.disabled = true;
        setReferencesLoaded(false);
    }

    /**
     * Handles routing within the app, calling the correct render function based on the URL hash.
     * @param {string} hash - The current URL hash.
     */
    function handleNavigation(hash) {
        switch(hash) {
            case '#meal-planner':
            case '':
                renderMealPlanner();
                renderShoppingList();
                renderKitchenCounter();
                break;
            case '#recipes':
                renderPageTagFilters();
                renderRecipes();
                break;
            case '#references':
                renderReferencesPage();
                break;
            case '#inventory':
                renderInventory();
                break;
            case '#overview':
                renderOverviewPage();
                break;
        }
    }

    /**
     * Main initialization function for the application.
     */
    function init() {
        elements.addInventoryItemBtn.disabled = true;
        elements.reorderAssistantBtn.disabled = true;
        elements.addRecipeBtn.disabled = true;

        initAuth(onLogin, onLogout);
        setupAuthEventListeners(elements);
        initUI(elements);
        initInventory(state, elements);
        initRecipes(state, elements);
        initShoppingList(state, elements);
        initKitchenCounter(state, elements);
        initMealPlanner(state, elements);
        initReferences(state, elements);
        initOverview(state, elements);

        window.addEventListener('hashchange', () => handleNavigation(window.location.hash));
    }

    init();
});
