// js/ui.js

/**
 * Viser en specifik sektion/side og skjuler alle andre.
 * @param {string} sectionId - ID'et på den sektion, der skal vises.
 */
export function showSection(sectionId) {
    const sections = document.querySelectorAll('main > section');
    sections.forEach(section => {
        if (section.id === sectionId) {
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
        }
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
            
            // Fjern 'active' klasse fra alle links
            navLinks.forEach(l => l.classList.remove('active'));
            // Tilføj 'active' til det klikkede link
            link.classList.add('active');

            showSection(sectionId);
            
            // Kør callback-funktionen efter navigationen
            if (typeof onNavigate === 'function') {
                onNavigate();
            }
        });
    });
}

// Yderligere UI-hjælpefunktioner kan tilføjes her, f.eks. til at vise notifikationer eller modaler.
