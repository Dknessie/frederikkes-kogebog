// js/dashboard.js

/**
 * Initialiserer dashboardet ved at kalde alle render-funktioner med den aktuelle state.
 * @param {object} state - Hele applikationens state-objekt.
 */
export function initDashboard(state) {
    if (document.getElementById('dashboard-section').style.display === 'none') {
        return; // Gør intet hvis dashboardet ikke er synligt
    }
    console.log("Dashboard rendering med state:", state);
    renderWelcomeMessage(state);
    renderInventoryNotifications(state);
    // Kald til andre render-funktioner kan tilføjes her efterhånden som de udvikles
    // renderProjectOverview(state);
    // renderTimeline(state);
}

/**
 * Viser en velkomstbesked med dagens planlagte måltider.
 * @param {object} state - Applikationens state.
 */
function renderWelcomeMessage(state) {
    const welcomeElement = document.getElementById('dashboard-welcome-message');
    if (!welcomeElement) return;

    const today = new Date().toISOString().split('T')[0];
    const todaysMeals = state.mealPlan ? state.mealPlan.filter(meal => meal.date === today) : [];

    let message = `<p>Du har ${todaysMeals.length} måltid(er) planlagt i dag og ${state.projects?.filter(p => p.status === 'aktiv').length || 0} aktive projekter.</p>`;

    if (todaysMeals.length > 0) {
        let mealDetails = '<ul>';
        todaysMeals.forEach(meal => {
            const recipe = state.recipes.find(r => r.id === meal.recipeId);
            const recipeName = recipe ? recipe.name : 'Ukendt ret';
            mealDetails += `<li><b>${capitalize(meal.type)}:</b> <a href="#" data-recipe-id="${meal.recipeId}" class="recipe-link">${recipeName}</a></li>`;
        });
        mealDetails += '</ul>';
        message += mealDetails;
    }

    welcomeElement.innerHTML = message;
}

/**
 * Viser notifikationer for varelageret, f.eks. lav beholdning eller varer tæt på udløbsdato.
 * @param {object} state - Applikationens state.
 */
function renderInventoryNotifications(state) {
    const notificationsElement = document.getElementById('varelager-notifikationer');
    if (!notificationsElement) return;

    const inventory = state.inventory || [];
    const lowStockItems = inventory.filter(item => item.quantity > 0 && item.quantity <= (item.lowStockThreshold || 1));
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const soonToExpireItems = inventory.filter(item => {
        if (!item.expiryDate) return false;
        const expiryDate = new Date(item.expiryDate);
        const diffTime = expiryDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 3; // Notificer 3 dage før
    });

    let notificationsHTML = '';

    if (lowStockItems.length === 0 && soonToExpireItems.length === 0) {
        notificationsHTML = '<p>Alt er fyldt op, og intet udløber snart. Godt gået!</p>';
    } else {
        notificationsHTML += '<ul>';
        lowStockItems.forEach(item => {
            notificationsHTML += `<li>Lav beholdning: <b>${item.name}</b> (${item.quantity} ${item.unit} tilbage)</li>`;
        });
        soonToExpireItems.forEach(item => {
            notificationsHTML += `<li>Udløber snart: <b>${item.name}</b> (Udløber d. ${new Date(item.expiryDate).toLocaleDateString('da-DK')})</li>`;
        });
        notificationsHTML += '</ul>';
    }

    notificationsElement.innerHTML = notificationsHTML;
}


/**
 * Hjælpefunktion til at gøre første bogstav i en streng stort.
 * @param {string} s - Strengen der skal formateres.
 * @returns {string} - Den formaterede streng.
 */
function capitalize(s) {
    if (typeof s !== 'string') return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
}
