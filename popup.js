document.addEventListener('DOMContentLoaded', () => {
    const depthInput = document.getElementById('depth');
    const highlightColorSelect = document.getElementById('highlightColor');
    const toggleButton = document.getElementById('toggleExtension');
    const moveSideSelect = document.getElementById('moveSide');
    const engineSourceSelect = document.getElementById('engineSource');

    // Request current settings from content script and sync engine source
    chrome.tabs && chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SETTINGS' }, (settings) => {
            if (!settings) return;
            depthInput.value = settings.depth;
            highlightColorSelect.value = settings.highlightColor;
            moveSideSelect.value = settings.moveSide || 'white';
            engineSourceSelect.value = settings.engineSource || 'chesscom';
            toggleButton.textContent = settings.extensionEnabled ? 'Disable Extension' : 'Enable Extension';
            // Always sync engineSource to content script on popup load
            chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_SETTINGS', engineSource: engineSourceSelect.value, triggerBestMove: true });
        });
    });

    // Save settings on change and notify content script
    depthInput.addEventListener('change', () => {
        chrome.storage.sync.set({ depth: depthInput.value });
        chrome.tabs && chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_SETTINGS', depth: depthInput.value, triggerBestMove: true });
        });
    });

    highlightColorSelect.addEventListener('change', () => {
        chrome.storage.sync.set({ highlightColor: highlightColorSelect.value });
        chrome.tabs && chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_SETTINGS', highlightColor: highlightColorSelect.value, triggerBestMove: true });
        });
    });

    moveSideSelect.addEventListener('change', () => {
        chrome.storage.sync.set({ moveSide: moveSideSelect.value });
        chrome.tabs && chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_SETTINGS', moveSide: moveSideSelect.value, triggerBestMove: true });
        });
    });

    engineSourceSelect.addEventListener('change', () => {
        chrome.storage.sync.set({ engineSource: engineSourceSelect.value }, () => {
            chrome.tabs && chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) return;
                chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_SETTINGS', engineSource: engineSourceSelect.value, triggerBestMove: true });
            });
        });
    });

    // Toggle extension
    toggleButton.addEventListener('click', () => {
        chrome.storage.sync.get('extensionEnabled', (data) => {
            const newState = !data.extensionEnabled;
            chrome.storage.sync.set({ extensionEnabled: newState }, () => {
                toggleButton.textContent = newState ? 'Disable Extension' : 'Enable Extension';
                chrome.tabs && chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (!tabs[0]) return;
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_SETTINGS', extensionEnabled: newState });
                });
            });
        });
    });
});