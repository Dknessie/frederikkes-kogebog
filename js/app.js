// js/app.js

import { db } from './firebase.js';
import { collection, onSnapshot, doc, where, query, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
import { initEconomy, renderEconomy } from './economy.js';
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
        budgets: [], // ÆNDRET: Nu et array, ligesom recipes
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

    // =================================================================
    // MIDLERTIDIG OPRYDNINGSFUNKTION
    // =================================================================
    async function cleanupDuplicateBudgets() {
        if (!state.currentUser) {
            console.error("Du skal være logget ind for at køre oprydningen.");
            return;
        }

        console.log("Starter oprydning af duplikerede budgetter...");
        const budgetsColRef = collection(db, 'budgets');
        const q = query(budgetsColRef, where("userId", "==", state.currentUser.uid));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.log("Ingen budgetter fundet. Alt ser fint ud.");
            return;
        }

        const budgets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const grouped = budgets.reduce((acc, doc) => {
            const key = doc.personId; // 'daniel' or 'frederikke'
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(doc);
            return acc;
        }, {});

        const batch = writeBatch(db);
        let deletions = 0;

        for (const personId in grouped) {
            const personBudgets = grouped[personId];
            if (personBudgets.length > 1) {
                console.log(`Fandt ${personBudgets.length} budgetter for ${personId}. Beholder ét og sletter resten.`);
                
                // Sorter for at beholde det ene med flest data (flest budgetposter)
                personBudgets.sort((a, b) => {
                    const countA = (a.budget?.income?.length || 0) + (a.budget?.expenses?.length || 0);
                    const countB = (b.budget?.income?.length || 0) + (b.budget?.expenses?.length || 0);
                    return countB - countA;
                });

                const toKeep = personBudgets.shift(); // Fjerner det første (det der skal beholdes) fra array'et
                console.log(`Beholder budget med ID: ${toKeep.id}`);

                // Resten er dubletter, der skal slettes
                personBudgets.forEach(docToDelete => {
                    console.log(`Sletter duplikat med ID: ${docToDelete.id}`);
                    const docRef = doc(db, 'budgets', docToDelete.id);
                    batch.delete(docRef);
                    deletions++;
                });
            }
        }

        if (deletions > 0) {
            try {
                await batch.commit();
                const successMsg = `Oprydning fuldført! ${deletions} duplikat(er) blev slettet. Genindlæs siden for at se resultatet.`;
                console.log(successMsg);
                alert(successMsg);
            } catch (error) {
                console.error("Fejl under sletning af duplikater:", error);
                alert("Der opstod en fejl under oprydningen. Se konsollen for detaljer.");
            }
        } else {
            console.log("Ingen duplikater fundet at slette. Alt er i orden.");
            alert("Ingen duplikater fundet. Alt ser ud til at være i orden.");
        }
    }
    // Gør funktionen tilgængelig i browserens konsol
    window.cleanupDuplicateBudgets = cleanupDuplicateBudgets;
    // =================================================================
    // SLUT PÅ MIDLERTIDIG FUNKTION
    // =================================================================


    function computeDerivedShoppingLists() {
        const materialsNeeded = {};
        (state.projects || []).forEach(project => {
            if (project.status === 'Planlagt' || project.status === 'Igangværende') {
                (project.materials || []).forEach(material => {
                    const key = material.name.toLowerCase();
                    if (!materialsNeeded[key]) {
                        materialsNeeded[key] = { total: 0, unit: material.unit, name: material.name, projects: [] };
                    }
                    materialsNeeded[key].total += material.quantity || 0;
                    materialsNeeded[key].projects.push({ name: project.title, qty: material.quantity });
                });
            }
        });

        const materialsShoppingList = {};
        for (const key in materialsNeeded) {
            const needed = materialsNeeded[key];
            const inventoryItem = state.inventory.find(item => item.name.toLowerCase() === key);
            const stock = inventoryItem ? (inventoryItem.totalStock || 0) : 0;
            const toBuy = Math.max(0, needed.total - stock);
            
            if (toBuy > 0) {
                materialsShoppingList[key] = {
                    name: needed.name,
                    quantity_to_buy: toBuy,
                    unit: needed.unit,
                    note: `Til projekt(er): ${needed.projects.map(p => p.name).join(', ')}`,
                    projectId: needed.projects.length === 1 ? state.projects.find(p => p.title === needed.projects[0].name)?.id : null,
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
            home_inventory: 'home_inventory',
            budgets: 'budgets' // TILFØJET: Lytter nu til budgets collection
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
        initEconomy(state, elements);
        initHjemmet(state, elements);
    }

    init();
});
```

### Trin 2: Kør oprydningen

1.  **Gem `app.js`** og genindlæs "Frederikkes Kogebog" i din browser. Sørg for at være logget ind.
2.  Åbn **Developer Tools** (Udviklerværktøjer) i din browser. Dette gøres typisk ved at trykke på `F12` eller `Ctrl+Shift+I` (Windows) / `Cmd+Opt+I` (Mac).
3.  Gå til fanen, der hedder **Console** (Konsol).
4.  Skriv følgende kommando i konsollen og tryk `Enter`:
    ```
    cleanupDuplicateBudgets()
    
