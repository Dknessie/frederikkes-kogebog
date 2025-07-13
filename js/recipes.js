// js/recipes.js

// Handles all logic for the recipes page and recipe modals.

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError, navigateTo } from './ui.js';
import { normalizeUnit, convertToPrimaryUnit } from './utils.js';
import { addToKitchenCounterFromRecipe } from './kitchenCounter.js';
import { openPlanMealModal } from './mealPlanner.js';

let appState;
let appElements;

const lazyImageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.remove("lazy-load");
            observer.unobserve(img);
        }
    });
});

/**
 * Initializes the recipes module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initRecipes(state, elements) {
    appState = state;
    appElements = elements;

    appElements.sortByStockToggle.addEventListener('change', renderRecipes);
    appElements.addRecipeBtn.addEventListener('click', openAddRecipeModal);
    appElements.addIngredientBtn.addEventListener('click', () => createIngredientRow(appElements.ingredientsContainer));
    appElements.importIngredientsBtn.addEventListener('click', handleImportIngredients);
    appElements.recipeForm.addEventListener('submit', handleSaveRecipe);
    appElements.recipeGrid.addEventListener('click', handleGridClick);
    
    // Edit modal listeners
    appElements.recipeEditModal.addEventListener('click', (e) => {
        if (e.target.closest('.remove-ingredient-btn')) {
            e.target.closest('.ingredient-row').remove();
        }
    });
    appElements.recipeImageUploadInput.addEventListener('change', handleImageUpload);
    appElements.recipeImageUrlInput.addEventListener('input', handleImageUrlInput);

    // Read modal listeners
    appElements.readViewPlanBtn.addEventListener('click', () => {
        appElements.recipeReadModal.classList.add('hidden');
        openPlanMealModal(appState.currentlyViewedRecipeId);
    });
    appElements.readViewCookBtn.addEventListener('click', async () => {
        await addToKitchenCounterFromRecipe(appState.currentlyViewedRecipeId);
        appElements.recipeReadModal.classList.add('hidden');
    });
    appElements.readViewEditBtn.addEventListener('click', openEditRecipeModal);
    appElements.readViewDeleteBtn.addEventListener('click', handleDeleteRecipeFromReadView);
}

/**
 * Renders the recipe grid based on current state and filters.
 */
export function renderRecipes() {
    const fragment = document.createDocumentFragment();
    appElements.recipeGrid.innerHTML = '';
    
    let recipesToRender = appState.recipes.map(calculateRecipeMatch);

    if (appState.activeRecipeFilterTags.size > 0) {
        recipesToRender = recipesToRender.filter(r => {
            if (!r.tags) return false;
            return [...appState.activeRecipeFilterTags].every(tag => r.tags.includes(tag));
        });
    }
    
    if (appElements.sortByStockToggle.checked) {
        recipesToRender.sort((a, b) => {
            if (a.missingCount !== b.missingCount) {
                return a.missingCount - b.missingCount;
            }
            return a.title.localeCompare(b.title);
        });
    } else {
        recipesToRender.sort((a,b) => a.title.localeCompare(b.title));
    }

    if (recipesToRender.length === 0) {
        appElements.recipeGrid.innerHTML = `<p class="empty-state">Ingen opskrifter matcher dine valg.</p>`;
        return;
    }

    recipesToRender.forEach(recipe => {
        const card = createRecipeCard(recipe);
        fragment.appendChild(card);
    });
    appElements.recipeGrid.appendChild(fragment);
    document.querySelectorAll('.lazy-load').forEach(img => lazyImageObserver.observe(img));
}

/**
 * Creates a single recipe card element.
 * @param {object} recipe - The recipe data object.
 * @returns {HTMLElement} The recipe card element.
 */
