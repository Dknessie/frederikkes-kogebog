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
    initMobileNav();
}

/**
 * Shows/hides the correct page section based on the hash.
 * @param {string} hash - The hash of the page to navigate to (e.g., '#recipes').
 */
export function navigateTo(hash) {
    const effectiveHash = hash || '#dashboard';
    // RETTELSE: Fjerner '#' fra hashet for at matche elementets ID direkte.
    const targetId = effectiveHash.substring(1); 

    // Skjul alle sider
    UIElements.pages.forEach(page => {
        if (!page.classList.contains('hidden')) {
            page.classList.add('hidden');
        }
    });
    
    // Find og vis den korrekte side
    const targetPage = document.getElementById(targetId);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    } else {
        // Fallback til dashboard hvis siden ikke findes
        document.getElementById('dashboard').classList.remove('hidden');
    }
    
    // Opdater aktive links i navigationen
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
 * Handles modal closing with more control.
 * It checks for data-attributes to prevent accidental closing.
 */
function initModals() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            const isClosableOnOverlay = overlay.dataset.overlayClosable !== 'false';

            // Close if the close button is clicked
            if (e.target.closest('.close-modal-btn')) {
                handleCloseAttempt(overlay);
            }
            // Close if the overlay is clicked AND it's allowed
            else if (isClosableOnOverlay && e.target === overlay) {
                handleCloseAttempt(overlay);
            }
        });
    });
}

/**
 * Handles the attempt to close a modal, checking if confirmation is needed.
 * @param {HTMLElement} overlay - The modal overlay element to potentially close.
 */
async function handleCloseAttempt(overlay) {
    const needsConfirmation = overlay.dataset.confirmClose === 'true';

    if (needsConfirmation) {
        const confirmed = await showNotification({
            title: "Er du sikker?",
            message: "Hvis du lukker nu, vil dine ændringer ikke blive gemt. Vil du fortsætte?",
            type: 'confirm'
        });
        if (confirmed) {
            overlay.classList.add('hidden');
        }
    } else {
        overlay.classList.add('hidden');
    }
}


/**
 * Sets up mobile-specific UI event listeners (tab bar).
 */
function initMobileNav() {
    if (UIElements.mobileTabBar) {
        UIElements.mobileTabBar.addEventListener('click', (e) => {
            const link = e.target.closest('.mobile-tab-link');
            if (!link) return;
            
            e.preventDefault();
            const page = link.dataset.page;
            if (page) {
                window.location.hash = `#${page}`;
            }
        });
    }
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
    const modal = document.getElementById('notification-modal');
    modal.classList.remove('hidden');

    return new Promise((resolve) => {
        if (type === 'confirm') {
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'btn btn-primary';
            confirmBtn.textContent = 'Bekræft';
            confirmBtn.onclick = () => {
                modal.classList.add('hidden');
                resolve(true);
            };

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'btn btn-secondary';
            cancelBtn.textContent = 'Annuller';
            cancelBtn.onclick = () => {
                modal.classList.add('hidden');
                resolve(false);
            };
            UIElements.notificationActions.append(cancelBtn, confirmBtn);
        } else {
            const okBtn = document.createElement('button');
            okBtn.className = 'btn btn-primary';
            okBtn.textContent = 'OK';
            okBtn.onclick = () => {
                modal.classList.add('hidden');
                resolve(true);
            };
            UIElements.notificationActions.append(okBtn);
        }
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
