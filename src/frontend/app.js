// Global WebSocket connection
let socket = null;

// DOM Elements
const dashboardForm = document.getElementById('dashboard-form');
const unitsContainer = document.getElementById('units-container');
const startTimeInput = document.getElementById('start-time');
const endTimeInput = document.getElementById('end-time');
const loadingIndicator = document.getElementById('loading-indicator');
const summaryContainer = document.getElementById('summary-container');
const totalProduction = document.getElementById('total-production');
const totalQuality = document.getElementById('total-quality');
const totalPerformance = document.getElementById('total-performance');
const totalOEE = document.getElementById('total-oee');
const standardViewBtn = document.getElementById('standard-view-btn');
const hourlyViewBtn = document.getElementById('hourly-view-btn');

// Track the selected units
let selectedUnits = [];

// Function to determine current shift
function getCurrentShift() {
    const currentHour = new Date().getHours();
    
    if (currentHour >= 0 && currentHour < 8) {
        return 'shift3';  // 00:00 - 08:00
    } else if (currentHour >= 8 && currentHour < 16) {
        return 'shift1';  // 08:00 - 16:00
    } else {
        return 'shift2';  // 16:00 - 24:00
    }
}

// Initialize date/time pickers with default values
function initializeDateTimePickers() {
    const now = new Date();
    
    // Determine current shift based on current time
    const currentHour = now.getHours();
    let shiftStartTime, shiftEndTime;
    let currentShift = getCurrentShift();
    
    if (currentHour >= 0 && currentHour < 8) {
        // Shift 3: 00:00 - 08:00
        shiftStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        shiftEndTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0);
    } else if (currentHour >= 8 && currentHour < 16) {
        // Shift 1: 08:00 - 16:00
        shiftStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0, 0);
        shiftEndTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 0, 0, 0);
    } else {
        // Shift 2: 16:00 - 24:00
        shiftStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 0, 0, 0);
        shiftEndTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    }
    
    // Set the inputs with the current shift times
    startTimeInput.value = formatDateTimeForInput(shiftStartTime);
    endTimeInput.value = formatDateTimeForInput(now); // Current time for end time
    
    // Update the radio buttons to reflect the current shift
    document.getElementById(`time-preset-${currentShift}`).checked = true;
}

// Format date for datetime-local input
function formatDateTimeForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Parse datetime-local input value to Date object
function parseInputDateTime(inputValue) {
    return inputValue ? new Date(inputValue) : null;
}

// Fetch production units on page load
document.addEventListener('DOMContentLoaded', () => {
    // Initialize date/time pickers
    initializeDateTimePickers();
    
    // Fetch available units
    fetchProductionUnits();
    
    // Add event listeners to radio buttons
    document.querySelectorAll('input[name="time-preset"]').forEach(radio => {
        radio.addEventListener('change', handleTimePresetChange);
    });
    
    // Check if no shift is selected and select current shift if needed
    setInterval(() => {
        const selectedShift = document.querySelector('input[name="time-preset"]:checked');
        if (!selectedShift || !selectedShift.value) {
            const currentShift = getCurrentShift();
            document.getElementById(`time-preset-${currentShift}`).checked = true;
            handleTimePresetChange({ target: { value: currentShift } });
        }
    }, 1000); // Check every second
});

// Fetch production units from API
async function fetchProductionUnits() {
    try {
        const response = await fetch('/units');
        if (!response.ok) {
            throw new Error('Failed to fetch units');
        }
        
        const units = await response.json();
        
        // Clear loading message
        unitsContainer.innerHTML = '';
        
        // Add units as checkboxes in a 2-column layout
        units.forEach(unit => {
            const unitElement = document.createElement('div');
            unitElement.className = 'flex items-center p-1 hover:bg-gray-50 hover:rounded';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'units';
            checkbox.id = `unit-${unit}`;
            checkbox.value = unit;
            checkbox.className = 'h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer';
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    // Add to selected units if not already in the array
                    if (!selectedUnits.includes(unit)) {
                        selectedUnits.push(unit);
                    }
                } else {
                    // Remove from selected units
                    selectedUnits = selectedUnits.filter(u => u !== unit);
                }
                console.log('Selected units:', selectedUnits);
            });
            
            const label = document.createElement('label');
            label.htmlFor = `unit-${unit}`;
            label.className = 'ml-2 block text-sm text-gray-900 py-1 cursor-pointer';
            label.textContent = unit;
            
            unitElement.appendChild(checkbox);
            unitElement.appendChild(label);
            
            unitsContainer.appendChild(unitElement);
        });
        
        // Remove default selection of first unit
        // No auto-selection as per user request
    } catch (error) {
        console.error('Error fetching units:', error);
        unitsContainer.innerHTML = '<div class="col-span-2 text-red-500">Error loading units</div>';
        
        // Add a default option if we can't load from the backend
        const unitElement = document.createElement('div');
        unitElement.className = 'flex items-center p-1 hover:bg-gray-50 hover:rounded';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = 'units';
        checkbox.id = 'unit-DefaultUnit';
        checkbox.value = 'DefaultUnit';
        checkbox.className = 'h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer';
        checkbox.checked = false; // Not checked by default
        
        const label = document.createElement('label');
        label.htmlFor = 'unit-DefaultUnit';
        label.className = 'ml-2 block text-sm text-gray-900 py-1 cursor-pointer';
        label.textContent = 'Default Unit';
        
        unitElement.appendChild(checkbox);
        unitElement.appendChild(label);
        
        unitsContainer.appendChild(unitElement);
        // Remove from selectedUnits array
        selectedUnits = [];
    }
}

