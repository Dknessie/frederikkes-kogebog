// js/budget.js
// Dette modul håndterer logikken og visningen for den nye Budget-side.

import { initUI, handleError } from './ui.js';
import { formatDate } from './utils.js';

let appState;
let appElements;

// D3.js farveskala til diagrammet
const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

/**
 * Initializes the budget module.
 * @param {object} state - The global app state.
 * @param {object} elements - The cached DOM elements.
 */
export function initBudget(state, elements) {
    appState = state;
    appElements = elements;
}

/**
 * Renders the entire budget page.
 */
export function renderBudgetPage() {
    if (!appState.expenses || !appElements.monthlyExpensesChart) {
        return;
    }

    const monthlyExpenses = calculateMonthlyExpensesByCategory();
    renderPieChart(monthlyExpenses);
    renderCategoryList(monthlyExpenses);
}

/**
 * Calculates the total monthly expenses grouped by category.
 * @returns {Array<{category: string, amount: number}>} An array of expense objects.
 */
function calculateMonthlyExpensesByCategory() {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const expensesByCategory = {};

    appState.expenses.forEach(expense => {
        if (!expense.date || !expense.date.toDate) return;
        const expenseDate = expense.date.toDate();
        if (expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear) {
            const category = expense.category || 'Andet';
            if (!expensesByCategory[category]) {
                expensesByCategory[category] = 0;
            }
            expensesByCategory[category] += expense.amount;
        }
    });

    return Object.entries(expensesByCategory).map(([category, amount]) => ({
        category,
        amount
    }));
}

/**
 * Renders a pie chart of the monthly expenses using D3.js.
 * @param {Array<{category: string, amount: number}>} data - The expense data.
 */
function renderPieChart(data) {
    const container = appElements.monthlyExpensesChart;
    if (!container) return;
    
    // Clear previous chart
    container.innerHTML = '';
    
    if (data.length === 0) {
        container.innerHTML = '<p class="empty-state">Ingen udgifter registreret for denne måned.</p>';
        return;
    }

    const width = container.clientWidth;
    const height = 400;
    const radius = Math.min(width, height) / 2;

    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2})`);

    const pie = d3.pie()
        .sort(null)
        .value(d => d.amount);

    const arc = d3.arc()
        .innerRadius(radius * 0.6)
        .outerRadius(radius * 0.9);

    const outerArc = d3.arc()
        .innerRadius(radius * 0.9)
        .outerRadius(radius * 0.9);

    const arcs = svg.selectAll("arc")
        .data(pie(data))
        .enter()
        .append("g")
        .attr("class", "arc");

    // Pie chart slices
    arcs.append("path")
        .attr("d", arc)
        .attr("fill", d => colorScale(d.data.category))
        .transition()
        .duration(750)
        .attrTween("d", function(d) {
            const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
            return function(t) {
                return arc(i(t));
            };
        });

    // Add labels
    arcs.append("text")
        .attr("transform", d => `translate(${arc.centroid(d)})`)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .text(d => d.data.category);
}

/**
 * Renders the list of expense categories and their amounts.
 * @param {Array<{category: string, amount: number}>} data - The expense data.
 */
function renderCategoryList(data) {
    const container = appElements.expenseCategoryList;
    if (!container) return;

    if (data.length === 0) {
        container.innerHTML = '<p class="empty-state">Ingen udgifter at vise.</p>';
        return;
    }

    const total = data.reduce((sum, item) => sum + item.amount, 0);

    const listHtml = data.map(item => {
        const percentage = total > 0 ? (item.amount / total) * 100 : 0;
        return `
            <div class="category-item">
                <span class="category-name">${item.category}</span>
                <span>${item.amount.toFixed(2).replace('.', ',')} kr. (${percentage.toFixed(0)}%)</span>
            </div>
        `;
    }).join('');

    container.innerHTML = listHtml;
}

