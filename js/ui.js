// js/ui.js

/**
 * Viser en specifik sektion/side og skjuler alle andre.
 * @param {string} sectionId - ID'et på den sektion, der skal vises.
 */
export function showSection(sectionId) {
    const sections = document.querySelectorAll('main > section');
    sections.forEach(section => {
        section.style.display = (section.id === sectionId) ? 'block' : 'none';
    });
}

/**
 * Opsætter navigationslinks til at skifte mellem sektioner.
 * @param {function} onNavigate - En callback-funktion, der skal køres efter en sektion er vist. Typisk updateUI fra app.js.
 */
export function setupNavigation(onNavigate) {
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const sectionId = link.getAttribute('href').substring(1) + '-section';
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            showSection(sectionId);
            
            if (typeof onNavigate === 'function') {
                onNavigate();
            }
        });
    });
}

/**
 * Viser en modal.
 * @param {string} modalId - ID'et på den modal, der skal vises.
 */
export function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
}

/**
 * Skjuler en modal.
 * @param {string} modalId - ID'et på den modal, der skal skjules.
 */
export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}
