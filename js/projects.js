// js/projects.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { normalizeUnit } from './utils.js';

let appState;
let appElements;

/**
 * Initializes the projects module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initProjects(state, elements) {
    appState = state;
    appElements = elements;

    appElements.addProjectBtn.addEventListener('click', openAddProjectModal);
    appElements.projectForm.addEventListener('submit', handleSaveProject);
    appElements.projectsGrid.addEventListener('click', handleGridClick);
    appElements.addMaterialBtn.addEventListener('click', () => createMaterialRow(appElements.projectMaterialsContainer));
    
    appElements.projectEditModal.addEventListener('click', (e) => {
        if (e.target.closest('.remove-ingredient-btn')) { // Using same class for simplicity
            e.target.closest('.ingredient-row').remove();
        }
    });
}

/**
 * Renders the projects on the "Hjem" page.
 */
export function renderProjects() {
    const fragment = document.createDocumentFragment();
    appElements.projectsGrid.innerHTML = '';
    
    let projectsToRender = [...appState.projects];

    projectsToRender.sort((a,b) => a.title.localeCompare(b.title));

    if (projectsToRender.length === 0) {
        appElements.projectsGrid.innerHTML = `<p class="empty-state">Du har ingen projekter endnu. Klik på knappen for at tilføje dit første!</p>`;
        return;
    }

    projectsToRender.forEach(project => {
        const card = createProjectCard(project);
        fragment.appendChild(card);
    });
    appElements.projectsGrid.appendChild(fragment);
}

/**
 * Creates a card element for a single project.
 * @param {object} project - The project data.
 * @returns {HTMLElement} The created card element.
 */
function createProjectCard(project) {
    const card = document.createElement('div');
    card.className = 'recipe-card'; // Reusing recipe card styling
    card.dataset.id = project.id;
    
    const tagsHTML = (project.tags && project.tags.length > 0) 
        ? project.tags.map(tag => `<span class="recipe-card-tag">${tag}</span>`).join('')
        : '';

    card.innerHTML = `
        <div class="recipe-card-content">
            <span class="recipe-card-category">${project.category || 'Ukategoriseret'}</span>
            <h4>${project.title}</h4>
            <div class="recipe-card-tags">${tagsHTML}</div>
        </div>
        <div class="recipe-card-actions">
            <button class="btn-icon edit-project-btn" title="Rediger Projekt"><i class="fas fa-edit"></i></button>
            <button class="btn-icon delete-project-btn" title="Slet Projekt"><i class="fas fa-trash"></i></button>
        </div>`;
    return card;
}

/**
 * Creates a row for adding a material in the project modal.
 * @param {HTMLElement} container - The container to append the row to.
 * @param {object} [material={}] - Optional material data to pre-fill the row.
 */
function createMaterialRow(container, material = {}) {
    const row = document.createElement('div');
    row.className = 'ingredient-row'; // Reusing recipe style
    row.innerHTML = `
        <input type="text" class="ingredient-name" placeholder="Materiale/Værktøj" value="${material.name || ''}" required>
        <input type="number" step="any" class="ingredient-quantity" placeholder="Antal" value="${material.quantity || ''}">
        <input type="text" class="ingredient-unit" placeholder="Enhed" value="${material.unit || ''}">
        <input type="text" class="ingredient-note-input" placeholder="Note (f.eks. 4x4 tommer)" value="${material.note || ''}">
        <button type="button" class="btn-icon remove-ingredient-btn"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);
}

/**
 * Handles saving a project from the modal form.
 * @param {Event} e - The form submission event.
 */
async function handleSaveProject(e) {
    e.preventDefault();
    const projectId = document.getElementById('project-id').value;
    const materials = [];
    appElements.projectMaterialsContainer.querySelectorAll('.ingredient-row').forEach(row => {
        const name = row.querySelector('.ingredient-name').value.trim();
        const quantity = row.querySelector('.ingredient-quantity').value;
        const unit = row.querySelector('.ingredient-unit').value.trim();
        const note = row.querySelector('.ingredient-note-input').value.trim();
        if (name) {
            materials.push({ 
                name, 
                quantity: Number(quantity) || null, 
                unit: normalizeUnit(unit),
                note: note || null 
            });
        }
    });

    const tags = document.getElementById('project-tags').value.split(',').map(tag => tag.trim()).filter(tag => tag);

    const projectData = {
        title: document.getElementById('project-title').value,
        category: document.getElementById('project-category').value,
        tags: tags,
        scope: document.getElementById('project-scope').value || null,
        time: Number(document.getElementById('project-time').value) || null,
        instructions: document.getElementById('project-instructions').value,
        source_url: document.getElementById('project-source-url').value,
        materials: materials,
        userId: appState.currentUser.uid
    };

    try {
        if (projectId) {
            await updateDoc(doc(db, 'projects', projectId), projectData);
        } else {
            await addDoc(collection(db, 'projects'), projectData);
        }
        appElements.projectEditModal.classList.add('hidden');
    } catch (error) {
        handleError(error, "Projektet kunne ikke gemmes.", "saveProject");
    }
}

/**
 * Handles clicks within the projects grid (edit, delete).
 * @param {Event} e - The click event.
 */
async function handleGridClick(e) {
    const card = e.target.closest('.recipe-card');
    if (!card) return;
    const docId = card.dataset.id;
    
    if (e.target.closest('.edit-project-btn')) {
        openEditProjectModal(docId);
        return;
    }

    if (e.target.closest('.delete-project-btn')) {
        e.stopPropagation(); 
        const confirmed = await showNotification({title: "Slet Projekt", message: "Er du sikker på, du vil slette dette projekt?", type: 'confirm'});
        if(confirmed) {
            try {
                await deleteDoc(doc(db, 'projects', docId));
                showNotification({title: "Slettet", message: "Projektet er blevet slettet."});
            } catch (error) {
                handleError(error, "Projektet kunne ikke slettes.", "deleteProject");
            }
        }
        return;
    }
}

/**
 * Opens the modal to add a new project.
 */
function openAddProjectModal() {
    appElements.projectEditModal.querySelector('h3').textContent = 'Tilføj nyt projekt';
    appElements.projectForm.reset();
    document.getElementById('project-id').value = '';
    appElements.projectMaterialsContainer.innerHTML = '';
    createMaterialRow(appElements.projectMaterialsContainer);
    appElements.projectEditModal.classList.remove('hidden');
}

/**
 * Opens the modal to edit an existing project.
 * @param {string} projectId - The ID of the project to edit.
 */
function openEditProjectModal(projectId) {
    const project = appState.projects.find(p => p.id === projectId);
    if (project) {
        appElements.projectEditModal.querySelector('h3').textContent = 'Rediger Projekt';
        appElements.projectForm.reset();

        document.getElementById('project-id').value = project.id;
        document.getElementById('project-title').value = project.title || '';
        document.getElementById('project-category').value = project.category || '';
        document.getElementById('project-tags').value = (project.tags && project.tags.join(', ')) || '';
        document.getElementById('project-scope').value = project.scope || '';
        document.getElementById('project-time').value = project.time || '';
        document.getElementById('project-instructions').value = project.instructions || '';
        document.getElementById('project-source-url').value = project.source_url || '';
        
        appElements.projectMaterialsContainer.innerHTML = '';
        if (project.materials && project.materials.length > 0) {
            project.materials.forEach(mat => createMaterialRow(appElements.projectMaterialsContainer, mat));
        } else {
            createMaterialRow(appElements.projectMaterialsContainer);
        }
        appElements.projectEditModal.classList.remove('hidden');
    }
}
