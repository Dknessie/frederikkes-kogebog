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
        shoppingList: {},
        kitchenCounter: {},
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
        
        // Hjem Page elements
        hjemNavTabs: document.querySelector('.hjem-nav-tabs'),
        hjemSubpages: document.querySelectorAll('.hjem-subpage'),

        // Room elements
        roomsGrid: document.getElementById('rooms-grid'),
        addRoomBtn: document.getElementById('add-room-btn'),
        roomEditModal: document.getElementById('room-edit-modal'),
        roomForm: document.getElementById('room-form'),
        roomDetailsPage: document.getElementById('room-details'),
        roomDetailsContent: document.getElementById('room-details-content'),
        roomDetailsTitle: document.getElementById('room-details-title'),
        editRoomBtn: document.getElementById('edit-room-btn'),

        // Project elements
        projectEditModal: document.getElementById('project-edit-modal'),
        projectForm: document.getElementById('project-form'),
        addProjectBtn: document.getElementById('add-project-btn'),
        projectsGrid: document.getElementById('projects-grid'),
        projectMaterialsContainer: document.getElementById('project-materials-container'),
        addMaterialBtn: document.getElementById('add-material-btn'),

        // Dashboard elements
        profileEmail: document.getElementById('profile-email'),
        favoriteStoreSelect: document.getElementById('profile-favorite-store'),
        editBudgetBtn: document.getElementById('edit-budget-btn'),
        budgetSpentEl: document.getElementById('budget-spent'),
        budgetTotalEl: document.getElementById('budget-total'),
        budgetProgressBar: document.getElementById('budget-progress-bar'),
        expiringItemsList: document.getElementById('expiring-items-list'),
        inventorySummaryList: document.getElementById('inventory-summary-list'),

        // Existing elements
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
        mobileKitchenCounterPanel: document.getElementById('mobile-kitchen-counter-panel'),
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

    function combineInventoryData() {
        if (!state.inventoryItems || !state.inventoryBatches) return;

        state.inventory = state.inventoryItems.map(item => {
            const batches = state.inventoryBatches.filter(batch => batch.itemId === item.id);
            
            let totalStock = 0;
            if (item.defaultUnit === 'stk') {
                totalStock = batches.reduce((sum, b) => sum + (b.quantity || 0), 0);
            } else {
                totalStock = batches.reduce((sum, b) => {
                    const batchTotalSize = (b.quantity || 0) * (b.size || 0);
                    return sum + batchTotalSize;
                }, 0);
            }

            return {
                ...item,
                batches: batches.sort((a,b) => new Date(a.expiryDate) - new Date(b.expiryDate)),
                totalStock: totalStock
            };
        });
    }

    function setupRealtimeListeners(userId) {
        if (!userId) return;

        Object.values(state.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());

        const commonErrorHandler = (error, context) => handleError(error, `Kunne ikke hente data for ${context}.`, `onSnapshot(${context})`);

        const qItems = query(collection(db, 'inventory_items'), where("userId", "==", userId));
        state.listeners.inventoryItems = onSnapshot(qItems, (snapshot) => {
            state.inventoryItems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            combineInventoryData();
            handleNavigation(window.location.hash);
        }, (error) => commonErrorHandler(error, 'varer'));

        const qBatches = query(collection(db, 'inventory_batches'), where("userId", "==", userId));
        state.listeners.inventoryBatches = onSnapshot(qBatches, (snapshot) => {
            state.inventoryBatches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            combineInventoryData();
            handleNavigation(window.location.hash);
        }, (error) => commonErrorHandler(error, 'vare-batches'));

        const qRecipes = query(collection(db, 'recipes'), where("userId", "==", userId));
        state.listeners.recipes = onSnapshot(qRecipes, (snapshot) => {
            state.recipes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            handleNavigation(window.location.hash);
        }, (error) => commonErrorHandler(error, 'opskrifter'));
        
        const qProjects = query(collection(db, 'projects'), where("userId", "==", userId));
        state.listeners.projects = onSnapshot(qProjects, (snapshot) => {
            state.projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            handleNavigation(window.location.hash);
        }, (error) => commonErrorHandler(error, 'projekter'));

        const qRooms = query(collection(db, 'rooms'), where("userId", "==", userId));
        state.listeners.rooms = onSnapshot(qRooms, (snapshot) => {
            state.rooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            handleNavigation(window.location.hash);
        }, (error) => commonErrorHandler(error, 'rum'));

        const year = state.currentDate.getFullYear();
        state.listeners.mealPlan = onSnapshot(doc(db, 'meal_plans', `plan_${year}`), (doc) => {
            state.mealPlan = doc.exists() ? doc.data() : {};
            if (document.querySelector('#calendar:not(.hidden)')) renderMealPlanner();
            if (document.querySelector('#dashboard:not(.hidden)')) renderDashboardPage();
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
            if (document.querySelector('#dashboard:not(.hidden)')) renderDashboardPage();
        }, (error) => commonErrorHandler(error, 'budget'));

        const preferencesRef = doc(db, 'users', userId, 'settings', 'preferences');
        state.listeners.preferences = onSnapshot(preferencesRef, (doc) => {
            if (doc.exists()) {
                state.preferences = doc.data();
            }
            if (document.querySelector('#dashboard:not(.hidden)')) renderDashboardPage();
        }, (error) => commonErrorHandler(error, 'præferencer'));

        const referencesRef = doc(db, 'references', userId);
        state.listeners.references = onSnapshot(referencesRef, (doc) => {
            if (doc.exists()) {
                state.references = doc.data();
                elements.addInventoryItemBtn.disabled = false;
                elements.reorderAssistantBtn.disabled = false;
                elements.addRecipeBtn.disabled = false;
                elements.addProjectBtn.disabled = false;
                elements.addRoomBtn.disabled = false;
                setReferencesLoaded(true);
                if (document.querySelector('#references:not(.hidden)')) renderReferencesPage();
                if (document.querySelector('#inventory:not(.hidden)')) renderInventory();
            }
        }, (error) => commonErrorHandler(error, 'referencer'));
    }

    function onLogin(user) {
        state.currentUser = user;
        elements.loginPage.classList.add('hidden');
        elements.appContainer.classList.remove('hidden');
        setupRealtimeListeners(user.uid); 
        
        const currentHash = window.location.hash || '#dashboard';
        handleNavigation(currentHash);
    }

    function onLogout() {
        state.currentUser = null;
        elements.appContainer.classList.add('hidden');
        elements.loginPage.classList.remove('hidden');
        Object.values(state.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
        
        elements.addInventoryItemBtn.disabled = true;
        elements.reorderAssistantBtn.disabled = true;
        elements.addRecipeBtn.disabled = true;
        elements.addProjectBtn.disabled = true;
        elements.addRoomBtn.disabled = true;
        setReferencesLoaded(false);
    }

    function handleNavigation(hash) {
        const [mainHash, subId] = hash.split('/');
        state.currentlyViewedRoomId = subId || null;

        const validHashes = ['#dashboard', '#calendar', '#hjem', '#room-details', '#recipes', '#inventory', '#references'];
        const currentHash = validHashes.includes(mainHash) ? mainHash : '#dashboard';
        navigateTo(currentHash);

        switch(currentHash) {
            case '#dashboard':
                renderDashboardPage();
                renderShoppingList();
                renderKitchenCounter();
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
    }

    function init() {
        elements.addInventoryItemBtn.disabled = true;
        elements.reorderAssistantBtn.disabled = true;
        elements.addRecipeBtn.disabled = true;
        elements.addProjectBtn.disabled = true;
        elements.addRoomBtn.disabled = true;

        initAuth(onLogin, onLogout);
        setupAuthEventListeners(elements);
        initUI(state, elements);
        initInventory(state, elements);
        initRecipes(state, elements);
        initShoppingList(state, elements);
        initKitchenCounter(state, elements);
        initMealPlanner(state, elements);
        initReferences(state, elements);
        initDashboard(state, elements);
        initProjects(state, elements);
        initRooms(state, elements);

        window.addEventListener('hashchange', () => handleNavigation(window.location.hash));
        handleNavigation(window.location.hash); // Initial load
    }

    init();
});
