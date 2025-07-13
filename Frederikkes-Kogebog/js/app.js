// js/app.js

// This is the main entry point for the application.
// It initializes all modules and manages the central state and data listeners.

// Firebase services
import { db } from './firebase.js';
import { collection, onSnapshot, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// App Modules
import { initAuth, setupAuthEventListeners } from './auth.js';
import { initUI, navigateTo, handleError } from './ui.js';
import { initInventory, renderInventory, renderInventorySummary } from './inventory.js';
import { initRecipes, renderRecipes, renderPageTagFilters } from './recipes.js';
import { initMealPlanner, renderMealPlanner } from './mealPlanner.js';
import { initShoppingList, renderShoppingList } from './shoppingList.js';
import { initKitchenCounter, renderKitchenCounter } from './kitchenCounter.js';
import { initReferences, renderReferencesPage } from './references.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Global State ---
    const state = {
        currentUser: null,
        inventory: [],
        recipes: [],
        references: {},
        mealPlan: {},
        shoppingList: {},
        kitchenCounter: {}, 
        activeRecipeFilterTags: new Set(),
        currentDate: new Date(),
        currentlyViewedRecipeId: null,
        recipeFormImage: { type: null, data: null },
        listeners: {} // To hold Firestore unsubscribers
    };

    // --- DOM Element Cache ---
    // Caching all elements here once for performance and easy access.
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
        inventoryModalTitle: document.getElementById('inventory-modal-title'),
        inventoryTableBody: document.querySelector('.inventory-table tbody'),
        buyWholeCheckbox: document.getElementById('item-buy-whole'),
        buyWholeOptions: document.getElementById('buy-whole-options'),
        recipeEditModal: document.getElementById('recipe-edit-modal'),
        recipeForm: document.getElementById('recipe-form'),
        addRecipeBtn: document.getElementById('add-recipe-btn'),
        recipeEditModalTitle: document.getElementById('recipe-edit-modal-title'),
        recipeGrid: document.querySelector('.recipe-grid'),
        ingredientsContainer: document.getElementById('ingredients-container'),
        addIngredientBtn: document.getElementById('add-ingredient-btn'),
        importIngredientsBtn: document.getElementById('import-ingredients-btn'),
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
        autogenPlanBtn: document.getElementById('autogen-plan-btn'),
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
        autogenModal: document.getElementById('autogen-modal'),
        autogenForm: document.getElementById('autogen-form'),
        autogenDietTagsContainer: document.getElementById('autogen-diet-tags'),
        notificationModal: document.getElementById('notification-modal'),
        notificationTitle: document.getElementById('notification-title'),
        notificationMessage: document.getElementById('notification-message'),
        notificationActions: document.getElementById('notification-actions'),
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
     * Sets up real-time data listeners from Firestore.
     * @param {string} userId - The current user's ID.
     */
    function setupRealtimeListeners(userId) {
        if (!userId) return;

        Object.values(state.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());

        const commonErrorHandler = (error, context) => handleError(error, `Kunne ikke hente data for ${context}.`, `onSnapshot(${context})`);

        state.listeners.inventory = onSnapshot(collection(db, 'inventory_items'), (snapshot) => {
            state.inventory = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            handleNavigation(window.location.hash);
        }, (error) => commonErrorHandler(error, 'varelager'));

        state.listeners.recipes = onSnapshot(collection(db, 'recipes'), (snapshot) => {
            state.recipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            document.getElementById('profile-recipe-count').textContent = state.recipes.length;
            document.getElementById('profile-favorite-count').textContent = state.recipes.filter(r => r.is_favorite).length;
            handleNavigation(window.location.hash);
        }, (error) => commonErrorHandler(error, 'opskrifter'));
        
        const year = state.currentDate.getFullYear();
        state.listeners.mealPlan = onSnapshot(doc(db, 'meal_plans', `plan_${year}`), (doc) => {
            state.mealPlan = doc.exists() ? doc.data() : {};
            if (document.querySelector('#meal-planner:not(.hidden)')) renderMealPlanner();
        }, (error) => commonErrorHandler(error, 'madplan'));

        state.listeners.shoppingList = onSnapshot(doc(db, 'shopping_lists', userId), (doc) => {
            state.shoppingList = doc.exists() ? doc.data().items || {} : {};
            renderShoppingList();
        }, (error) => commonErrorHandler(error, 'indkøbsliste'));

        state.listeners.kitchenCounter = onSnapshot(doc(db, 'kitchen_counters', userId), (doc) => {
            state.kitchenCounter = doc.exists() ? doc.data().items || {} : {};
            renderKitchenCounter();
        }, (error) => commonErrorHandler(error, 'køkkenbord'));
        
        state.listeners.references = onSnapshot(doc(db, 'references', userId), (doc) => {
            if (doc.exists()) {
                state.references = doc.data();
            } else {
                const defaultReferences = {
                    itemCategories: ['Frugt & Grønt', 'Kød & Fisk', 'Mejeri', 'Kolonial', 'Frost'],
                    itemLocations: ['Køleskab', 'Fryser', 'Skab']
                };
                setDoc(doc(db, 'references', userId), defaultReferences).catch(e => handleError(e, "Kunne ikke oprette standard referencer.", "setDoc(references)"));
            }
            if (document.querySelector('#references:not(.hidden)')) renderReferencesPage();
        }, (error) => commonErrorHandler(error, 'referencer'));
    }

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

    function onLogout() {
        state.currentUser = null;
        elements.appContainer.classList.add('hidden');
        elements.loginPage.classList.remove('hidden');
        Object.values(state.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
    }

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
                renderInventorySummary();
                break;
        }
    }

    // --- App Initialization ---
    function init() {
        initAuth(onLogin, onLogout);
        setupAuthEventListeners(elements);
        initUI(elements);
        initInventory(state, elements);
        initRecipes(state, elements);
        initShoppingList(state, elements);
        initKitchenCounter(state, elements);
        initMealPlanner(state, elements);
        initReferences(state, elements);

        window.addEventListener('hashchange', () => handleNavigation(window.location.hash));
    }

    init();
});