function createRecipeCard(recipe) {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.dataset.id = recipe.id;
    
    let statusClass = 'status-red';
    let statusTitle = `Mangler ${recipe.missingCount} ingrediens(er)`;
    if (recipe.missingCount === 0) {
        statusClass = 'status-green';
        statusTitle = 'Du har alle ingredienser';
    } else if (recipe.missingCount === 1) {
        statusClass = 'status-yellow';
        statusTitle = 'Mangler 1 ingrediens';
    }

    const isFavoriteClass = recipe.is_favorite ? 'fas is-favorite' : 'far';
    const imageUrl = recipe.imageBase64 || recipe.imageUrl || `https://placehold.co/400x300/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title)}`;
    const tagsHTML = (recipe.tags && recipe.tags.length > 0) 
        ? recipe.tags.map(tag => `<span class="recipe-card-tag">${tag}</span>`).join('')
        : '';

    card.innerHTML = `
        <div class="status-indicator ${statusClass}" title="${statusTitle}"></div>
        <img data-src="${imageUrl}" alt="Billede af ${recipe.title}" class="recipe-card-image lazy-load" loading="lazy" onerror="this.onerror=null;this.src='https://placehold.co/400x300/f3f0e9/d1603d?text=Billede+mangler';">
        <div class="recipe-card-content">
            <span class="recipe-card-category">${recipe.category || 'Ukategoriseret'}</span>
            <h4>${recipe.title}</h4>
            <div class="recipe-card-tags">${tagsHTML}</div>
        </div>
        <div class="recipe-card-actions">
            <i class="${isFavoriteClass} fa-heart favorite-icon" title="Marker som favorit"></i>
            <button class="btn-icon add-to-plan-btn" title="Føj til madplan"><i class="fas fa-calendar-plus"></i></button>
            <button class="btn-icon cook-meal-btn" title="Læg på Køkkenbord"><i class="fas fa-concierge-bell"></i></button>
            <button class="btn-icon delete-recipe-btn" title="Slet opskrift"><i class="fas fa-trash"></i></button>
        </div>`;
    return card;
}

/**
 * Renders the tag filters for the recipes page.
 */
export function renderPageTagFilters() {
    const container = appElements.recipeFilterContainer;
    const allTags = new Set();
    appState.recipes.forEach(r => {
        if (r.tags) r.tags.forEach(tag => allTags.add(tag));
    });

    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    [...allTags].sort().forEach(tag => {
        const tagButton = document.createElement('button');
        const isActive = appState.activeRecipeFilterTags.has(tag);
        tagButton.className = `filter-tag ${isActive ? 'active' : ''}`;
        tagButton.innerHTML = isActive ? `<i class="fas fa-check"></i> ${tag}` : tag;
        
        tagButton.addEventListener('click', () => {
            if (appState.activeRecipeFilterTags.has(tag)) {
                appState.activeRecipeFilterTags.delete(tag);
            } else {
                appState.activeRecipeFilterTags.add(tag);
            }
            renderPageTagFilters(); // Re-render filters to update their style
            renderRecipes(); // Re-render recipes with the new filter
        });
        fragment.appendChild(tagButton);
    });
    container.appendChild(fragment);
}


/**
 * Renders the read-only view of a recipe in a modal.
 * @param {object} recipe - The recipe to display.
 */
function renderReadView(recipe) {
    const imageUrl = recipe.imageBase64 || recipe.imageUrl || `https://placehold.co/600x400/f3f0e9/d1603d?text=${encodeURIComponent(recipe.title)}`;
    document.getElementById('read-view-image').src = imageUrl;

    document.getElementById('read-view-title').textContent = recipe.title;
    document.getElementById('read-view-category').textContent = recipe.category || '';
    document.getElementById('read-view-time').innerHTML = `<i class="fas fa-clock"></i> ${recipe.time || '?'} min.`;
    document.getElementById('read-view-portions').innerHTML = `<i class="fas fa-users"></i> ${recipe.portions || '?'} portioner`;
    
    // This calculation requires access to inventory state.
    // We assume it's available via appState.
    const recipePrice = calculateRecipePrice(recipe, appState.inventory);
    appElements.readViewPrice.innerHTML = `<i class="fas fa-coins"></i> ${recipePrice > 0 ? `~${recipePrice.toFixed(2)} kr.` : 'Pris ukendt'}`;

    const tagsContainer = document.getElementById('read-view-tags');
    tagsContainer.innerHTML = '';
    if (recipe.tags && recipe.tags.length > 0) {
        recipe.tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'recipe-card-tag';
            tagEl.textContent = tag;
            tagsContainer.appendChild(tagEl);
        });
    }
    
    document.getElementById('read-view-notes').textContent = recipe.notes || '';
    
    const ingredientsList = document.getElementById('read-view-ingredients-list');
    ingredientsList.innerHTML = '';
    if (recipe.ingredients && recipe.ingredients.length > 0) {
        recipe.ingredients.forEach(ing => {
            const li = document.createElement('li');
            const { canBeMade } = calculateRecipeMatch({ ingredients: [ing] });
            
            const statusIcon = canBeMade 
                ? `<span class="ingredient-stock-status in-stock"><i class="fas fa-check-circle"></i></span>`
                : `<span class="ingredient-stock-status out-of-stock"><i class="fas fa-times-circle"></i></span>`;

            li.innerHTML = `<span>${ing.quantity || ''} ${ing.unit || ''} ${ing.name}</span> ${statusIcon}`;
            ingredientsList.appendChild(li);
        });
    }
    
    const instructionsContainer = document.getElementById('read-view-instructions-text');
    instructionsContainer.innerHTML = ''; // Clear previous
    const instructions = recipe.instructions || '';
    instructions.split('\n').forEach(line => {
        if (line.trim() !== '') {
            const p = document.createElement('p');
            p.textContent = line;
            instructionsContainer.appendChild(p);
        }
    });
    
    appState.currentlyViewedRecipeId = recipe.id;
    appElements.recipeReadModal.classList.remove('hidden');
}


