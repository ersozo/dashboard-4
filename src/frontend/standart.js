// Global variables
let unitsContainer;
let selectedUnitsDisplay; 
let timeRangeDisplay;
let loadingIndicator;
let summaryContainer;
let totalProduction;
let totalQuality;
let totalPerformance;
let totalOEE;
let updateIndicator;
let lastUpdateTimeElement;

// Parse URL parameters
let selectedUnits = [];
let startTime = null;
let endTime = null;
let timePresetValue = '';
// Store WebSocket connections for each unit
let unitSockets = {};
// Store unit data containers to update them
let unitData = {};
// Track if all connections are established
let allConnectionsEstablished = false;
// Track last update timestamp
let lastUpdateTime = null;
// Store elements that need to flash on update
let elementsToFlashOnUpdate = [];

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all DOM elements
    unitsContainer = document.getElementById('units-container');
    selectedUnitsDisplay = document.getElementById('selected-units-display');
    timeRangeDisplay = document.getElementById('time-range-display');
    loadingIndicator = document.getElementById('loading-indicator');
    summaryContainer = document.getElementById('summary-container');
    totalProduction = document.getElementById('total-production');
    totalQuality = document.getElementById('total-quality');
    totalPerformance = document.getElementById('total-performance');
    totalOEE = document.getElementById('total-oee');
    updateIndicator = document.getElementById('update-indicator');
    lastUpdateTimeElement = document.getElementById('last-update-time');
    
    // Check if all required DOM elements exist
    if (!unitsContainer) console.error("Missing element: unitsContainer");
    if (!selectedUnitsDisplay) console.error("Missing element: selectedUnitsDisplay");
    if (!timeRangeDisplay) console.error("Missing element: timeRangeDisplay");
    if (!loadingIndicator) console.error("Missing element: loadingIndicator");
    if (!summaryContainer) console.error("Missing element: summaryContainer");
    if (!totalProduction) console.error("Missing element: totalProduction");
    if (!totalQuality) console.error("Missing element: totalQuality");
    if (!totalPerformance) console.error("Missing element: totalPerformance");
    if (!totalOEE) console.error("Missing element: totalOEE");
    if (!updateIndicator) console.error("Missing element: updateIndicator");
    if (!lastUpdateTimeElement) console.error("Missing element: lastUpdateTimeElement");
    
    if (!lastUpdateTimeElement || !updateIndicator || !unitsContainer) {
        console.error('Could not find necessary DOM elements');
        alert('There was a problem initializing the dashboard. Please refresh the page.');
        return;
    }

    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    
    // Get units
    selectedUnits = params.getAll('units');
    
    // Get time parameters
    const startParam = params.get('start');
    const endParam = params.get('end');
    timePresetValue = params.get('preset') || '';
    
    if (startParam) {
        startTime = new Date(startParam);
    }
    
    if (endParam) {
        endTime = new Date(endParam);
    }
    
    // If no valid parameters, redirect back to home
    if (selectedUnits.length === 0 || !startTime || !endTime) {
        alert('Missing required parameters. Redirecting to dashboard.');
        window.location.href = '/';
        return;
    }
    
    // Create last update display
    createLastUpdateDisplay();
    
    // Update UI with selected units
    updateSelectedUnitsDisplay();
    
    // Update time range display
    updateTimeDisplay();
    
    // Load data for each unit
    loadData();
    
    // Clean up WebSocket connections when page unloads
    window.addEventListener('beforeunload', () => {
        for (const unitName in unitSockets) {
            if (unitSockets[unitName]) {
                unitSockets[unitName].close();
            }
        }
    });
});

// Create last update display
function createLastUpdateDisplay() {
    // Initialize the update timestamp
    lastUpdateTime = new Date();
    
    // Set initial update time display
    const hours = String(lastUpdateTime.getHours()).padStart(2, '0');
    const minutes = String(lastUpdateTime.getMinutes()).padStart(2, '0');
    const seconds = String(lastUpdateTime.getSeconds()).padStart(2, '0');
    lastUpdateTimeElement.textContent = `Last update: ${hours}:${minutes}:${seconds}`;
}

// Show update in progress indicator
function showUpdatingIndicator() {
    // Show updating indicator if it exists
    if (updateIndicator) {
        updateIndicator.classList.remove('hidden');
    }
}

