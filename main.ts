import { Plugin, WorkspaceLeaf, Notice, addIcon } from 'obsidian';
import { DataManager } from './src/data-manager';
import { TimerModal } from './src/modal';
import { PunchClockView, PUNCH_CLOCK_VIEW_TYPE } from './src/view';
import { PunchClockSettingTab } from './src/settings-tab';
import { PunchClockSettings } from './src/types';

const DEFAULT_SETTINGS: PunchClockSettings = {
    categories: ['Work', 'Personal', 'Research', 'Meeting'],
    categoryColors: {
        'Work': '#4a90e2',
        'Personal': '#50c878',
        'Research': '#ffa500',
        'Meeting': '#dc143c'
    },
    defaultCategory: 'Work',
    autoSave: true,
    showInRibbon: true,
    defaultView: 'daily',
    dateFormat: 'YYYY-MM-DD',
    timeFormat: 'HH:mm:ss',
    storageDirectory: 'punch-clock-data',
    startDayOfWeek: 0 // Default to Sunday
};

// Define the timer icon
const TIMER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-timer"><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/><line x1="12" x2="12" y1="14" y2="16"/><line x1="12" x2="10.5" y1="14" y2="5.5"/><circle cx="12" cy="14" r="8"/></svg>`;

export default class PunchClockPlugin extends Plugin {
    settings: PunchClockSettings;
    dataManager: DataManager;
    ribbonIconEl: HTMLElement | null = null;
    activeTimer: NodeJS.Timeout | null = null;

    async onload() {
        
        // Register the custom icon
        addIcon('timer', TIMER_ICON);
        
        // Load settings
        await this.loadSettings();
        
        // Initialize managers
        this.dataManager = new DataManager(this);
        
        // Ensure storage directory exists
        await this.ensureStorageDirectory();
        
        // Load categories first (this will update settings if needed)
        await this.dataManager.loadCategories();
        
        // Load data
        await this.dataManager.loadData();

        // Add ribbon icon
        this.refreshRibbonIcon();

        // Register view
        this.registerView(
            PUNCH_CLOCK_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => new PunchClockView(leaf, this.dataManager, this.settings)
        );

        // Add command to open timer modal
        this.addCommand({
            id: 'open-timer-modal',
            name: 'Open Timer',
            callback: () => {
                new TimerModal(this.app, this.dataManager, this.settings).open();
            }
        });

        // Add command to open time tracker view
        this.addCommand({
            id: 'open-time-tracker-view',
            name: 'Open Panel',
            callback: async () => {
                await this.activateView();
            }
        });

        // Add command to start a quick timer
        this.addCommand({
            id: 'start-quick-timer',
            name: 'Start Quick Timer',
            callback: () => {
                this.startQuickTimer();
            }
        });

        // Add command to stop the current timer
        this.addCommand({
            id: 'stop-current-timer',
            name: 'Stop Current Timer',
            callback: () => {
                this.stopCurrentTimer();
            }
        });


        // Add settings tab
        this.addSettingTab(new PunchClockSettingTab(this.app, this));

        // Check for any running timers that need to be resumed
        this.checkForRunningTimers();
    }

    refreshRibbonIcon() {
        // Remove existing ribbon icon if it exists
        if (this.ribbonIconEl) {
            this.ribbonIconEl.remove();
            this.ribbonIconEl = null;
        }

        // Add the ribbon icon if enabled in settings
        if (this.settings.showInRibbon) {
            this.ribbonIconEl = this.addRibbonIcon('timer', 'Punch Clock', async () => {
                const runningEntry = this.dataManager.getRunningEntry();
                
                if (runningEntry) {
                    // If timer is running, show the timer modal
                    new TimerModal(this.app, this.dataManager, this.settings).open();
                } else {
                    // Otherwise, open the tracker view
                    await this.activateView();
                }
            });
            
            // Add CSS class to the ribbon icon
            this.ribbonIconEl.addClass('punch-clock-ribbon-icon');
        }
    }

    async activateView() {
        const { workspace } = this.app;
        
        // Check if the view is already open
        let leaf = workspace.getLeavesOfType(PUNCH_CLOCK_VIEW_TYPE)[0];
        
        if (!leaf) {
            // If not, create a new leaf in the right sidebar
            // Use assertion to tell TypeScript this won't be null
            leaf = workspace.getRightLeaf(false) as WorkspaceLeaf;
            await leaf.setViewState({
                type: PUNCH_CLOCK_VIEW_TYPE,
                active: true,
            });
        }
        
        // Reveal the leaf
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    private startQuickTimer() {
        // Stop any running timers
        const runningEntry = this.dataManager.getRunningEntry();
        if (runningEntry) {
            this.dataManager.stopRunningEntry();
            new Notice('Stopped previous timer');
        }

        // Create a new entry with default values
        const now = Date.now();
        const newEntry = {
            id: now.toString(),
            startTime: now,
            endTime: null,
            duration: 0,
            category: this.settings.defaultCategory,
            memo: '',
            isRunning: true
        };
        
        this.dataManager.addEntry(newEntry);
        new Notice(`Started timer for ${this.settings.defaultCategory}`);
    }

    private stopCurrentTimer() {
        const runningEntry = this.dataManager.getRunningEntry();
        if (runningEntry) {
            this.dataManager.stopRunningEntry();
            new Notice('Timer stopped');
        } else {
            new Notice('No active timer to stop');
        }
    }

    private checkForRunningTimers() {
        const runningEntry = this.dataManager.getRunningEntry();
        if (runningEntry) {
            // Calculate how long it's been running and update UI if needed
            const now = Date.now();
            const elapsedSeconds = Math.floor((now - runningEntry.startTime) / 1000);
            
            // If timer has been running too long (more than a day), stop it
            if (elapsedSeconds > 86400) { // 24 hours
                this.dataManager.stopRunningEntry();
                new Notice('Stopped a timer that was running for more than 24 hours');
            }
        }
    }

    async onunload() {
        
        // Stop any active timers
        const runningEntry = this.dataManager.getRunningEntry();
        if (runningEntry) {
            this.dataManager.stopRunningEntry();
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        
        // Update storage directory in data manager if it changed
        if (this.dataManager) {
            this.dataManager.updateStorageDirectory(this.settings.storageDirectory);
        }
    }
    
    /**
     * Ensures the storage directory exists
     */
    async ensureStorageDirectory(): Promise<void> {
        const vault = this.app.vault;
        const dir = this.settings.storageDirectory;
        
        // Only create directory if it's not empty (not root)
        if (dir && dir.trim() !== '') {
            // Check if directory exists
            const exists = await vault.adapter.exists(dir);
            if (!exists) {
                // Create the directory
                await vault.createFolder(dir);
            }
        }
        
        // If data manager is initialized, tell it to ensure its files are setup
        if (this.dataManager) {
            await this.dataManager.ensureStorageDirectory();
        }
    }
}