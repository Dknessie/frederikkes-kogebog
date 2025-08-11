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
 * Opsætter navigationslinks til at skifte mellem sektioner og opdaterer URL-hashen.
 * @param {function} onNavigate - En callback-funktion, der skal køres efter en sektion er vist. Typisk updateUI fra app.js.
 */
export function setupNavigation(onNavigate) {
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const href = link.getAttribute('href');
            const sectionId = href.substring(1) + '-section';
            
            // Opdater URL'en i browseren - DETTE ER DEN VIGTIGE RETTELSE
            window.location.hash = href;

            // Fjern 'active' klasse fra alle links
            navLinks.forEach(l => l.classList.remove('active'));
            // Tilføj 'active' til det klikkede link
            link.classList.add('active');

            showSection(sectionId);
            
            // Kør callback-funktionen for at opdatere sidens indhold
            if (typeof onNavigate === 'function') {
                onNavigate();
            }
        });
    });

    // Håndter indledende navigation baseret på URL'en ved sideindlæsning
    const initialHash = window.location.hash || '#dashboard';
    const initialLink = document.querySelector(`.nav-link[href="${initialHash}"]`);
    if (initialLink) {
        initialLink.click();
    }
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
