// js/app.js

import { db } from './firebase.js';
import { collection, onSnapshot, doc, where, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { initAuth, setupAuthEventListeners } from './auth.js';
import { initUI, navigateTo, handleError } from './ui.js';
import { initIngredientLibrary, renderIngredientLibrary } from './inventory.js';
import { initRecipes, renderRecipes } from './recipes.js';
import { initMealPlanner, renderMealPlanner } from './mealPlanner.js';
import { initShoppingList } from './shoppingList.js';
import { initReferences, renderReferencesPage } from './references.js';
import { initDashboard, renderDashboardPage } from './dashboard.js';
import { initEvents } from './events.js';
import { initEconomy, renderEconomy } from './economy.js';
import { initHjemmet, renderHjemmetPage } from './hjemmet.js';

document.addEventListener('DOMContentLoaded', () => {
    // Central state object for the entire application
    const state = {
        currentUser: null,
        users: [],
        ingredientInfo: [], 
        recipes: [],
        assets: [],
        liabilities: [],
        economySettings: {},
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

        ingredientModal: document.getElementById('ingredient-info-modal'),
        ingredientForm: document.getElementById('ingredient-info-form'),
        addIngredientBtn: document.getElementById('add-ingredient-btn'),
        ingredientModalTitle: document.getElementById('ingredient-modal-title'),
        textImportModal: document.getElementById('text-import-modal'),
        textImportForm: document.getElementById('text-import-form'),
        
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
        
        recipeEditModal: document.getElementById('recipe-edit-modal'),
        recipeForm: document.getElementById('recipe-form'),
        recipeEditModalTitle: document.getElementById('recipe-edit-modal-title'),
        ingredientsContainer: document.getElementById('ingredients-container'),
        addIngredientBtnRecipe: document.getElementById('add-ingredient-btn-recipe'),
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

        // NYE KALENDER-ELEMENTER
        hubPrevWeekBtn: document.getElementById('hub-prev-week-btn'),
        hubNextWeekBtn: document.getElementById('hub-next-week-btn'),
        hubTitle: document.getElementById('hub-title'),
        hubClearWeekBtn: document.getElementById('hub-clear-week-btn'),
        hubGenerateGroceriesBtn: document.getElementById('hub-generate-groceries-btn'),
        mealPlanSection: document.getElementById('meal-plan-section'),
        sidebarSection: document.getElementById('sidebar-section'),

        // NYE MODALS TIL KALENDER
        planMealModal: document.getElementById('plan-meal-modal'),
        planMealForm: document.getElementById('plan-meal-form'),
        planMealModalTitle: document.getElementById('plan-meal-modal-title'),
        addCalendarEventModal: document.getElementById('add-calendar-event-modal'),
        dayDetailsModal: document.getElementById('day-details-modal'),
        eventModal: document.getElementById('event-modal'),
        eventForm: document.getElementById('event-form'),

        // References
        referencesContainer: document.getElementById('references-container'),
        householdMembersList: document.getElementById('household-members-list'),

        // Mobile
        mobileTabBar: document.getElementById('mobile-tab-bar'),
        mobileTabLinks: document.querySelectorAll('.mobile-tab-link'),

        // Generelle Modals
        notificationModal: document.getElementById('notification-modal'),
        notificationTitle: document.getElementById('notification-title'),
        notificationMessage: document.getElementById('notification-message'),
        notificationActions: document.getElementById('notification-actions'),
        shoppingListModal: document.getElementById('shopping-list-modal'),
        shoppingListModalTitle: document.getElementById('shopping-list-modal-title'),
        shoppingListModalContentWrapper: document.getElementById('shopping-list-modal-content-wrapper'),

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
    };

    function renderCurrentPage() {
        const hash = window.location.hash || '#dashboard';
        const pageId = hash.substring(1).split('/')[0];
    
        switch('#' + pageId) {
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
                renderIngredientLibrary();
                break;
            case '#oekonomi':
                renderEconomy();
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
            ingredient_info: 'ingredientInfo',
            recipes: 'recipes',
            events: 'events',
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
                        elements.addIngredientBtn, 
                        elements.cookbookAddRecipeBtn,
                        elements.hubGenerateGroceriesBtn,
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
            elements.addIngredientBtn, 
            elements.cookbookAddRecipeBtn,
            elements.hubGenerateGroceriesBtn,
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
        initIngredientLibrary(state, elements);
        initRecipes(state, elements);
        initShoppingList(state, elements);
        initMealPlanner(state, elements);
        initReferences(state, elements);
        initDashboard(state, elements);
        initEvents(state);
        initEconomy(state, elements);
        initHjemmet(state, elements);
    }

    init();
});