// Format date for display
function formatDateForDisplay(date) {
    if (!date) return '';
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// Update UI with selected units
function updateSelectedUnitsDisplay() {
    selectedUnitsDisplay.innerHTML = '';
    
    selectedUnits.forEach(unit => {
        const tag = document.createElement('span');
        tag.className = 'bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium';
        tag.textContent = unit;
        selectedUnitsDisplay.appendChild(tag);
    });
}

// Update time range display
function updateTimeDisplay() {
    let timeRangeText = `${formatDateForDisplay(startTime)} - ${formatDateForDisplay(endTime)}`;
    
    // Add preset name if available
    if (timePresetValue) {
        let presetName = '';
        switch(timePresetValue) {
            case 'shift1':
                presetName = 'Vardiya 1 (08:00 - 16:00)';
                break;
            case 'shift2':
                presetName = 'Vardiya 2 (16:00 - 24:00)';
                break;
            case 'shift3':
                presetName = 'Vardiya 3 (00:00 - 08:00)';
                break;
            case 'today':
                presetName = 'Bugün';
                break;
        }
        
        if (presetName) {
            timeRangeText = `${presetName}: ${timeRangeText}`;
        }
    }
    
    timeRangeDisplay.textContent = timeRangeText;
}

// Load data for all units
function loadData() {
    // Show loading indicator and hide summary
    loadingIndicator.classList.remove('hidden');
    summaryContainer.classList.add('hidden');
    
    // Clear units container
    unitsContainer.innerHTML = '';
    
    // Reset unit data to empty state
    unitData = {};
    
    // Create connections for each selected unit
    let completedRequests = 0;
    
    // Initialize unit data storage for each unit
    selectedUnits.forEach(unit => {
        // Initialize empty data array for each unit
        unitData[unit] = [];
    });
    
    // Create a separate array to ensure we track units that had data
    let unitsWithData = [];
    
    // If no units selected, show error message
    if (selectedUnits.length === 0) {
        console.error("No units selected");
        loadingIndicator.classList.add('hidden');
        const noUnitsMessage = document.createElement('div');
        noUnitsMessage.className = 'bg-red-100 p-4 rounded-lg border border-red-300 text-red-800';
        noUnitsMessage.textContent = 'No units selected. Please return to the dashboard and select units.';
        unitsContainer.appendChild(noUnitsMessage);
        return;
    }
    
    // Function to check if all requests are completed and update UI
    function checkAllRequestsCompleted() {
        completedRequests++;
        
        // When all initial requests are done, create UI and hide loading
        if (completedRequests === selectedUnits.length) {
            // Count units that actually have data
            for (const u in unitData) {
                if (unitData[u] && unitData[u].length > 0) {
                    unitsWithData.push(u);
                }
            }
            
            // Update UI with all the data collected so far
            updateUI();
                
            // Hide loading indicator and show results
            loadingIndicator.classList.add('hidden');
            summaryContainer.classList.remove('hidden');
            
            // Update the last update time
            updateLastUpdateTime();
        }
    }
    
    // Connect to WebSocket for each unit
    selectedUnits.forEach(unit => {
        // Connect to WebSocket for this unit
        connectWebSocket(unit, startTime, endTime, (data) => {
            // Check if all requests are completed
            checkAllRequestsCompleted();
        });
    });
}

// Process data for a specific unit
function processUnitData(unit, data) {
    // Ensure unit data array exists
    if (!unitData[unit]) {
        unitData[unit] = [];
    } else {
        // Clear existing data for this unit to prevent duplicates
        unitData[unit] = [];
    }
    
    // Process each data item
    data.forEach(item => {
        // Always ensure item has unit property
        item.unit = unit;
        unitData[unit].push(item);
    });
}

// Update UI with current data
function updateUI() {
    // Update summary first
    updateSummary(Object.values(unitData).flat());
    
    // Check if tables exist - if not, create them
    if (unitsContainer.children.length === 0) {
        createUnitTables(unitData);
    } else {
        // Otherwise update existing tables
        for (const unit in unitData) {
            const models = unitData[unit];
            
            // Update unit success count
            const successCountElement = document.getElementById(`success-count-${unit.replace(/\s+/g, '-')}`);
            if (successCountElement) {
                const totalSuccess = models.reduce((sum, model) => sum + model.success_qty, 0);
                successCountElement.textContent = `OK: ${totalSuccess}`;
                elementsToFlashOnUpdate.push(successCountElement);
            }
            
            // Update each model row
            models.forEach(model => {
                // Update total qty
                const totalQtyElement = document.getElementById(`qty-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`);
                if (totalQtyElement && totalQtyElement.textContent != model.total_qty) {
                    totalQtyElement.textContent = model.total_qty;
                    elementsToFlashOnUpdate.push(totalQtyElement);
                }
                
                // Update target qty
                const targetQtyElement = document.getElementById(`target-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`);
                if (targetQtyElement) {
                    const targetQty = model.target || '-';
                    if (targetQtyElement.textContent != targetQty) {
                        targetQtyElement.textContent = targetQty;
                    }
                }
                
                // Update success qty
                const successQtyElement = document.getElementById(`success-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`);
                if (successQtyElement && successQtyElement.textContent != model.success_qty) {
                    successQtyElement.textContent = model.success_qty;
                    elementsToFlashOnUpdate.push(successQtyElement);
                }
                
                // Update fail qty
                const failQtyElement = document.getElementById(`fail-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`);
                if (failQtyElement && failQtyElement.textContent != model.fail_qty) {
                    failQtyElement.textContent = model.fail_qty;
                    elementsToFlashOnUpdate.push(failQtyElement);
                }
                
                // Update quality
                const qualityElement = document.getElementById(`quality-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`);
                if (qualityElement) {
                    const quality = model.quality !== undefined ? (model.quality * 100).toFixed(2) : '-';
                    if (qualityElement.textContent != quality) {
                        qualityElement.textContent = quality;
                    }
                }
                
                // Update performance
                const performanceElement = document.getElementById(`performance-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`);
                if (performanceElement) {
                    const performance = (model.performance !== undefined && model.performance !== null) 
                        ? (model.performance * 100).toFixed(2) 
                        : '-';
                    if (performanceElement.textContent != performance) {
                        performanceElement.textContent = performance;
                    }
                }
                
                // Update OEE
                const oeeElement = document.getElementById(`oee-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`);
                if (oeeElement) {
                    const oee = (model.oee !== undefined && model.oee !== null) 
                        ? (model.oee * 100).toFixed(2) 
                        : '-';
                    if (oeeElement.textContent != oee) {
                        oeeElement.textContent = oee;
                    }
                }
            });
        }
    }
}

// Create tables for each unit
function createUnitTables(unitDataMap) {
    unitsContainer.innerHTML = '';
    
    let unitCount = 0;
    
    for (const unit in unitDataMap) {
        const models = unitDataMap[unit];
        
        if (!models || models.length === 0) {
            continue;
        }
        
        unitCount++;
        
        const unitContainer = document.createElement('div');
        unitContainer.className = 'bg-white rounded-lg shadow p-6 mb-8'; // Added margin-bottom
        unitContainer.id = `unit-${unit.replace(/\s+/g, '-')}`;
        
        // Unit header with name and stats
        const unitHeader = document.createElement('div');
        unitHeader.className = 'mb-4';
        
        const headerContent = document.createElement('div');
        headerContent.className = 'flex justify-between items-center';
        
        // Create unit title
        const unitTitle = document.createElement('h2');
        unitTitle.className = 'text-xl font-semibold text-gray-800';
        unitTitle.textContent = unit;
        headerContent.appendChild(unitTitle);
        
        // Create unit success count - this will update
        const successCount = document.createElement('div');
        successCount.className = 'text-lg font-medium text-green-600 bg-green-50 px-3 py-1 rounded-lg';
        const totalSuccess = models.reduce((sum, model) => sum + model.success_qty, 0);
        successCount.textContent = `OK: ${totalSuccess}`;
        successCount.id = `success-count-${unit.replace(/\s+/g, '-')}`;
        // Add to elements that should flash when updated
        elementsToFlashOnUpdate.push(successCount);
        headerContent.appendChild(successCount);
        
        unitHeader.appendChild(headerContent);
        unitContainer.appendChild(unitHeader);
        
        // Create the table
        const table = document.createElement('table');
        table.className = 'min-w-full divide-y divide-gray-200';
        
        // Create table header
        const thead = document.createElement('thead');
        thead.className = 'bg-gray-50';
        
        const headerRow = document.createElement('tr');
        
        const headers = ['Model', 'Hedef', 'Toplam', 'OK', 'Tamir', 'Kalite (%)', 'Performans (%)', 'OEE (%)'];
        headers.forEach(headerText => {
            const th = document.createElement('th');
            th.className = 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider';
            th.textContent = headerText;
            headerRow.appendChild(th);
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        tbody.className = 'bg-white divide-y divide-gray-200';
        
        // Add a row for each model
        models.forEach((model, index) => {
                const row = document.createElement('tr');
            row.className = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
            
            // Cell 1: Model Name
            const modelCell = document.createElement('td');
            modelCell.className = 'px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900';
            modelCell.textContent = model.model;
            row.appendChild(modelCell);
            
            // Cell 2: Target Quantity
            const targetCell = document.createElement('td');
            targetCell.className = 'px-6 py-4 whitespace-nowrap text-sm text-blue-600';
            targetCell.id = `target-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`;
            targetCell.textContent = model.target || '-';
            row.appendChild(targetCell);
            
            // Cell 3: Total Quantity
                const totalCell = document.createElement('td');
            totalCell.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
            totalCell.id = `qty-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`;
            totalCell.textContent = model.total_qty;
            // Add to elements that should flash when updated
            elementsToFlashOnUpdate.push(totalCell);
                row.appendChild(totalCell);
                
            // Cell 4: Success Quantity
            const successCell = document.createElement('td');
            successCell.className = 'px-6 py-4 whitespace-nowrap text-sm text-green-600';
            successCell.id = `success-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`;
            successCell.textContent = model.success_qty;
            // Add to elements that should flash when updated
            elementsToFlashOnUpdate.push(successCell);
            row.appendChild(successCell);
            
            // Cell 5: Fail Quantity
            const failCell = document.createElement('td');
            failCell.className = 'px-6 py-4 whitespace-nowrap text-sm text-red-600';
            failCell.id = `fail-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`;
            failCell.textContent = model.fail_qty;
            // Add to elements that should flash when updated
            elementsToFlashOnUpdate.push(failCell);
            row.appendChild(failCell);
            
            // Cell 6: Quality
                const qualityCell = document.createElement('td');
            qualityCell.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
            qualityCell.id = `quality-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`;
            const quality = model.quality !== undefined ? (model.quality * 100).toFixed(2) : '-';
            qualityCell.textContent = quality;
                row.appendChild(qualityCell);
                
            // Cell 7: Performance
                const performanceCell = document.createElement('td');
            performanceCell.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
            performanceCell.id = `performance-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`;
            const performance = (model.performance !== undefined && model.performance !== null) 
                ? (model.performance * 100).toFixed(2) 
                    : '-';
            performanceCell.textContent = performance;
                row.appendChild(performanceCell);
                
            // Cell 8: OEE
                const oeeCell = document.createElement('td');
            oeeCell.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-500';
            oeeCell.id = `oee-${unit.replace(/\s+/g, '-')}-${model.model.replace(/\s+/g, '-')}`;
            const oee = (model.oee !== undefined && model.oee !== null) 
                ? (model.oee * 100).toFixed(2) 
                    : '-';
            oeeCell.textContent = oee;
                row.appendChild(oeeCell);
                
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        unitContainer.appendChild(table);
        
        // Add the completed unit table to the container
        unitsContainer.appendChild(unitContainer);
    }
    
    // If no units were displayed, show an error message
    if (unitCount === 0) {
        const noDataMessage = document.createElement('div');
        noDataMessage.className = 'bg-yellow-100 p-4 rounded-lg border border-yellow-300 text-yellow-800';
        noDataMessage.textContent = 'No data available for the selected units in this time range.';
        unitsContainer.appendChild(noDataMessage);
    }
}

// Connect to WebSocket and handle data
function connectWebSocket(unitName, startTime, endTime, callback) {
    // Determine WebSocket URL
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/${unitName}`;
    
    // Create a new WebSocket for this unit
    const unitSocket = new WebSocket(wsUrl);
    
    // Store the socket for cleanup
    unitSockets[unitName] = unitSocket;
    
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    
    // Set up interval for data refreshing
    let updateInterval = null;
    let hasReceivedInitialData = false;
    
    function sendDataRequest() {
        if (unitSocket.readyState === WebSocket.OPEN) {
            // Show the updating indicator
            showUpdatingIndicator();
            
            // Use the original start time but use current time as the end time for real-time data
            const currentEndTime = new Date();
            
            // Send parameters to request new data
            const params = {
                start_time: startTime.toISOString(),
                end_time: currentEndTime.toISOString() // Update to current time
            };
            
            unitSocket.send(JSON.stringify(params));
        } else {
            console.warn(`Cannot send update request - socket not open for "${unitName}", readyState: ${unitSocket.readyState}`);
            // Clear interval if socket is not open
            if (updateInterval) {
                clearInterval(updateInterval);
                updateInterval = null;
            }
            
            // If we haven't received initial data and socket is closed, trigger callback with empty data
            if (!hasReceivedInitialData) {
                console.warn(`Socket closed before receiving initial data for "${unitName}". Completing with empty data.`);
                hasReceivedInitialData = true;
                callback([]);
            }
        }
    }
    
    // Set a timeout to ensure we get a callback even if WebSocket fails to connect or is slow
    const connectionTimeout = setTimeout(() => {
        if (!hasReceivedInitialData) {
            console.warn(`Connection timeout for "${unitName}". Completing with empty data.`);
            hasReceivedInitialData = true;
            
            // Ensure we have an entry in unitData even if no data is received
            if (!unitData[unitName]) {
                unitData[unitName] = [];
            }
            
            callback([]);
        }
    }, 10000); // 10 second timeout
    
    unitSocket.onopen = () => {
        reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        
        // Send initial parameters once connected
        sendDataRequest();
        
        // Set up interval to request data every 30 seconds
        updateInterval = setInterval(sendDataRequest, 30000);
    };
    
    unitSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // Check if response contains an error
            if (data.error) {
                console.error(`Error for "${unitName}":`, data.error);
                
                // Still count as completed for multi-unit processing
                if (!hasReceivedInitialData) {
                    hasReceivedInitialData = true;
                    clearTimeout(connectionTimeout);
                    
                    // Ensure we have an entry in unitData even if there's an error
                    if (!unitData[unitName]) {
                        unitData[unitName] = [];
                    }
                    
                callback([]);
                }
            } else {
                // Process the data - CRITICAL: Must process before calling callback
                processUnitData(unitName, data);
                
                // Only call the callback once for initial data
                if (!hasReceivedInitialData) {
                    hasReceivedInitialData = true;
                    clearTimeout(connectionTimeout);
                callback(data);
                } else {
                    // If it's a subsequent update, update UI directly
                    updateUI();
                    updateLastUpdateTime();
                }
            }
        } catch (error) {
            console.error(`Error parsing data for "${unitName}":`, error);
            
            if (!hasReceivedInitialData) {
                hasReceivedInitialData = true;
                clearTimeout(connectionTimeout);
                
                // Ensure we have an entry in unitData even if there's a parsing error
                if (!unitData[unitName]) {
                    unitData[unitName] = [];
                }
                
            callback([]);
            }
        }
    };
    
    unitSocket.onerror = (error) => {
        console.error(`WebSocket error for "${unitName}":`, error);
        
        // Clear the update interval if there's an error
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
        
        // Count as completed but with no data
        if (!hasReceivedInitialData) {
            hasReceivedInitialData = true;
            clearTimeout(connectionTimeout);
        callback([]);
        }
    };
    
    unitSocket.onclose = (event) => {
        // Clear the update interval if the socket is closed
        if (updateInterval) {
            clearInterval(updateInterval);
            updateInterval = null;
        }
        
        // Make sure we call callback if we haven't received initial data yet
        if (!hasReceivedInitialData) {
            hasReceivedInitialData = true;
            clearTimeout(connectionTimeout);
            callback([]);
            return;
        }
        
        if (!event.wasClean && reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setTimeout(() => {
                connectWebSocket(unitName, startTime, endTime, (data) => {
                    // Only process data on reconnect, don't call original callback
                    if (data && data.length > 0) {
                        processUnitData(unitName, data);
                        updateUI();
                        updateLastUpdateTime();
                    }
                });
            }, 1000 * reconnectAttempts); // Increase delay with each attempt
        } else if (!event.wasClean && reconnectAttempts >= maxReconnectAttempts) {
            console.error(`Failed to connect to WebSocket for "${unitName}" after ${maxReconnectAttempts} attempts`);
        }
    };
}

// Update summary with production data
function updateSummary(data) {
    // Group data by model
    const modelGroups = {};
    
    data.forEach(item => {
        if (!modelGroups[item.model]) {
            modelGroups[item.model] = {
                model: item.model,
                success_qty: 0,
                fail_qty: 0,
                total_qty: 0,
                target: item.target
            };
        }
        
        // Add quantities
        modelGroups[item.model].success_qty += item.success_qty;
        modelGroups[item.model].fail_qty += item.fail_qty;
        modelGroups[item.model].total_qty += item.total_qty;
    });
    
    // Calculate totals
    const models = Object.values(modelGroups);
    
    let totalSuccessQty = 0;
    let totalFailQty = 0;
    let totalQtyAll = 0;
    
    // Variables for weighted quality calculation
    let weightedQualitySum = 0;
    
    // Variables for weighted performance and OEE calculation
    let totalPerformanceWeightedSum = 0;
    let totalPerformanceQtySum = 0;
    let totalOEEWeightedSum = 0;
    let totalOEEQtySum = 0;
    
    models.forEach(model => {
        totalSuccessQty += model.success_qty;
        totalFailQty += model.fail_qty;
        totalQtyAll += model.total_qty;
        
        // Calculate quality for this model
        const modelQuality = model.total_qty > 0 ? model.success_qty / model.total_qty : 0;
        
        // Add to weighted quality sum - weight by total quantity
        weightedQualitySum += modelQuality * model.total_qty;
        
        // If model has target data, calculate performance and OEE
        if (model.target) {
            // Get performance and OEE for this model from corresponding data entry
            const dataEntry = data.find(item => 
                item.model === model.model && 
                item.performance !== undefined && 
                item.performance !== null);
                
            if (dataEntry) {
                // Add to weighted performance sum - weight by total quantity
                totalPerformanceWeightedSum += dataEntry.performance * model.total_qty;
                totalPerformanceQtySum += model.total_qty;
                
                // Calculate OEE for this model if quality and performance are available
                const modelOEE = modelQuality * dataEntry.performance;
                
                // Add to weighted OEE sum - weight by total quantity
                totalOEEWeightedSum += modelOEE * model.total_qty;
                totalOEEQtySum += model.total_qty;
            }
        }
    });
    
    // Calculate overall metrics with proper weighting
    const overallQuality = totalQtyAll > 0 ? weightedQualitySum / totalQtyAll : 0;
    
    const overallPerformance = totalPerformanceQtySum > 0 
        ? totalPerformanceWeightedSum / totalPerformanceQtySum 
        : 0;
        
    const overallOEE = totalOEEQtySum > 0 
        ? totalOEEWeightedSum / totalOEEQtySum
        : 0;
    
    // Check if values have changed and update
    const oldTotalProduction = totalProduction.textContent;
    const newTotalProduction = totalQtyAll.toString();
    if (oldTotalProduction !== newTotalProduction) {
        totalProduction.textContent = newTotalProduction;
        elementsToFlashOnUpdate.push(totalProduction);
    }
    
    const oldTotalQuality = totalQuality.textContent;
    const newTotalQuality = (overallQuality * 100).toFixed(2);
    if (oldTotalQuality !== newTotalQuality) {
        totalQuality.textContent = newTotalQuality;
        elementsToFlashOnUpdate.push(totalQuality);
    }
    
    const oldTotalPerformance = totalPerformance.textContent;
    const newTotalPerformance = (overallPerformance * 100).toFixed(2);
    if (oldTotalPerformance !== newTotalPerformance) {
        totalPerformance.textContent = newTotalPerformance;
        elementsToFlashOnUpdate.push(totalPerformance);
    }
    
    const oldTotalOEE = totalOEE.textContent;
    const newTotalOEE = (overallOEE * 100).toFixed(2);
    if (oldTotalOEE !== newTotalOEE) {
        totalOEE.textContent = newTotalOEE;
        elementsToFlashOnUpdate.push(totalOEE);
    }
}

// Update the last update time display
function updateLastUpdateTime() {
    const now = new Date();
    lastUpdateTime = now;
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    lastUpdateTimeElement.textContent = `Son güncelleme: ${hours}:${minutes}:${seconds}`;
    
    // Hide updating indicator
    updateIndicator.classList.add('hidden');
    
    // Apply flash effect to elements that changed
    const elementsToFlash = [...elementsToFlashOnUpdate]; // Create a copy
    elementsToFlashOnUpdate = []; // Clear the array for next update
    
    // Flash elements that need to show update
    elementsToFlash.forEach(element => {
        if (element && element.classList) {
            // Add flash effect
            element.classList.add('animate-flash');
            // Remove flash effect after animation completes
            setTimeout(() => {
                element.classList.remove('animate-flash');
            }, 1000);
        }
    });
    
    // Flash the real-time indicator to show successful update
    const realTimeIndicator = document.getElementById('real-time-indicator');
    if (realTimeIndicator) {
        realTimeIndicator.classList.add('bg-green-200');
        setTimeout(() => {
            realTimeIndicator.classList.remove('bg-green-200');
            realTimeIndicator.classList.add('bg-green-100');
        }, 1000);
    }
} 