// Handle time preset selection
function handleTimePresetChange(event) {
    const presetValue = event.target.value;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // If no preset is selected, use current shift
    if (!presetValue) {
        const currentShift = getCurrentShift();
        document.getElementById(`time-preset-${currentShift}`).checked = true;
        handleTimePresetChange({ target: { value: currentShift } });
        return;
    }
    
    switch(presetValue) {
        case 'shift1':
            startTimeInput.value = formatDateTimeForInput(new Date(today.setHours(8, 0, 0, 0)));
            endTimeInput.value = formatDateTimeForInput(now > new Date(today.getFullYear(), today.getMonth(), today.getDate(), 16, 0, 0, 0) 
                ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), 16, 0, 0, 0) 
                : now);
            break;
        case 'shift2':
            startTimeInput.value = formatDateTimeForInput(new Date(today.setHours(16, 0, 0, 0)));
            endTimeInput.value = formatDateTimeForInput(now > new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999) 
                ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999) 
                : now);
            break;
        case 'shift3':
            startTimeInput.value = formatDateTimeForInput(new Date(today.setHours(0, 0, 0, 0)));
            endTimeInput.value = formatDateTimeForInput(now > new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0, 0, 0) 
                ? new Date(today.getFullYear(), today.getMonth(), today.getDate(), 8, 0, 0, 0) 
                : now);
            break;
    }
}

// Handle standard view button click
standardViewBtn.addEventListener('click', () => {
    // Validate inputs
    const startTime = parseInputDateTime(startTimeInput.value);
    const endTime = parseInputDateTime(endTimeInput.value);
    
    if (!startTime || !endTime) {
        alert('Please select valid start and end times');
        return;
    }
    
    if (selectedUnits.length === 0) {
        alert('Please select at least one unit');
        return;
    }
    
    // Create URL parameters
    const params = new URLSearchParams();
    
    // Add selected units
    selectedUnits.forEach(unit => {
        params.append('units', unit);
    });
    
    // Add time parameters
    params.append('start', startTime.toISOString());
    params.append('end', endTime.toISOString());
    
    // Add preset if available
    const selectedPreset = document.querySelector('input[name="time-preset"]:checked');
    if (selectedPreset && selectedPreset.value) {
        params.append('preset', selectedPreset.value);
    }
    
    // Open in new window with explicit _blank target to ensure it always opens in a new window
    const newWindow = window.open(`/standart.html?${params.toString()}`, '_blank');
    if (newWindow) {
        // If successful, focus the new window
        newWindow.focus();
    } else {
        // If popup was blocked, alert the user
        alert('Pop-up blocked by browser. Please allow pop-ups for this site.');
    }
});

// Handle hourly view button click
hourlyViewBtn.addEventListener('click', () => {
    // Validate inputs
    const startTime = parseInputDateTime(startTimeInput.value);
    const endTime = parseInputDateTime(endTimeInput.value);
    
    if (!startTime || !endTime) {
        alert('Please select valid start and end times');
        return;
    }
    
    if (selectedUnits.length === 0) {
        alert('Please select at least one unit');
        return;
    }
    
    // Create URL parameters
    const params = new URLSearchParams();
    
    // Add selected units
    selectedUnits.forEach(unit => {
        params.append('units', unit);
    });
    
    // Add time parameters
    params.append('start', startTime.toISOString());
    params.append('end', endTime.toISOString());
    
    // Add preset if available
    const selectedPreset = document.querySelector('input[name="time-preset"]:checked');
    if (selectedPreset && selectedPreset.value) {
        params.append('preset', selectedPreset.value);
    }
    
    // Open in new window with explicit _blank target to ensure it always opens in a new window
    const newWindow = window.open(`/hourly.html?${params.toString()}`, '_blank');
    if (newWindow) {
        // If successful, focus the new window
        newWindow.focus();
    } else {
        // If popup was blocked, alert the user
        alert('Pop-up blocked by browser. Please allow pop-ups for this site.');
    }
});