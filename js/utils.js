// js/utils.js

/**
 * En centraliseret funktion til at håndtere fejl.
 * Viser en notifikationsmodal med en brugervenlig besked.
 * @param {Error} error - Det faktiske fejl-objekt.
 * @param {string} userMessage - Den besked, der skal vises til brugeren.
 * @param {string} context - (Valgfri) Kontekst for fejlen, til brug i console.
 */
export function handleError(error, userMessage, context = 'Ukendt kontekst') {
    console.error(`Fejl i ${context}:`, error);

    const notificationModal = document.getElementById('notification-modal');
    const notificationTitle = document.getElementById('notification-title');
    const notificationMessage = document.getElementById('notification-message');
    const closeButton = notificationModal ? notificationModal.querySelector('.close-modal-btn') : null;
    
    if (notificationModal && notificationTitle && notificationMessage && closeButton) {
        notificationTitle.textContent = 'Der opstod en fejl';
        notificationMessage.textContent = userMessage;
        
        const hideModal = () => notificationModal.classList.add('hidden');
        closeButton.onclick = hideModal;

        notificationModal.classList.remove('hidden');
    } else {
        console.error("Notifikationsmodalen eller dens elementer blev ikke fundet i DOM.");
        // Fallback, hvis modalen af en eller anden grund ikke kan vises.
        alert(`Fejl: ${userMessage}`);
    }
}

/**
 * Formaterer et dato-objekt eller en ISO-streng til et læsbart format (DD.MM.YYYY).
 * @param {Date|string} date - Datoen, der skal formateres.
 * @returns {string} Den formaterede dato-streng.
 */
export function formatDate(date) {
    if (!date) return 'Ingen dato';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

/**
 * Omregner en given mængde af en enhed til gram.
 * @param {number} quantity - Mængden.
 * @param {string} unit - Enheden (f.eks. 'kg', 'g', 'l', 'dl').
 * @returns {number} Mængden i gram.
 */
export function convertToGrams(quantity, unit) {
    const unitLower = unit.toLowerCase();
    switch (unitLower) {
        case 'kg':
        case 'l': // Antager 1 liter ≈ 1 kg for simplicitetens skyld
            return quantity * 1000;
        case 'g':
        case 'ml': // Antager 1 ml ≈ 1 g
            return quantity;
        case 'dl':
            return quantity * 100;
        case 'tsk':
            return quantity * 5; // Cirka-værdi
        case 'spsk':
            return quantity * 15; // Cirka-værdi
        default:
            return quantity; // Returner som den er, hvis enheden er ukendt
    }
}
