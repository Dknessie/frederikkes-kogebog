// js/app.js

import { db } from './firebase.js';
import { collection, onSnapshot, doc, where, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { initAuth, setupAuthEventListeners } from './auth.js';
import { initUI, navigateTo, handleError } from './ui.js';
import { initInventory, renderInventory, setReferencesLoaded } from './inventory.js';
import { initRecipes, renderRecipes, renderPageTagFilters } from './recipes.js';
import { initMealPlanner, renderMealPlanner } from './mealPlanner.js';
import { initShoppingList, renderShoppingListWidgets } from './shoppingList.js';
import { initReferences, renderReferencesPage } from './references.js';
import { initDashboard, renderDashboardPage } from './dashboard.js';
import { initProjects, renderProjects } from './projects.js';
import { initRooms, renderRoomsListPage, renderRoomDetailsPage } from './rooms.js';

document.addEventListener('DOMContentLoaded', () => {
    // Central state object for the entire application
    const state = {
        currentUser: null,
        inventoryItems: [],
        inventoryBatches: [],
        inventory: [],
        recipes: [],
        projects: [],
        rooms: [],
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
        logoutButtons: [document.getElementById('logout-btn-header'), document.getElementById('logout-btn-profile')],
        navLinks: document.querySelectorAll('.desktop-nav .nav-link'),
        pages: document.querySelectorAll('#app-main-content .page'),
        headerTitleLink: document.querySelector('.header-title-link'),
        
        hjemNavTabs: document.querySelector('.hjem-nav-tabs'),
        hjemSubpages: document.querySelectorAll('.hjem-subpage'),

        roomsGrid: document.getElementById('rooms-grid'),
        addRoomBtn: document.getElementById('add-room-btn'),
        roomEditModal: document.getElementById('room-edit-modal'),
        roomForm: document.getElementById('room-form'),
        roomDetailsPage: document.getElementById('room-details'),
        roomDetailsContent: document.getElementById('room-details-content'),
        roomDetailsTitle: document.getElementById('room-details-title'),
        editRoomBtn: document.getElementById('edit-room-btn'),

        projectEditModal: document.getElementById('project-edit-modal'),
        projectForm: document.getElementById('project-form'),
        addProjectBtn: document.getElementById('add-project-btn'),
        projectsGrid: document.getElementById('projects-grid'),
        projectMaterialsContainer: document.getElementById('project-materials-container'),
        addMaterialBtn: document.getElementById('add-material-btn'),

        profileEmail: document.getElementById('profile-email'),
        favoriteStoreSelect: document.getElementById('profile-favorite-store'),
        editBudgetBtn: document.getElementById('edit-budget-btn'),
        budgetSpentEl: document.getElementById('budget-spent'),
        budgetTotalEl: document.getElementById('budget-total'),
        budgetProgressBar: document.getElementById('budget-progress-bar'),
        expiringItemsList: document.getElementById('expiring-items-list'),
        inventorySummaryList: document.getElementById('inventory-summary-list'),

        inventoryItemModal: document.getElementById('inventory-item-modal'),
        inventoryItemForm: document.getElementById('inventory-item-form'),
        addInventoryItemBtn: document.getElementById('add-inventory-item-btn'),
        inventoryModalTitle: document.getElementById('inventory-item-modal-title'),
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
        calendarGrid: document.getElementById('calendar-grid'),
        calendarTitle: document.getElementById('calendar-title'),
        prevWeekBtn: document.getElementById('prev-week-btn'),
        nextWeekBtn: document.getElementById('next-week-btn'),
        clearMealPlanBtn: document.getElementById('clear-meal-plan-btn'),
        generateGroceriesBtn: document.getElementById('generate-groceries-btn'),
        weeklyPriceDisplay: document.getElementById('weekly-price-display'),
        planMealModal: document.getElementById('plan-meal-modal'),
        planMealForm: document.getElementById('plan-meal-form'),
        planMealModalTitle: document.getElementById('plan-meal-modal-title'),
        mealTypeSelector: document.querySelector('#plan-meal-modal .meal-type-selector'),
        referencesContainer: document.getElementById('references-container'),
        mobileTabBar: document.getElementById('mobile-tab-bar'),
        mobileTabLinks: document.querySelectorAll('.mobile-tab-link'),
        mobilePanelOverlay: document.getElementById('mobile-panel-overlay'),
        mobileShoppingListPanel: document.getElementById('mobile-shopping-list-panel'),
        notificationModal: document.getElementById('notification-modal'),
        notificationTitle: document.getElementById('notification-title'),
        notificationMessage: document.getElementById('notification-message'),
        notificationActions: document.getElementById('notification-actions'),
        editBudgetModal: document.getElementById('edit-budget-modal'),
        editBudgetForm: document.getElementById('edit-budget-form'),
        monthlyBudgetInput: document.getElementById('monthly-budget-input'),
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
    };

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

    function setupRealtimeListeners(userId) {
        if (!userId) return;
        Object.values(state.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
        const commonErrorHandler = (error, context) => handleError(error, `Kunne ikke hente data for ${context}.`, `onSnapshot(${context})`);
        
        const collections = {
            inventory_items: 'inventoryItems',
            inventory_batches: 'inventoryBatches',
            recipes: 'recipes',
            projects: 'projects',
            rooms: 'rooms'
        };

        for (const [coll, stateKey] of Object.entries(collections)) {
            const q = query(collection(db, coll), where("userId", "==", userId));
            state.listeners[stateKey] = onSnapshot(q, (snapshot) => {
                state[stateKey] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                if (stateKey === 'inventoryItems' || stateKey === 'inventoryBatches') {
                    combineInventoryData();
                }
                handleNavigation(window.location.hash);
            }, (error) => commonErrorHandler(error, coll));
        }
        
        const year = state.currentDate.getFullYear();
        state.listeners.mealPlan = onSnapshot(doc(db, 'meal_plans', `plan_${year}`), (doc) => {
            state.mealPlan = doc.exists() ? doc.data() : {};
            handleNavigation(window.location.hash);
        }, (error) => commonErrorHandler(error, 'madplan'));

        state.listeners.shoppingLists = onSnapshot(doc(db, 'shopping_lists', userId), (doc) => {
            const data = doc.exists() ? doc.data() : {};
            state.shoppingLists = {
                groceries: data.groceries || {},
                materials: data.materials || {},
                wishlist: data.wishlist || {}
            };
            renderShoppingListWidgets();
        }, (error) => commonErrorHandler(error, 'indkøbslister'));
        
        const settingsRef = doc(db, 'users', userId, 'settings', 'budget');
        state.listeners.budget = onSnapshot(settingsRef, (doc) => {
            state.budget = doc.exists() ? doc.data() : { monthlyAmount: 4000 };
            handleNavigation(window.location.hash);
        }, (error) => commonErrorHandler(error, 'budget'));

        const preferencesRef = doc(db, 'users', userId, 'settings', 'preferences');
        state.listeners.preferences = onSnapshot(preferencesRef, (doc) => {
            state.preferences = doc.exists() ? doc.data() : {};
            handleNavigation(window.location.hash);
        }, (error) => commonErrorHandler(error, 'præferencer'));

        const referencesRef = doc(db, 'references', userId);
        state.listeners.references = onSnapshot(referencesRef, (doc) => {
            if (doc.exists()) {
                state.references = doc.data();
                const buttonsToEnable = [elements.addInventoryItemBtn, elements.reorderAssistantBtn, elements.addRecipeBtn, elements.addProjectBtn, elements.addRoomBtn];
                buttonsToEnable.forEach(btn => { if (btn) btn.disabled = false; });
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
        state.currentUser = null;
        elements.appContainer.classList.add('hidden');
        elements.loginPage.classList.remove('hidden');
        Object.values(state.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
        
        const buttonsToDisable = [elements.addInventoryItemBtn, elements.reorderAssistantBtn, elements.addRecipeBtn, elements.addProjectBtn, elements.addRoomBtn];
        buttonsToDisable.forEach(btn => { if (btn) btn.disabled = true; });
        setReferencesLoaded(false);
    }

    function handleNavigation(hash) {
        try {
            const [mainHash, subId] = hash.split('/');
            state.currentlyViewedRoomId = subId || null;

            const validHashes = ['#dashboard', '#calendar', '#hjem', '#room-details', '#recipes', '#inventory', '#references'];
            const currentHash = validHashes.includes(mainHash) ? mainHash : '#dashboard';
            
            navigateTo(currentHash);

            switch(currentHash) {
                case '#dashboard':
                    renderDashboardPage();
                    renderShoppingListWidgets();
                    break;
                case '#calendar':
                    renderMealPlanner();
                    break;
                case '#hjem':
                    renderRoomsListPage();
                    renderProjects();
                    break;
                case '#room-details':
                    if (state.currentlyViewedRoomId) {
                        renderRoomDetailsPage();
                    } else {
                        window.location.hash = '#hjem';
                    }
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
        const buttonsToDisable = [elements.addInventoryItemBtn, elements.reorderAssistantBtn, elements.addRecipeBtn, elements.addProjectBtn, elements.addRoomBtn];
        buttonsToDisable.forEach(btn => { if (btn) btn.disabled = true; });

        initUI(state, elements);
        initInventory(state, elements);
        initRecipes(state, elements);
        initShoppingList(state, elements);
        // initKitchenCounter(state, elements); // Temporarily removed
        initMealPlanner(state, elements);
        initReferences(state, elements);
        initDashboard(state, elements);
        initProjects(state, elements);
        initRooms(state, elements);
        setupAuthEventListeners(elements);
        
        initAuth(onLogin, onLogout);
    }

    init();
});
