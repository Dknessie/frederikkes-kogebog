// js/recipes.js

import { db } from './firebase.js';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { handleError } from './utils.js';
import { showModal, hideModal } from './ui.js';
import { confirmAndDeductIngredients } from './inventory.js';

let state;

// Funktion til at initialisere opskrifts-modulet
export function initRecipes(appState) {
    state = appState;
    
    // Find og opsæt event listeners for elementer på opskriftssiden
    const addRecipeBtn = document.getElementById('add-recipe-btn');
    const recipeForm = document.getElementById('recipe-form');
    const recipeGrid = document.getElementById('recipe-grid');
    const recipeEditModal = document.getElementById('recipe-edit-modal');
    const closeBtn = recipeEditModal ? recipeEditModal.querySelector('.close-modal-btn') : null;

    if (addRecipeBtn) {
        addRecipeBtn.addEventListener('click', () => {
            recipeForm.reset();
            document.getElementById('recipe-edit-modal-title').textContent = 'Tilføj Ny Opskrift';
            form.dataset.id = ''; // Slet ID for at sikre, at det er en ny opskrift
            showModal('recipe-edit-modal');
        });
    }

    if (recipeForm) {
        recipeForm.addEventListener('submit', handleSaveRecipe);
    }

    if (recipeGrid) {
        recipeGrid.addEventListener('click', handleRecipeGridClick);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => hideModal('recipe-edit-modal'));
    }

    renderRecipes();
}

// Funktion til at rendere alle opskrifter
export function renderRecipes() {
    const recipeGrid = document.getElementById('recipe-grid');
    if (!recipeGrid) return;

    recipeGrid.innerHTML = ''; // Ryd eksisterende indhold
    if (!state.recipes || state.recipes.length === 0) {
        recipeGrid.innerHTML = '<p>Du har endnu ingen opskrifter. Klik på "Tilføj ny opskrift" for at starte.</p>';
        return;
    }

    state.recipes.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.dataset.id = recipe.id;
        card.innerHTML = `
            <img src="${recipe.imageUrl || 'https://placehold.co/300x200/e2e8f0/64748b?text=Billede'}" alt="${recipe.name}" onerror="this.onerror=null;this.src='https://placehold.co/300x200/e2e8f0/64748b?text=Billede';">
            <div class="recipe-card-content">
                <h3>${recipe.name}</h3>
                <p class="recipe-tags">${recipe.tags ? recipe.tags.join(', ') : 'Ingen tags'}</p>
                <div class="recipe-card-actions">
                    <button class="cook-now-btn" data-id="${recipe.id}">Lav nu</button>
                    <button class="edit-recipe-btn" data-id="${recipe.id}">Rediger</button>
                </div>
            </div>
        `;
        recipeGrid.appendChild(card);
    });
}

// Funktion til at håndtere klik på opskriftskort
function handleRecipeGridClick(event) {
    const recipeId = event.target.dataset.id;
    if (!recipeId) return;

    if (event.target.classList.contains('cook-now-btn')) {
        confirmAndDeductIngredients(recipeId);
        // Midlertidig succes-besked
        alert(`Ingredienser for opskriften er nu fratrukket lageret (simuleret).`);
    } else if (event.target.classList.contains('edit-recipe-btn')) {
        handleEditRecipe(recipeId);
    }
}

// Funktion til at åbne redigerings-modalen med den valgte opskrifts data
function handleEditRecipe(recipeId) {
    const recipe = state.recipes.find(r => r.id === recipeId);
    if (!recipe) {
        handleError(new Error("Opskrift ikke fundet"), "Kunne ikke finde den valgte opskrift.");
        return;
    }

    const form = document.getElementById('recipe-form');
    document.getElementById('recipe-edit-modal-title').textContent = 'Rediger Opskrift';
    
    form.dataset.id = recipe.id;
    form.name.value = recipe.name || '';
    form.description.value = recipe.description || '';
    form.imageUrl.value = recipe.imageUrl || '';
    form.tags.value = (recipe.tags || []).join(', ');

    showModal('recipe-edit-modal');
}

// Funktion til at gemme en ny eller eksisterende opskrift
async function handleSaveRecipe(event) {
    event.preventDefault();
    if (!state.currentUser) return;

    const form = event.target;
    const recipeId = form.dataset.id;
    const recipeData = {
        userId: state.currentUser.uid,
        name: form.name.value,
        description: form.description.value,
        imageUrl: form.imageUrl.value,
        tags: form.tags.value.split(',').map(tag => tag.trim()).filter(tag => tag), // Fjern tomme tags
    };

    try {
        if (recipeId) {
            const recipeRef = doc(db, 'recipes', recipeId);
            await updateDoc(recipeRef, recipeData);
        } else {
            recipeData.createdAt = serverTimestamp();
            await addDoc(collection(db, 'recipes'), recipeData);
        }
        hideModal('recipe-edit-modal');
        // Da vi bruger realtime listeners, vil siden opdatere sig selv.
    } catch (error) {
        handleError(error, "Kunne ikke gemme opskriften.", "handleSaveRecipe");
    }
}
