// js/projects.js

import { db } from './firebase.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showNotification, handleError } from './ui.js';
import { normalizeUnit } from './utils.js';

let appState;
let appElements;
let projectFormImageBefore = { type: null, data: null };
let projectFormImageAfter = { type: null, data: null };

/**
 * Initializes the projects module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initProjects(state, elements) {
    appState = state;
    appElements = {
        ...elements,
        projectImagePreviewBefore: document.getElementById('project-image-preview-before'),
        projectImageUploadBefore: document.getElementById('project-image-upload-before'),
        projectImageUrlInputBefore: document.getElementById('project-imageUrl-before'),
        projectImagePreviewAfter: document.getElementById('project-image-preview-after'),
        projectImageUploadAfter: document.getElementById('project-image-upload-after'),
        projectImageUrlInputAfter: document.getElementById('project-imageUrl-after'),
        addMissingMaterialsBtn: document.getElementById('add-missing-materials-btn'),
    };

    appElements.addProjectBtn.addEventListener('click', openAddProjectModal);
    appElements.projectForm.addEventListener('submit', handleSaveProject);
    appElements.projectsGrid.addEventListener('click', handleGridClick);
    appElements.addMaterialBtn.addEventListener('click', () => createMaterialRow(appElements.projectMaterialsContainer));
    
    appElements.projectEditModal.addEventListener('click', (e) => {
        if (e.target.closest('.remove-ingredient-btn')) { // Using same class for simplicity
            e.target.closest('.ingredient-row').remove();
        }
    });

    // Event listeners for image handling
    appElements.projectImageUploadBefore.addEventListener('change', (e) => handleImageUpload(e, 'before'));
    appElements.projectImageUrlInputBefore.addEventListener('input', (e) => handleImageUrlInput(e, 'before'));
    appElements.projectImageUploadAfter.addEventListener('change', (e) => handleImageUpload(e, 'after'));
    appElements.projectImageUrlInputAfter.addEventListener('input', (e) => handleImageUrlInput(e, 'after'));

    appElements.addMissingMaterialsBtn.addEventListener('click', handleAddMissingMaterials);
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
    
    const imageUrl = project.imageBase64Before || project.imageUrlBefore || `https://placehold.co/400x300/f3f0e9/d1603d?text=${encodeURIComponent(project.title)}`;

    card.innerHTML = `
        <img src="${imageUrl}" alt="Før billede af ${project.title}" class="recipe-card-image" onerror="this.onerror=null;this.src='https://placehold.co/400x300/f3f0e9/d1603d?text=Billede+mangler';">
        <div class="recipe-card-content">
            <span class="recipe-card-category">${project.room || project.category || 'Ukategoriseret'}</span>
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
        room: document.getElementById('project-room').value || null,
        time: {
            days: Number(document.getElementById('project-time-days').value) || null,
            hours: Number(document.getElementById('project-time-hours').value) || null,
        },
        instructions: document.getElementById('project-instructions').value,
        source_url: document.getElementById('project-source-url').value,
        materials: materials,
        userId: appState.currentUser.uid,
        imageUrlBefore: projectFormImageBefore.type === 'url' ? projectFormImageBefore.data : null,
        imageBase64Before: projectFormImageBefore.type === 'base64' ? projectFormImageBefore.data : null,
        imageUrlAfter: projectFormImageAfter.type === 'url' ? projectFormImageAfter.data : null,
        imageBase64After: projectFormImageAfter.type === 'base64' ? projectFormImageAfter.data : null,
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

function populateReferenceDropdown(selectElement, options, placeholder, currentValue) {
    if (!selectElement) return;
    selectElement.innerHTML = `<option value="">${placeholder}</option>`;
    (options || []).sort().forEach(opt => selectElement.add(new Option(opt, opt)));
    selectElement.value = currentValue || "";
}

/**
 * Opens the modal to add a new project.
 */
function openAddProjectModal() {
    appElements.projectEditModal.querySelector('h3').textContent = 'Tilføj nyt projekt';
    appElements.projectForm.reset();
    document.getElementById('project-id').value = '';
    appElements.projectMaterialsContainer.innerHTML = '';
    
    // Reset images
    projectFormImageBefore = { type: null, data: null };
    projectFormImageAfter = { type: null, data: null };
    appElements.projectImagePreviewBefore.src = 'https://placehold.co/600x400/f3f0e9/d1603d?text=Før';
    appElements.projectImagePreviewAfter.src = 'https://placehold.co/600x400/f3f0e9/d1603d?text=Efter';

    populateReferenceDropdown(document.getElementById('project-room'), appState.references.rooms, 'Vælg et rum...');

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
        
        populateReferenceDropdown(document.getElementById('project-room'), appState.references.rooms, 'Vælg et rum...', project.room);
        
        document.getElementById('project-time-days').value = project.time?.days || '';
        document.getElementById('project-time-hours').value = project.time?.hours || '';
        
        document.getElementById('project-instructions').value = project.instructions || '';
        document.getElementById('project-source-url').value = project.source_url || '';
        
        // Handle images
        projectFormImageBefore = { 
            type: project.imageUrlBefore ? 'url' : (project.imageBase64Before ? 'base64' : null),
            data: project.imageUrlBefore || project.imageBase64Before
        };
        projectFormImageAfter = { 
            type: project.imageUrlAfter ? 'url' : (project.imageBase64After ? 'base64' : null),
            data: project.imageUrlAfter || project.imageBase64After
        };

        appElements.projectImagePreviewBefore.src = projectFormImageBefore.data || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Før';
        appElements.projectImageUrlInputBefore.value = project.imageUrlBefore || '';
        appElements.projectImagePreviewAfter.src = projectFormImageAfter.data || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Efter';
        appElements.projectImageUrlInputAfter.value = project.imageUrlAfter || '';

        appElements.projectMaterialsContainer.innerHTML = '';
        if (project.materials && project.materials.length > 0) {
            project.materials.forEach(mat => createMaterialRow(appElements.projectMaterialsContainer, mat));
        } else {
            createMaterialRow(appElements.projectMaterialsContainer);
        }
        appElements.projectEditModal.classList.remove('hidden');
    }
}

// Image Handling Functions
function handleImageUpload(e, type) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const imageData = { type: 'base64', data: event.target.result };
        if (type === 'before') {
            projectFormImageBefore = imageData;
            appElements.projectImagePreviewBefore.src = event.target.result;
            appElements.projectImageUrlInputBefore.value = '';
        } else {
            projectFormImageAfter = imageData;
            appElements.projectImagePreviewAfter.src = event.target.result;
            appElements.projectImageUrlInputAfter.value = '';
        }
    };
    reader.readAsDataURL(file);
}

function handleImageUrlInput(e, type) {
    const url = e.target.value;
    const imageData = { type: 'url', data: url };
    if (type === 'before') {
        projectFormImageBefore = imageData;
        appElements.projectImagePreviewBefore.src = url || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Før';
        appElements.projectImageUploadBefore.value = '';
    } else {
        projectFormImageAfter = imageData;
        appElements.projectImagePreviewAfter.src = url || 'https://placehold.co/600x400/f3f0e9/d1603d?text=Efter';
        appElements.projectImageUploadAfter.value = '';
    }
}

async function handleAddMissingMaterials() {
    // This is a placeholder for the logic to add missing materials to the shopping list.
    // It will be implemented fully once the shopping list functionality is updated.
    showNotification({title: "Kommer Snart", message: "Funktionen til at tilføje manglende materialer er under udvikling."});
}