function createIngredientRow(container, ingredient = { name: '', quantity: '', unit: '' }) {
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.innerHTML = `
        <input type="text" class="ingredient-name" placeholder="Ingrediensnavn" value="${ingredient.name}" required>
        <input type="number" step="any" class="ingredient-quantity" placeholder="Antal" value="${ingredient.quantity}">
        <input type="text" class="ingredient-unit" placeholder="Enhed" value="${ingredient.unit}">
        <button type="button" class="btn-icon remove-ingredient-btn"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);

    const nameInput = row.querySelector('.ingredient-name');
    const removeAutocomplete = () => {
        const suggestions = row.querySelector('.autocomplete-suggestions');
        if (suggestions) suggestions.remove();
    };
    
    nameInput.addEventListener('input', (e) => {
        const value = e.target.value.toLowerCase();
        removeAutocomplete();
        if (value.length < 1) return;

        const suggestions = appState.inventory.filter(item => 
            item.name.toLowerCase().startsWith(value) || 
            (item.aliases && item.aliases.some(alias => alias.toLowerCase().startsWith(value)))
        );

        if (suggestions.length > 0) {
            const suggestionsContainer = document.createElement('div');
            suggestionsContainer.className = 'autocomplete-suggestions';
            suggestions.slice(0, 5).forEach(item => {
                const suggestionDiv = document.createElement('div');
                suggestionDiv.className = 'autocomplete-suggestion';
                suggestionDiv.innerHTML = item.name.replace(new RegExp(`^${value}`, 'i'), `<strong>$&</strong>`);
                
                suggestionDiv.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    nameInput.value = item.name;
                    row.querySelector('.ingredient-unit').value = item.unit || '';
                    removeAutocomplete();
                });
                suggestionsContainer.appendChild(suggestionDiv);
            });
            row.appendChild(suggestionsContainer);
        }
    });
    nameInput.addEventListener('blur', () => setTimeout(removeAutocomplete, 150));
}

function handleImportIngredients() {
    const text = appElements.recipeImportTextarea.value;
    if (!text) return;

    const lines = text.split('\n');
    appElements.ingredientsContainer.innerHTML = ''; 
    
    const knownUnits = ['g', 'gram', 'grams', 'kg', 'ml', 'l', 'stk', 'tsk', 'spsk', 'dl', 'fed', 'dåse'];
    const unitRegex = new RegExp(`^(${knownUnits.join('|')})s?(\\.|s)?`, 'i');

    lines.forEach(line => {
        line = line.trim();
        if (line === '') return;

        let quantity = '';
        let unit = '';
        let name = '';

        line = line.replace(/^[-*]\s*/, '');
        const quantityMatch = line.match(/^[\d.,]+/);
        if (quantityMatch) {
            quantity = quantityMatch[0].replace(',', '.');
            line = line.substring(quantityMatch[0].length).trim();
        }

        const unitMatch = line.match(unitRegex);
        if (unitMatch) {
            unit = unitMatch[0];
            line = line.substring(unitMatch[0].length).trim();
        }

        if (quantity && !unit) {
            unit = 'stk';
        }
        
        name = line.replace(/^af\s+/, '').trim();
        if (name) {
            name = name.charAt(0).toUpperCase() + name.slice(1);
        }
        
        const ingredientData = {
            name: name,
            quantity: quantity ? parseFloat(quantity) : '',
            unit: normalizeUnit(unit)
        };

        createIngredientRow(appElements.ingredientsContainer, ingredientData);
    });
    appElements.recipeImportTextarea.value = '';
}

async function handleSaveRecipe(e) {
    e.preventDefault();
    const recipeId = document.getElementById('recipe-id').value;
    const ingredients = [];
    appElements.ingredientsContainer.querySelectorAll('.ingredient-row').forEach(row => {
        const name = row.querySelector('.ingredient-name').value.trim();
        const quantity = row.querySelector('.ingredient-quantity').value;
        const unit = row.querySelector('.ingredient-unit').value.trim();
        if (name) {
            ingredients.push({ name, quantity: Number(quantity) || null, unit });
        }
    });

    const tags = document.getElementById('recipe-tags').value.split(',').map(tag => tag.trim()).filter(tag => tag);

    const recipeData = {
        title: document.getElementById('recipe-title').value,
        category: document.getElementById('recipe-category').value,
        tags: tags,
        portions: Number(document.getElementById('recipe-portions').value) || null,
        time: Number(document.getElementById('recipe-time').value) || null,
        notes: document.getElementById('recipe-notes').value,
        instructions: document.getElementById('recipe-instructions').value,
        source_url: document.getElementById('recipe-source-url').value,
        ingredients: ingredients,
        is_favorite: appState.recipes.find(r => r.id === recipeId)?.is_favorite || false,
        imageUrl: null,
        imageBase64: null,
    };

    if (appState.recipeFormImage.type === 'url') {
        recipeData.imageUrl = appState.recipeFormImage.data;
    } else if (appState.recipeFormImage.type === 'base64') {
        recipeData.imageBase64 = appState.recipeFormImage.data;
    }

    try {
        if (recipeId) {
            await updateDoc(doc(db, 'recipes', recipeId), recipeData);
        } else {
            await addDoc(collection(db, 'recipes'), recipeData);
        }
        appElements.recipeEditModal.classList.add('hidden');
    } catch (error) {
        handleError(error, "Opskriften kunne ikke gemmes.", "saveRecipe");
    }
}

async function handleGridClick(e) {
    const card = e.target.closest('.recipe-card');
    if (!card) return;
    const docId = card.dataset.id;
    
    if (e.target.closest('.favorite-icon')) {
        const isCurrentlyFavorite = e.target.closest('.favorite-icon').classList.contains('is-favorite');
        try {
            await updateDoc(doc(db, 'recipes', docId), { is_favorite: !isCurrentlyFavorite });
        } catch (error) { handleError(error, "Kunne ikke opdatere favoritstatus.", "toggleFavorite"); }
        return;
    }
    
    if (e.target.closest('.add-to-plan-btn')) {
        openPlanMealModal(docId);
        return;
    }

    if (e.target.closest('.cook-meal-btn')) {
        await addToKitchenCounterFromRecipe(docId);
        return;
    }

    if (e.target.closest('.delete-recipe-btn')) {
        e.stopPropagation(); 
        const confirmed = await showNotification({title: "Slet Opskrift", message: "Er du sikker på, du vil slette denne opskrift?", type: 'confirm'});
        if(confirmed) {
            try {
                await deleteDoc(doc(db, 'recipes', docId));
                showNotification({title: "Slettet", message: "Opskriften er blevet slettet."});
            } catch (error) {
                handleError(error, "Opskriften kunne ikke slettes.", "deleteRecipe");
            }
        }
        return;
    }

    const recipe = appState.recipes.find(r => r.id === docId);
    if (recipe) {
        renderReadView(recipe);
    }
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            appElements.recipeImagePreview.src = event.target.result;
            appState.recipeFormImage = { type: 'base64', data: event.target.result };
            appElements.recipeImageUrlInput.value = '';
        };
        reader.readAsDataURL(file);
    }
}

function handleImageUrlInput(e) {
    const url = e.target.value;
    appElements.recipeImagePreview.src = url || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Vælg+billede';
    if (url) {
        appState.recipeFormImage = { type: 'url', data: url };
        appElements.recipeImageUploadInput.value = '';
    }
}

function openAddRecipeModal() {
    appElements.recipeEditModalTitle.textContent = 'Tilføj ny opskrift';
    appElements.recipeForm.reset();
    document.getElementById('recipe-id').value = '';
    appElements.ingredientsContainer.innerHTML = '';
    appElements.recipeImagePreview.src = 'https://placehold.co/600x400/f3f0e9/d1603d?text=Vælg+billede';
    appState.recipeFormImage = { type: null, data: null };
    createIngredientRow(appElements.ingredientsContainer);
    appElements.recipeEditModal.classList.remove('hidden');
}

function openEditRecipeModal() {
    const recipe = appState.recipes.find(r => r.id === appState.currentlyViewedRecipeId);
    if (recipe) {
        appElements.recipeReadModal.classList.add('hidden');
        
        appElements.recipeEditModalTitle.textContent = 'Rediger opskrift';
        appElements.recipeForm.reset();
        appState.recipeFormImage = { type: null, data: null };

        document.getElementById('recipe-id').value = recipe.id;
        document.getElementById('recipe-title').value = recipe.title || '';
        document.getElementById('recipe-category').value = recipe.category || '';
        document.getElementById('recipe-tags').value = (recipe.tags && recipe.tags.join(', ')) || '';
        document.getElementById('recipe-portions').value = recipe.portions || '';
        document.getElementById('recipe-time').value = recipe.time || '';
        document.getElementById('recipe-notes').value = recipe.notes || '';
        document.getElementById('recipe-instructions').value = recipe.instructions || '';
        document.getElementById('recipe-source-url').value = recipe.source_url || '';
        
        const imageUrl = recipe.imageBase64 || recipe.imageUrl;
        appElements.recipeImagePreview.src = imageUrl || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Vælg+billede';
        if(recipe.imageUrl) {
            appElements.recipeImageUrlInput.value = recipe.imageUrl;
            appState.recipeFormImage = { type: 'url', data: recipe.imageUrl };
        } else if (recipe.imageBase64) {
            appState.recipeFormImage = { type: 'base64', data: recipe.imageBase64 };
        }

        appElements.ingredientsContainer.innerHTML = '';
        if (recipe.ingredients && recipe.ingredients.length > 0) {
            recipe.ingredients.forEach(ing => createIngredientRow(appElements.ingredientsContainer, ing));
        } else {
            createIngredientRow(appElements.ingredientsContainer);
        }
        appElements.recipeEditModal.classList.remove('hidden');
    }
}

async function handleDeleteRecipeFromReadView() {
    const recipeId = appState.currentlyViewedRecipeId;
    if (!recipeId) return;

    const confirmed = await showNotification({title: "Slet Opskrift", message: "Er du sikker på, du vil slette denne opskrift?", type: 'confirm'});
    if(confirmed) {
        try {
            await deleteDoc(doc(db, 'recipes', recipeId));
            appElements.recipeReadModal.classList.add('hidden');
            showNotification({title: "Slettet", message: "Opskriften er blevet slettet."});
        } catch (error) {
            handleError(error, "Opskriften kunne ikke slettes.", "deleteRecipeFromReadView");
        }
    }
}

export function calculateRecipeMatch(recipe) {
    let missingCount = 0;
    if (!recipe.ingredients || recipe.ingredients.length === 0) {
        return { ...recipe, missingCount: 99, canBeMade: false };
    }

    let canBeMade = true;
    recipe.ingredients.forEach(ing => {
        const inventoryItem = appState.inventory.find(item => item.name.toLowerCase() === ing.name.toLowerCase() || (item.aliases || []).includes(ing.name.toLowerCase()));
        if (!inventoryItem) {
            missingCount++;
            canBeMade = false;
            return;
        }
        
        const conversionResult = convertToPrimaryUnit(ing.quantity, ing.unit, inventoryItem);
        if(conversionResult.error) {
            missingCount++;
            canBeMade = false;
            return;
        }

        if (conversionResult.convertedQuantity !== null) {
            const neededInGrams = conversionResult.convertedQuantity;
            const inStockInGrams = inventoryItem.grams_in_stock || 0;
            if (neededInGrams > inStockInGrams) {
                missingCount++;
                canBeMade = false;
            }
        } else if (conversionResult.directMatch) {
            const inStock = inventoryItem.current_stock || 0;
            if (conversionResult.quantity > inStock) {
                missingCount++;
                canBeMade = false;
            }
        } else {
            missingCount++;
            canBeMade = false;
        }
    });
    return { ...recipe, missingCount, canBeMade };
}

export function calculateRecipePrice(recipe, inventory) {
    let totalPrice = 0;
    if (!recipe.ingredients) return 0;

    recipe.ingredients.forEach(ing => {
        const inventoryItem = inventory.find(inv => inv.name.toLowerCase() === ing.name.toLowerCase());
        if(inventoryItem && inventoryItem.kg_price) {
            const quantityInKg = getQuantityInKg(ing.quantity, ing.unit, inventoryItem);
            if (quantityInKg !== null) {
                totalPrice += quantityInKg * inventoryItem.kg_price;
            }
        }
    });
    return totalPrice;
}

function getQuantityInKg(quantity, unit, inventoryItem) {
    if (inventoryItem && inventoryItem.buy_as_whole_unit && inventoryItem.purchase_unit) {
        return (inventoryItem.purchase_unit.quantity * quantity) / 1000;
    }
    const conversion = convertToPrimaryUnit(quantity, unit, inventoryItem);
    if(conversion.convertedQuantity !== null) {
        return conversion.convertedQuantity / 1000;
    }
    return null; 
}
