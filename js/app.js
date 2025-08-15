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
import { initKitchenCounter } from './kitchenCounter.js';
import { initEvents } from './events.js';
import { initEconomyPage } from './economy.js';
// OPDATERING: Tilføjet import for det nye hjemmet modul
import { initHjemmet, renderHjemmetPage } from './hjemmet.js';

document.addEventListener('DOMContentLoaded', () => {
    // Central state object for the entire application
    const state = {
        currentUser: null,
        users: [],
        inventoryItems: [],
        inventoryBatches: [],
        inventory: [],
        recipes: [],
        assets: [],
        liabilities: [],
        economySettings: {},
        expenses: [],
        fixedExpenses: [],
        events: [],
        // OPDATERING: Tilføjet nye state arrays for Hjemmet
        plants: [],
        projects: [],
        reminders: [],
        maintenance: [],
        home_inventory: [],
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
        activeRecipeFilterTags: new Set(),
        currentDate: new Date(),
        currentlyViewedRecipeId: null,
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
        
        // Inventory
        inventoryItemModal: document.getElementById('inventory-item-modal'),
        inventoryItemForm: document.getElementById('inventory-item-form'),
        addInventoryItemBtn: document.getElementById('add-inventory-item-btn'),
        inventoryModalTitle: document.getElementById('inventory-item-modal-title'),
        reorderAssistantBtn: document.getElementById('reorder-assistant-btn'),
        reorderAssistantModal: document.getElementById('reorder-assistant-modal'),
        reorderListContainer: document.getElementById('reorder-list-container'),
        reorderForm: document.getElementById('reorder-form'),
        inventorySearchInput: document.getElementById('inventory-search-input'),
        inventoryListContainer: document.getElementById('inventory-list-container'),
        clearInventoryFiltersBtn: document.getElementById('clear-inventory-filters-btn'),
        inventoryFilterMainCategory: document.getElementById('inventory-filter-main-category'),
        inventoryFilterSubCategory: document.getElementById('inventory-filter-sub-category'),
        inventoryFilterStockStatus: document.getElementById('inventory-filter-stock-status'),
        impulsePurchaseBtn: document.getElementById('impulse-purchase-btn'),
        impulsePurchaseModal: document.getElementById('impulse-purchase-modal'),
        impulsePurchaseForm: document.getElementById('impulse-purchase-form'),

        // Recipes
        recipeEditModal: document.getElementById('recipe-edit-modal'),
        recipeForm: document.getElementById('recipe-form'),
        addRecipeBtn: document.getElementById('add-recipe-btn'),
        recipeEditModalTitle: document.getElementById('recipe-edit-modal-title'),
        recipeGrid: document.querySelector('#recipes .recipe-grid'),
        ingredientsContainer: document.getElementById('ingredients-container'),
        addIngredientBtn: document.getElementById('add-ingredient-btn'),
        recipeImportTextarea: document.getElementById('recipe-import-textarea'),
        importRecipeBtn: document.getElementById('import-recipe-btn'),
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

        // Calendar
        calendarGrid: document.getElementById('calendar-grid'),
        calendarTitle: document.getElementById('calendar-title'),
        prevPeriodBtn: document.getElementById('prev-period-btn'),
        nextPeriodBtn: document.getElementById('next-period-btn'),
        weekViewBtn: document.getElementById('week-view-btn'),
        monthViewBtn: document.getElementById('month-view-btn'),
        calendarWeekView: document.getElementById('calendar-week-view'),
        calendarMonthView: document.getElementById('calendar-month-grid'),
        calendarWeekHeader: document.querySelector('.calendar-week-header'),
        calendarMonthGrid: document.getElementById('calendar-month-grid'),
        clearMealPlanBtn: document.getElementById('clear-meal-plan-btn'),
        generateGroceriesBtn: document.getElementById('generate-groceries-btn'),
        
        // Modals related to calendar
        planMealModal: document.getElementById('plan-meal-modal'),
        planMealForm: document.getElementById('plan-meal-form'),
        planMealModalTitle: document.getElementById('plan-meal-modal-title'),
        mealTypeSelector: document.querySelector('#plan-meal-form .meal-type-selector'),
        addCalendarEventModal: document.getElementById('add-calendar-event-modal'),
        calendarEventModalTitle: document.getElementById('calendar-event-modal-title'),
        calendarEventViewChooser: document.getElementById('calendar-event-view-chooser'),
        calendarEventViews: document.querySelectorAll('.calendar-event-view'),
        calendarRecipeSearch: document.getElementById('calendar-recipe-search'),
        calendarRecipeList: document.getElementById('calendar-recipe-list'),
        calendarProjectList: document.getElementById('calendar-project-list'),
        calendarTaskSearch: document.getElementById('calendar-task-search'),
        calendarTaskList: document.getElementById('calendar-task-list'),
        calendarTaskForm: document.getElementById('calendar-task-form'),
        dayDetailsModal: document.getElementById('day-details-modal'),
        dayDetailsTitle: document.getElementById('day-details-title'),
        dayDetailsContent: document.getElementById('day-details-content'),

        // References
        referencesContainer: document.getElementById('references-container'),
        householdMembersList: document.getElementById('household-members-list'),

        // Mobile
        mobileTabBar: document.getElementById('mobile-tab-bar'),
        mobileTabLinks: document.querySelectorAll('.mobile-tab-link'),

        // Modals
        notificationModal: document.getElementById('notification-modal'),
        notificationTitle: document.getElementById('notification-title'),
        notificationMessage: document.getElementById('notification-message'),
        notificationActions: document.getElementById('notification-actions'),
        shoppingListModal: document.getElementById('shopping-list-modal'),
        shoppingListModalTitle: document.getElementById('shopping-list-modal-title'),
        shoppingListModalContentWrapper: document.getElementById('shopping-list-modal-content-wrapper'),
        eventForm: document.getElementById('event-form'),

        addExpenseBtn: document.querySelector('[data-action="add-expense"]'),
    };

    function computeDerivedShoppingLists() {
        state.shoppingLists.materials = {};
        state.shoppingLists.wishlist = {};
    }


    function combineInventoryData() {
        if (!state.inventoryItems || !state.inventoryBatches) return;
        state.inventory = state.inventoryItems.map(item => {
            const batches = state.inventoryBatches.filter(batch => batch.itemId === item.id);
            let totalStock = 0;
            if (item.defaultUnit === 'stk') {
                totalStock = batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
            } else {
                totalStock = batches.reduce((sum, b) => sum + ((b.quantity || 0) * (b.size || 0)), 0);
            }
            return { ...item, batches: batches.sort((a,b) => new Date(a.expiryDate) - new Date(b.expiryDate)), totalStock };
        });
    }

    function renderCurrentPage() {
        const hash = window.location.hash || '#dashboard';
        const [mainHash] = hash.split('/');
        
        switch(mainHash) {
            case '#dashboard':
                renderDashboardPage();
                break;
            case '#calendar':
                renderMealPlanner();
                break;
            case '#hjem':
                // OPDATERING: Kalder den nye render-funktion for Hjemmet
                renderHjemmetPage();
                break;
            case '#recipes':
                renderPageTagFilters();
                renderRecipes();
                break;
            case '#inventory':
                renderInventory();
                break;
            case '#oekonomi':
                initEconomyPage(state);
                break;
            case '#references':
                renderReferencesPage();
                break;
        }
    }

    function setupRealtimeListeners(userId) {
        if (!userId) return;
        Object.values(state.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
        const commonErrorHandler = (error, context) => handleError(error, `Kunne ikke hente data for ${context}.`, `onSnapshot(${context})`);
        
        const collections = {
            inventory_items: 'inventoryItems',
            inventory_batches: 'inventoryBatches',
            recipes: 'recipes',
            events: 'events',
            expenses: 'expenses',
            fixed_expenses: 'fixedExpenses',
            assets: 'assets',
            liabilities: 'liabilities',
            // OPDATERING: Tilføjet listeners for de nye collections
            plants: 'plants',
            projects: 'projects'
        };

        for (const [coll, stateKey] of Object.entries(collections)) {
            const q = query(collection(db, coll), where("userId", "==", userId));
            state.listeners[stateKey] = onSnapshot(q, (snapshot) => {
                state[stateKey] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                if (stateKey === 'inventoryItems' || stateKey === 'inventoryBatches') {
                    combineInventoryData();
                }
                computeDerivedShoppingLists();
                renderCurrentPage();
            }, (error) => commonErrorHandler(error, coll));
        }

        const userSpecificDocs = {
            shopping_lists: 'shoppingLists',
            references: 'references',
            meal_plans: 'mealPlan' 
        };

        for (const [coll, stateKey] of Object.entries(userSpecificDocs)) {
            state.listeners[stateKey] = onSnapshot(doc(db, coll, userId), (doc) => {
                const data = doc.exists() ? doc.data() : {};
                
                if (stateKey === 'shoppingLists') {
                    state.shoppingLists.groceries = data.groceries || {};
                } else if (stateKey === 'mealPlan') {
                    const { userId, ...planData } = data;
                    state.mealPlan = planData;
                } else {
                    state[stateKey] = data;
                }
                
                if (stateKey === 'references') {
                     const buttonsToEnable = [
                        elements.addInventoryItemBtn, 
                        elements.reorderAssistantBtn, 
                        elements.addRecipeBtn, 
                        elements.generateGroceriesBtn, 
                        elements.impulsePurchaseBtn,
                        elements.addExpenseBtn
                    ];
                     buttonsToEnable.forEach(btn => { if (btn) btn.disabled = false; });
                     setReferencesLoaded(true);
                }
                renderCurrentPage();
            }, (error) => commonErrorHandler(error, coll));
        }
        
        const economySettingsRef = doc(db, 'users', userId, 'settings', 'economy');
        state.listeners.economySettings = onSnapshot(economySettingsRef, (doc) => {
            state.economySettings = doc.exists() ? doc.data() : {};
            renderCurrentPage();
        }, (error) => commonErrorHandler(error, 'economySettings'));
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
        
        const buttonsToDisable = [
            elements.addInventoryItemBtn, 
            elements.reorderAssistantBtn, 
            elements.addRecipeBtn, 
            elements.generateGroceriesBtn, 
            elements.impulsePurchaseBtn,
            elements.addExpenseBtn
        ];
        buttonsToDisable.forEach(btn => { if (btn) btn.disabled = true; });
        setReferencesLoaded(false);
    }

    function handleNavigation(hash) {
        try {
            const mainHash = hash.split('/')[0];
            
            const validHashes = ['#dashboard', '#calendar', '#hjem', '#recipes', '#inventory', '#oekonomi', '#references'];
            const currentHash = validHashes.includes(mainHash) ? mainHash : '#dashboard';
            
            navigateTo(currentHash);
            renderCurrentPage();
        } catch (error) {
            console.error("Fejl under navigation:", error);
            handleError(error, "Der opstod en fejl under navigation.");
        }
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
        initEvents(state);
        initEconomyPage(state);
        // OPDATERING: Kalder den nye init-funktion for Hjemmet
        initHjemmet(state, elements);
    }

    init();
});
