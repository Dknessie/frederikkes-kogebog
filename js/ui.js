// js/ui.js

// This module handles general UI interactions, like navigation, modals, and notifications.

let UIElements; // To hold a reference to the main elements object
let appState; // To hold a reference to the main state object

/**
 * Initializes the UI module with necessary elements and state.
 * @param {object} state - The global app state from app.js.
 * @param {object} elements - The cached DOM elements from app.js.
 */
export function initUI(state, elements) {
    UIElements = elements;
    appState = state;
    initNavigationClicks();
    initModals();
    initMobileUI();
    initSidebarTabs();
    initHjemTabs();
}

/**
 * Shows/hides the correct page section based on the hash.
 * @param {string} hash - The hash of the page to navigate to (e.g., '#recipes').
 */
export function navigateTo(hash) {
    const effectiveHash = hash || '#dashboard';
    UIElements.pages.forEach(page => page.classList.add('hidden'));
    const targetPage = document.querySelector(effectiveHash);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    } else {
        document.getElementById('dashboard').classList.remove('hidden'); // Fallback to dashboard
    }
    
    // Update active link in navigations
    UIElements.navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === effectiveHash);
    });
    UIElements.mobileTabLinks.forEach(link => {
        const page = link.dataset.page;
        if (page) {
            link.classList.toggle('active', `#${page}` === effectiveHash);
        }
    });
}

/**
 * Sets up the main navigation event listeners that only change the URL hash.
 * The actual page change is handled by the central listener in app.js.
 */
function initNavigationClicks() {
    UIElements.headerTitleLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.hash = '#dashboard';
    });

    UIElements.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const hash = e.currentTarget.getAttribute('href');
            window.location.hash = hash;
        });
    });
}

/**
 * Sets up event listeners for closing modals.
 */
function initModals() {
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.currentTarget.closest('.modal-overlay').classList.add('hidden');
        });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.add('hidden');
            }
        });
    });
}

/**
 * Sets up mobile-specific UI event listeners (tab bar, panels).
 */
function initMobileUI() {
    UIElements.mobileTabBar.addEventListener('click', (e) => {
        const link = e.target.closest('.mobile-tab-link');
        if (!link) return;
        
        e.preventDefault();
        
        const page = link.dataset.page;
        const panel = link.dataset.panel;

        if (page) {
            window.location.hash = `#${page}`;
        } else if (panel) {
            showMobilePanel(panel);
        }
    });

    UIElements.mobilePanelOverlay.addEventListener('click', (e) => {
        if (e.target === UIElements.mobilePanelOverlay || e.target.closest('.close-mobile-panel-btn')) {
            hideMobilePanels();
        }
    });
}

/**
 * Shows a mobile slide-in panel.
 * @param {string} panelId - The ID of the panel to show ('shopping-list' or 'kitchen-counter').
 */
function showMobilePanel(panelId) {
    UIElements.mobilePanelOverlay.classList.remove('hidden');
    UIElements.mobilePanelOverlay.classList.add('active');
    
    let targetPanel;
    if (panelId === 'shopping-list') {
        targetPanel = UIElements.mobileShoppingListPanel;
    } else if (panelId === 'kitchen-counter') {
        targetPanel = UIElements.mobileKitchenCounterPanel;
    } else {
        return;
    }

    if (UIElements.mobileShoppingListPanel) UIElements.mobileShoppingListPanel.classList.remove('active');
    if (UIElements.mobileKitchenCounterPanel) UIElements.mobileKitchenCounterPanel.classList.remove('active');
    
    setTimeout(() => targetPanel.classList.add('active'), 10);
}

/**
 * Hides all mobile slide-in panels.
 */
function hideMobilePanels() {
    UIElements.mobilePanelOverlay.classList.remove('active');
    if (UIElements.mobileShoppingListPanel) UIElements.mobileShoppingListPanel.classList.remove('active');
    if (UIElements.mobileKitchenCounterPanel) UIElements.mobileKitchenCounterPanel.classList.remove('active');
    setTimeout(() => {
        if (!UIElements.mobilePanelOverlay.classList.contains('active')) {
            UIElements.mobilePanelOverlay.classList.add('hidden');
        }
    }, 300);
}

/**
 * Sets up the desktop sidebar tab functionality.
 */
function initSidebarTabs() {
    const tabs = document.querySelectorAll('.sidebar-panel-tabs .panel-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const parent = tab.closest('.sidebar-panel-tabs');
            const sidebar = parent.closest('aside');
            parent.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const targetPanelId = tab.dataset.panel;
            sidebar.querySelectorAll('.sidebar-panel').forEach(panel => {
                panel.classList.toggle('active', panel.id === targetPanelId);
            });
        });
    });
}

/**
 * Sets up the sub-navigation tabs on the "Hjem" page.
 */
function initHjemTabs() {
    UIElements.hjemNavTabs.addEventListener('click', e => {
        const targetTab = e.target.closest('.hjem-tab');
        if (!targetTab) return;

        UIElements.hjemNavTabs.querySelectorAll('.hjem-tab').forEach(tab => tab.classList.remove('active'));
        targetTab.classList.add('active');

        const targetId = targetTab.dataset.target;
        UIElements.hjemSubpages.forEach(page => {
            page.classList.toggle('active', page.id === targetId);
        });
    });
}

/**
 * Displays a notification or confirmation modal.
 * @param {object} options - The options for the notification.
 * @param {string} options.title - The title of the modal.
 * @param {string} options.message - The message content (can be HTML).
 * @param {string} [options.type='alert'] - The type ('alert' or 'confirm').
 * @returns {Promise<boolean>} A promise that resolves to true if confirmed/OK'd, false if cancelled.
 */
export function showNotification({ title, message, type = 'alert' }) {
    UIElements.notificationTitle.textContent = title;
    UIElements.notificationMessage.innerHTML = message;
    UIElements.notificationActions.innerHTML = ''; 

    return new Promise((resolve) => {
        if (type === 'confirm') {
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'btn btn-primary';
            confirmBtn.textContent = 'Bekræft';
            confirmBtn.onclick = () => {
                UIElements.notificationModal.classList.add('hidden');
                resolve(true);
            };

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn-secondary';
            cancelBtn.textContent = 'Annuller';
            cancelBtn.onclick = () => {
                UIElements.notificationModal.classList.add('hidden');
                resolve(false);
            };
            UIElements.notificationActions.append(cancelBtn, confirmBtn);
        } else {
            const okBtn = document.createElement('button');
            okBtn.className = 'btn btn-primary';
            okBtn.textContent = 'OK';
            okBtn.onclick = () => {
                UIElements.notificationModal.classList.add('hidden');
                resolve(true);
            };
            UIElements.notificationActions.append(okBtn);
        }
        UIElements.notificationModal.classList.remove('hidden');
    });
}

/**
 * Handles and displays an error to the user and console.
 * @param {Error} error - The error object.
 * @param {string} userMessage - The message to show the user.
 * @param {string} context - The context in which the error occurred for console logging.
 */
export function handleError(error, userMessage = "Der opstod en uventet fejl.", context = "Ukendt") {
    console.error(`Fejl i ${context}:`, error);
    showNotification({ title: "Fejl", message: userMessage });
}
