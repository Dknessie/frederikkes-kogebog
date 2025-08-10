// js/app.js

import { db } from './firebase.js';
import { collection, onSnapshot, doc, where, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { initAuth, setupAuthEventListeners } from './auth.js';
import { initUI, navigateTo, handleError } from './ui.js';
import { initInventory, renderInventory, setReferencesLoaded } from './inventory.js';
import { initRecipes, renderRecipes, renderPageTagFilters } from './recipes.js';
import { initMealPlanner, renderMealPlanner } from './mealPlanner.js';
import { initShoppingList } from './shoppingList.js';
import { initReferences, renderReferencesPage, renderHouseholdMembers } from './references.js';
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
        fixedExpenses: [],
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
        
        // Dashboard
        editBudgetBtn: document.getElementById('edit-budget-btn'),
        budgetSpentEl: document.getElementById('budget-spent'),
        budgetTotalEl: document.getElementById('budget-total'),

        // Hjem
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
        addHouseholdMemberBtn: document.getElementById('add-household-member-btn'),
        householdMembersList: document.getElementById('household-members-list'),

        // Mobile
        mobileTabBar: document.getElementById('mobile-tab-bar'),
        mobileTabLinks: document.querySelectorAll('.mobile-tab-link'),

        // Modals
        notificationModal: document.getElementById('notification-modal'),
        notificationTitle: document.getElementById('notification-title'),
        notificationMessage: document.getElementById('notification-message'),
        notificationActions: document.getElementById('notification-actions'),
        editBudgetModal: document.getElementById('edit-budget-modal'),
        editBudgetForm: document.getElementById('edit-budget-form'),
        monthlyBudgetInput: document.getElementById('monthly-budget-input'),
        shoppingListModal: document.getElementById('shopping-list-modal'),
        shoppingListModalTitle: document.getElementById('shopping-list-modal-title'),
        shoppingListModalContentWrapper: document.getElementById('shopping-list-modal-content-wrapper'),
        eventForm: document.getElementById('event-form'),
        
        // NEW: Budget Page
        budgetGridContainer: document.getElementById('budget-grid-container'),
        budgetYearDisplay: document.getElementById('budget-year-display'),
        prevYearBtn: document.getElementById('prev-year-btn'),
        nextYearBtn: document.getElementById('next-year-btn'),
        addExpenseModal: document.getElementById('add-expense-modal'),
        addExpenseForm: document.getElementById('add-expense-form'),
        
        // NEW: References page elements
        addHouseholdMemberBtn: document.getElementById('add-household-member-btn'),
        householdMembersList: document.getElementById('household-members-list'),
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
                    storeId: 'Byggemarked'
                };
            });
        });
        state.shoppingLists.materials = materialsList;

        // Compute wishlist from rooms
        const wishlist = {};
        state.rooms.forEach(room => {
            (room.wishlist || []).forEach(item => {
                const key = item.name.toLowerCase();
                wishlist[key] = {
                    name: item.name,
                    price: item.price || null,
                    url: item.url || null,
                    roomId: room.id,
                    quantity_to_buy: 1,
                    unit: 'stk'
                };
            });
        });
        state.shoppingLists.wishlist = wishlist;
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

    function setupRealtimeListeners(userId) {
        if (!userId) return;
        Object.values(state.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
        const commonErrorHandler = (error, context) => handleError(error, `Kunne ikke hente data for ${context}.`, `onSnapshot(${context})`);
        
        // NEW: Separate listener for users to ensure it loads first.
        const usersQuery = query(collection(db, 'users'));
        state.listeners.users = onSnapshot(usersQuery, (snapshot) => {
            state.users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Call the remaining listeners after users are loaded
            const householdMembers = state.users.length > 0 ? state.users.map(u => u.id) : [userId];
            
            const expensesQuery = query(collection(db, 'expenses'), where("userId", "in", householdMembers));
            state.listeners.expenses = onSnapshot(expensesQuery, (expensesSnapshot) => {
                state.expenses = expensesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                handleNavigation(window.location.hash);
            }, (error) => commonErrorHandler(error, 'expenses'));
            
            const fixedExpensesQuery = query(collection(db, 'fixed_expenses'), where("userId", "in", householdMembers));
            state.listeners.fixedExpenses = onSnapshot(fixedExpensesQuery, (fixedExpensesSnapshot) => {
                state.fixedExpenses = fixedExpensesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                handleNavigation(window.location.hash);
            }, (error) => commonErrorHandler(error, 'fixed_expenses'));
            
            const collections = {
                inventory_items: 'inventoryItems',
                inventory_batches: 'inventoryBatches',
                recipes: 'recipes',
                projects: 'projects',
                rooms: 'rooms',
                maintenance_logs: 'maintenanceLogs',
                events: 'events'
            };

            for (const [coll, stateKey] of Object.entries(collections)) {
                const q = query(collection(db, coll), where("userId", "==", userId));
                state.listeners[stateKey] = onSnapshot(q, (snapshot) => {
                    state[stateKey] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    
                    if (stateKey === 'inventoryItems' || stateKey === 'inventoryBatches') {
                        combineInventoryData();
                    }
                    if (stateKey === 'projects' || stateKey === 'rooms') {
                        computeDerivedShoppingLists();
                    }

                    handleNavigation(window.location.hash);
                }, (error) => commonErrorHandler(error, coll));
            }

            const mealPlansQuery = query(collection(db, 'meal_plans'), where("userId", "==", userId));
            state.listeners.mealPlan = onSnapshot(mealPlansQuery, (snapshot) => {
                state.mealPlan = {};
                snapshot.forEach(doc => {
                    state.mealPlan = { ...state.mealPlan, ...doc.data() };
                });
                handleNavigation(window.location.hash);
            }, (error) => commonErrorHandler(error, 'madplan'));

            // Listener for the manually managed groceries list
            state.listeners.shoppingLists = onSnapshot(doc(db, 'shopping_lists', userId), (doc) => {
                const data = doc.exists() ? doc.data() : {};
                state.shoppingLists.groceries = data.groceries || {};
                handleNavigation(window.location.hash);
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
                    const buttonsToEnable = [elements.addInventoryItemBtn, elements.reorderAssistantBtn, elements.addRecipeBtn, elements.addProjectBtn, elements.addRoomBtn, elements.editRoomBtn];
                    buttonsToEnable.forEach(btn => { if (btn) btn.disabled = false; });
                    setReferencesLoaded(true);
                    handleNavigation(window.location.hash);
                } else {
                    handleError(new Error("References not found"), "Første gang du logger ind, skal du oprette referencer for at kunne bruge appen. Gå til 'Referencer' for at starte.");
                    window.location.hash = '#references';
                }
            }, (error) => commonErrorHandler(error, 'referencer'));

        }, (error) => commonErrorHandler(error, 'users'));
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
        
        const buttonsToDisable = [elements.addInventoryItemBtn, elements.reorderAssistantBtn, elements.addRecipeBtn, elements.addProjectBtn, elements.addRoomBtn, elements.editRoomBtn];
        buttonsToDisable.forEach(btn => { if (btn) btn.disabled = true; });
        setReferencesLoaded(false);
    }

    function handleNavigation(hash) {
        try {
            const [mainHash, subId] = hash.split('/');
            state.currentlyViewedRoomId = subId || null;

            const validHashes = ['#dashboard', '#calendar', '#hjem', '#room-details', '#recipes', '#inventory', '#budget', '#references'];
            const currentHash = validHashes.includes(mainHash) ? mainHash : '#dashboard';
            
            navigateTo(currentHash);

            switch(currentHash) {
                case '#dashboard':
                    renderDashboardPage();
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
                case '#budget':
                    renderBudgetPage();
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
        setupAuthEventListeners(elements);
        initAuth(onLogin, onLogout);

        const buttonsToDisable = [elements.addInventoryItemBtn, elements.reorderAssistantBtn, elements.addRecipeBtn, elements.addProjectBtn, elements.addRoomBtn, elements.editRoomBtn];
        buttonsToDisable.forEach(btn => { if (btn) btn.disabled = true; });

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
