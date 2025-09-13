// js/app.js

import { db } from './firebase.js';
import { collection, onSnapshot, doc, where, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { initAuth, setupAuthEventListeners } from './auth.js';
import { initUI, navigateTo, handleError } from './ui.js';
import { initInventory, renderInventory } from './inventory.js';
import { initRecipes, renderRecipes } from './recipes.js';
import { initMealPlanner, renderMealPlanner } from './mealPlanner.js';
import { initShoppingList } from './shoppingList.js';
import { initReferences, renderReferencesPage } from './references.js';
import { initDashboard, renderDashboardPage } from './dashboard.js';
import { initKitchenCounter } from './kitchenCounter.js';
import { initEvents } from './events.js';
import { initEconomyPage } from './economy.js';
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
        
        hjemmetSidebar: document.getElementById('hjemmet-sidebar'),
        hjemmetMainContent: document.getElementById('hjemmet-main-content'),

        // Inventory
        inventoryItemModal: document.getElementById('inventory-item-modal'),
        inventoryItemForm: document.getElementById('inventory-item-form'),
        addInventoryItemBtn: document.getElementById('add-inventory-item-btn'),
        inventoryModalTitle: document.getElementById('inventory-item-modal-title'),
        reorderAssistantModal: document.getElementById('reorder-assistant-modal'),
        reorderListContainer: document.getElementById('reorder-list-container'),
        reorderForm: document.getElementById('reorder-form'),
        
        // NYE VARELAGER ELEMENTER
        inventorySidebar: document.getElementById('inventory-sidebar'),
        inventoryMainContentContainer: document.getElementById('inventory-main-content-container'),
        favoriteItemsList: document.getElementById('favorite-items-list'),
        inventoryTotalValueDisplay: document.getElementById('inventory-total-value-display'),
        inventorySearch: document.getElementById('inventory-search'),
        inventoryMainCatFilter: document.getElementById('inventory-main-cat-filter'),
        inventoryImpulsePurchaseBtn: document.getElementById('inventory-impulse-purchase-btn'),
        inventoryReorderAssistantBtn: document.getElementById('inventory-reorder-assistant-btn'),
        inventoryUseInCookbookBtn: document.getElementById('inventory-use-in-cookbook-btn'),
        
        impulsePurchaseModal: document.getElementById('impulse-purchase-modal'),
        impulsePurchaseForm: document.getElementById('impulse-purchase-form'),

        quickStockAdjustModal: document.getElementById('quick-stock-adjust-modal'),
        quickStockAdjustForm: document.getElementById('quick-stock-adjust-form'),

        // Recipes (New Structure)
        cookbookAddRecipeBtn: document.getElementById('cookbook-add-recipe-btn'),
        recipeFlipper: document.getElementById('recipe-flipper'),
        prevRecipeBtn: document.getElementById('prev-recipe-btn'),
        nextRecipeBtn: document.getElementById('next-recipe-btn'),
        recipeListGrid: document.getElementById('recipe-list-grid'),
        listFilterTagsContainer: document.getElementById('list-filter-tags-container'),
        recipeSearchInputSidebar: document.getElementById('recipe-search-input-sidebar'),
        whatCanIMakeWidget: document.getElementById('what-can-i-make-widget'),
        upcomingMealPlanWidget: document.getElementById('upcoming-meal-plan-widget'),
        goToCalendarBtn: document.getElementById('go-to-calendar-btn'),
        
        // Modals (beholdes for nu)
        recipeEditModal: document.getElementById('recipe-edit-modal'),
        recipeForm: document.getElementById('recipe-form'),
        recipeEditModalTitle: document.getElementById('recipe-edit-modal-title'),
        ingredientsContainer: document.getElementById('ingredients-container'),
        addIngredientBtn: document.getElementById('add-ingredient-btn'),
        recipeImportTextarea: document.getElementById('recipe-import-textarea'),
        importRecipeBtn: document.getElementById('import-recipe-btn'),
        recipeImagePreview: document.getElementById('recipe-image-preview'),
        recipeImageUrlInput: document.getElementById('recipe-imageUrl'),
        recipeImageUploadInput: document.getElementById('recipe-image-upload'),
        recipeReadModal: document.getElementById('recipe-read-modal'),
        readViewPlanBtn: document.getElementById('read-view-plan-btn'),
        readViewCookBtn: document.getElementById('read-view-cook-btn'),
        readViewEditBtn: document.getElementById('read-view-edit-btn'),
        readViewDeleteBtn: document.getElementById('read-view-delete-btn'),
        readViewPrice: document.getElementById('read-view-price'),

        // KALENDER "Uge-Hub" ELEMENTER
        hubPrevWeekBtn: document.getElementById('hub-prev-week-btn'),
        hubNextWeekBtn: document.getElementById('hub-next-week-btn'),
        hubTitle: document.getElementById('hub-title'),
        hubClearWeekBtn: document.getElementById('hub-clear-week-btn'),
        hubGenerateGroceriesBtn: document.getElementById('hub-generate-groceries-btn'),
        mealPlanSection: document.getElementById('meal-plan-section'),
        sidebarSection: document.getElementById('sidebar-section'),
        generateGroceriesBtn: document.getElementById('hub-generate-groceries-btn'),

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

        // Hjemmet modals
        plantModal: document.getElementById('plant-edit-modal'),
        plantForm: document.getElementById('plant-form'),
        deletePlantBtn: document.getElementById('delete-plant-btn'),
        wishlistModal: document.getElementById('wishlist-item-modal'),
        wishlistForm: document.getElementById('wishlist-item-form'),
        projectModal: document.getElementById('project-edit-modal'),
        projectForm: document.getElementById('project-form'),
        deleteProjectBtn: document.getElementById('delete-project-btn'),
        reminderModal: document.getElementById('reminder-edit-modal'),
        reminderForm: document.getElementById('reminder-form'),
        deleteReminderBtn: document.getElementById('delete-reminder-btn'),
        maintenanceModal: document.getElementById('maintenance-edit-modal'),
        maintenanceForm: document.getElementById('maintenance-form'),
        deleteMaintenanceBtn: document.getElementById('delete-maintenance-btn'),
        homeInventoryModal: document.getElementById('home-inventory-edit-modal'),
        homeInventoryForm: document.getElementById('home-inventory-form'),
        deleteHomeInventoryBtn: document.getElementById('delete-home-inventory-btn'),

        addExpenseBtn: document.querySelector('[data-action="add-expense"]'),
    };

    function computeDerivedShoppingLists() {
        // Beregn materialelisten baseret på projekter
        const materialsNeeded = {};

        // Gennemgå alle planlagte og igangværende projekter
        (appState.projects || []).forEach(project => {
            if (project.status === 'Planlagt' || project.status === 'Igangværende') {
                (project.materials || []).forEach(material => {
                    const key = material.name.toLowerCase();
                    if (!materialsNeeded[key]) {
                        materialsNeeded[key] = {
                            total: 0,
                            unit: material.unit,
                            name: material.name,
                            projects: []
                        };
                    }
                    materialsNeeded[key].total += material.quantity || 0;
                    materialsNeeded[key].projects.push({ name: project.title, qty: material.quantity });
                });
            }
        });

        // Sammenlign med varelager og opret indkøbsliste
        const materialsShoppingList = {};
        for (const key in materialsNeeded) {
            const needed = materialsNeeded[key];
            const inventoryItem = appState.inventory.find(item => item.name.toLowerCase() === key);
            const stock = inventoryItem ? (inventoryItem.totalStock || 0) : 0;
            const toBuy = Math.max(0, needed.total - stock);
            
            if (toBuy > 0) {
                materialsShoppingList[key] = {
                    name: needed.name,
                    quantity_to_buy: toBuy,
                    unit: needed.unit,
                    note: `Til projekt(er): ${needed.projects.map(p => p.name).join(', ')}`,
                    projectId: needed.projects.length === 1 ? appState.projects.find(p => p.title === needed.projects[0].name)?.id : null,
                    itemId: inventoryItem ? inventoryItem.id : null
                };
            }
        }
        state.shoppingLists.materials = materialsShoppingList;
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
                renderHjemmetPage();
                break;
            case '#recipes':
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
            plants: 'plants',
            projects: 'projects',
            reminders: 'reminders',
            maintenance: 'maintenance',
            home_inventory: 'home_inventory'
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
                    state.shoppingLists.wishlist = data.wishlist || {};
                } else if (stateKey === 'mealPlan') {
                    const { userId, ...planData } = data;
                    state.mealPlan = planData;
                } else {
                    state[stateKey] = data;
                }
                
                if (stateKey === 'references') {
                     const buttonsToEnable = [
                        elements.addInventoryItemBtn, 
                        elements.inventoryReorderAssistantBtn, 
                        elements.cookbookAddRecipeBtn,
                        elements.hubGenerateGroceriesBtn,
                        elements.inventoryImpulsePurchaseBtn,
                        elements.addExpenseBtn
                    ];
                     buttonsToEnable.forEach(btn => { if (btn) btn.disabled = false; });
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
            elements.inventoryReorderAssistantBtn, 
            elements.cookbookAddRecipeBtn,
            elements.hubGenerateGroceriesBtn,
            elements.inventoryImpulsePurchaseBtn,
            elements.addExpenseBtn
        ];
        buttonsToDisable.forEach(btn => { if (btn) btn.disabled = true; });
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
        initHjemmet(state, elements);
    }

    init();
});

