// js/dashboard.js

/**
 * Initialiserer dashboardet ved at kalde alle render-funktioner med den aktuelle state.
 * @param {object} state - Hele applikationens state-objekt.
 */
export function initDashboard(state) {
    const dashboardSection = document.getElementById('dashboard-section');
    if (!dashboardSection || dashboardSection.style.display === 'none') {
        return;
    }
    
    console.log("Dashboard initialiseres med state:", state);
    renderWelcomeMessage(state);
    renderInventoryNotifications(state);
    renderProjectOverview(state); // Tilføjet kald til den nye funktion
}

/**
 * Viser en velkomstbesked med dagens planlagte måltider.
 * @param {object} state - Applikationens state.
 */
function renderWelcomeMessage(state) {
    const welcomeElement = document.getElementById('dashboard-welcome-message');
    if (!welcomeElement) return;

    const today = new Date().toISOString().split('T')[0];
    const todaysMeals = Object.entries(state.mealPlan || {})
        .filter(([key, _]) => key.startsWith(today))
        .map(([key, value]) => ({
            type: key.split('_')[1],
            ...value
        }));

    const activeProjectsCount = state.projects?.filter(p => p.status === 'aktiv').length || 0;
    let message = `<p>Du har ${todaysMeals.length} måltid(er) planlagt i dag og ${activeProjectsCount} aktive projekter.</p>`;

    if (todaysMeals.length > 0) {
        let mealDetails = '<ul class="dashboard-meal-list">';
        todaysMeals.forEach(meal => {
            const recipe = state.recipes.find(r => r.id === meal.recipeId);
            const recipeName = recipe ? recipe.name : 'Ukendt ret';
            mealDetails += `<li><b>${capitalize(meal.type)}:</b> <a href="#recipes/${meal.recipeId}" class="recipe-link">${recipeName}</a></li>`;
        });
        mealDetails += '</ul>';
        message += mealDetails;
    }

    welcomeElement.innerHTML = message;
}

/**
 * Viser notifikationer for varelageret.
 * @param {object} state - Applikationens state.
 */
function renderInventoryNotifications(state) {
    const notificationsElement = document.getElementById('varelager-notifikationer');
    if (!notificationsElement) return;

    const inventory = state.inventory || [];
    
    const lowStockItems = inventory.filter(item => {
        const totalStock = (item.batches || []).reduce((sum, batch) => sum + (batch.quantity || 0), 0);
        return totalStock > 0 && totalStock <= (item.lowStockThreshold || 1);
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const soonToExpireItems = inventory
        .flatMap(item => (item.batches || []).map(batch => ({ ...batch, itemName: item.name })))
        .filter(batch => {
            if (!batch.expiryDate) return false;
            try {
                const expiryDate = batch.expiryDate.toDate ? batch.expiryDate.toDate() : new Date(batch.expiryDate);
                const diffTime = expiryDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays >= 0 && diffDays <= 3;
            } catch (e) {
                return false;
            }
        });

    let notificationsHTML = '';

    if (lowStockItems.length === 0 && soonToExpireItems.length === 0) {
        notificationsHTML = '<p>Alt er fyldt op, og intet udløber snart. Godt gået!</p>';
    } else {
        notificationsHTML = '<ul>';
        lowStockItems.forEach(item => {
             const totalStock = (item.batches || []).reduce((sum, batch) => sum + (batch.quantity || 0), 0);
            notificationsHTML += `<li>Lav beholdning: <b>${item.name}</b> (${totalStock} ${item.unit || 'stk'} tilbage)</li>`;
        });
        soonToExpireItems.forEach(batch => {
            const expiryDate = batch.expiryDate.toDate ? batch.expiryDate.toDate() : new Date(batch.expiryDate);
            notificationsHTML += `<li>Udløber snart: <b>${batch.itemName}</b> (Udløber d. ${expiryDate.toLocaleDateString('da-DK')})</li>`;
        });
        notificationsHTML += '</ul>';
    }

    notificationsElement.innerHTML = notificationsHTML;
}

/**
 * Viser en oversigt over aktive projekter.
 * @param {object} state - Applikationens state.
 */
function renderProjectOverview(state) {
    const container = document.querySelector('.projects-overview-widget');
    if (!container) return;

    const activeProjects = state.projects?.filter(p => p.status === 'aktiv') || [];

    if (activeProjects.length === 0) {
        container.innerHTML = '<h3>Projektoversigt</h3><p>Ingen aktive projekter i øjeblikket.</p>';
        return;
    }

    let content = '<h3>Projektoversigt</h3>';
    activeProjects.forEach(project => {
        content += `
            <div class="project-summary">
                <label>${project.name}</label>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${project.progress || 0}%;"></div>
                </div>
            </div>
        `;
    });
    container.innerHTML = content;
}


/**
 * Hjælpefunktion til at gøre første bogstav i en streng stort.
 * @param {string} s - Strengen der skal formateres.
 * @returns {string} - Den formaterede streng.
 */
function capitalize(s) {
    if (typeof s !== 'string' || s.length === 0) return '';
    const danishMap = {
        'breakfast': 'Morgenmad',
        'lunch': 'Frokost',
        'dinner': 'Aftensmad'
    };
    return danishMap[s.toLowerCase()] || s.charAt(0).toUpperCase() + s.slice(1);
}
