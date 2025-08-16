import { App, Modal, Setting, ButtonComponent, DropdownComponent, TextComponent } from 'obsidian';
import { TimeEntry, PunchClockSettings } from './types';
import { DataManager } from './data-manager';

export class TimerModal extends Modal {
    private dataManager: DataManager;
    private settings: PunchClockSettings;
    private activeTimer: TimeEntry | undefined | null = null;
    private timerInterval: number | null = null;
    private elapsedTimeEl: HTMLElement;
    private startStopBtn: ButtonComponent;
    private categoryDropdown: DropdownComponent;
    private memoInput: TextComponent;
    private isEditing = false;
    private editingId: string | null = null;

    constructor(app: App, dataManager: DataManager, settings: PunchClockSettings) {
        super(app);
        this.dataManager = dataManager;
        this.settings = settings;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('punch-clock-modal');

        // Modal title
        contentEl.createEl('h2', { text: 'Punch Clock' });

        // Timer display
        const timerContainer = contentEl.createDiv({ cls: 'timer-container' });
        this.elapsedTimeEl = timerContainer.createEl('div', { 
            cls: 'elapsed-time',
            text: '00:00:00' 
        });

        // Category selection
        const formContainer = contentEl.createDiv({ cls: 'form-container' });
        
        new Setting(formContainer)
            .setName('Category')
            .addDropdown(dropdown => {
                this.settings.categories.forEach(category => {
                    dropdown.addOption(category, category);
                });
                dropdown.setValue(this.settings.defaultCategory);
                dropdown.onChange(value => {
                    if (this.activeTimer) {
                        this.activeTimer.category = value;
                    }
                });
                this.categoryDropdown = dropdown;
            });

        // Memo field
        new Setting(formContainer)
            .setName('Memo')
            .addText(text => {
                text.setPlaceholder('What are you working on?');
                text.onChange(value => {
                    if (this.activeTimer) {
                        this.activeTimer.memo = value;
                    }
                });
                this.memoInput = text;
            });

        // Buttons container
        const buttonsContainer = contentEl.createDiv({ cls: 'buttons-container' });

        // Start/Stop button
        this.startStopBtn = new ButtonComponent(buttonsContainer)
            .setButtonText('Start')
            .setCta()
            .onClick(async () => {
                if (!this.activeTimer || !this.activeTimer.isRunning) {
                    await this.startTimer();
                } else {
                    await this.stopTimer();
                }
            });

        // Cancel button
        new ButtonComponent(buttonsContainer)
            .setButtonText('Cancel')
            .onClick(() => {
                if (this.activeTimer && this.activeTimer.isRunning) {
                    this.cancelTimer();
                }
                this.close();
            });

        // Check for running timers
        const runningEntry = this.dataManager.getRunningEntry();
        if (runningEntry) {
            this.activeTimer = runningEntry;
            this.resumeTimer();
        }

        // Recent entries section
        this.displayRecentEntries(contentEl);
    }

    private async startTimer() {
        // Stop any running timers first
        const runningEntry = this.dataManager.getRunningEntry();
        if (runningEntry) {
            await this.dataManager.stopRunningEntry();
        }

        const now = Date.now();
        
        if (this.isEditing && this.editingId) {
            // Update existing entry
            await this.dataManager.updateEntry(this.editingId, {
                category: this.categoryDropdown.getValue(),
                memo: this.memoInput.getValue(),
                isRunning: true,
                startTime: now,
                endTime: null,
                duration: 0
            });
            this.activeTimer = this.dataManager.getEntry(this.editingId);
        } else {
            // Create new entry
            const newEntry: TimeEntry = {
                id: now.toString(),
                startTime: now,
                endTime: null,
                duration: 0,
                category: this.categoryDropdown.getValue(),
                memo: this.memoInput.getValue(),
                isRunning: true
            };
            
            await this.dataManager.addEntry(newEntry);
            this.activeTimer = newEntry;
        }

        // Update UI
        this.startStopBtn.setButtonText('Stop');
        this.updateElapsedTime();

        // Start the timer interval
        this.timerInterval = window.setInterval(() => {
            this.updateElapsedTime();
        }, 1000);
    }

    private async stopTimer() {
        if (!this.activeTimer || !this.activeTimer.isRunning) return;

        // Clear the interval
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        // Update the entry
        const now = Date.now();
        const duration = this.activeTimer.duration + Math.floor((now - this.activeTimer.startTime) / 1000);
        
        await this.dataManager.updateEntry(this.activeTimer.id, {
            endTime: now,
            duration,
            isRunning: false
        });

        // Update UI
        this.startStopBtn.setButtonText('Start');
        this.activeTimer = null;
        this.resetForm();

        // Refresh recent entries
        this.displayRecentEntries(this.contentEl);
    }

    private cancelTimer() {
        if (!this.activeTimer || !this.activeTimer.isRunning) return;

        // Clear the interval
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        // Delete the entry
        this.dataManager.deleteEntry(this.activeTimer.id);
        
        // Update UI
        this.startStopBtn.setButtonText('Start');
        this.activeTimer = null;
        this.resetForm();
    }

    private resumeTimer() {
        if (!this.activeTimer || !this.activeTimer.isRunning) return;

        // Set form values
        this.categoryDropdown.setValue(this.activeTimer.category);
        this.memoInput.setValue(this.activeTimer.memo);
        
        // Update UI
        this.startStopBtn.setButtonText('Stop');
        this.updateElapsedTime();

        // Start the timer interval
        this.timerInterval = window.setInterval(() => {
            this.updateElapsedTime();
        }, 1000);
    }

    private updateElapsedTime() {
        if (!this.activeTimer || !this.activeTimer.isRunning) return;

        const now = Date.now();
        const elapsedSeconds = this.activeTimer.duration + Math.floor((now - this.activeTimer.startTime) / 1000);
        
        const hours = Math.floor(elapsedSeconds / 3600);
        const minutes = Math.floor((elapsedSeconds % 3600) / 60);
        const seconds = elapsedSeconds % 60;
        
        this.elapsedTimeEl.setText(
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
    }

    private resetForm() {
        this.categoryDropdown.setValue(this.settings.defaultCategory);
        this.memoInput.setValue('');
        this.elapsedTimeEl.setText('00:00:00');
        this.isEditing = false;
        this.editingId = null;
    }

    private displayRecentEntries(containerEl: HTMLElement) {
        // Remove existing entries if any
        const existingEntriesContainer = containerEl.querySelector('.recent-entries-container');
        if (existingEntriesContainer) {
            existingEntriesContainer.remove();
        }

        // Get recent entries (last 5)
        const entries = this.dataManager.getEntries()
            .filter(entry => !entry.isRunning) // Don't show running entries
            .sort((a, b) => b.startTime - a.startTime) // Sort by most recent
            .slice(0, 5); // Limit to 5 entries

        if (entries.length === 0) return;

        // Create container
        const entriesContainer = containerEl.createDiv({ cls: 'recent-entries-container' });
        entriesContainer.createEl('h3', { text: 'Recent entries' });

        // Create entries list
        const entriesList = entriesContainer.createEl('div', { cls: 'recent-entries-list' });
        
        entries.forEach(entry => {
            const entryEl = entriesList.createDiv({ cls: 'recent-entry' });
            
            // Format start time
            const startDate = new Date(entry.startTime);
            const formattedDate = startDate.toLocaleDateString();
            
            // Format duration
            const hours = Math.floor(entry.duration / 3600);
            const minutes = Math.floor((entry.duration % 3600) / 60);
            const formattedDuration = `${hours}h ${minutes}m`;
            
            // Entry details
            entryEl.createDiv({ 
                cls: 'entry-header',
                text: `${formattedDate} - ${formattedDuration} - ${entry.category}`
            });
            
            entryEl.createDiv({
                cls: 'entry-memo',
                text: entry.memo || 'No memo'
            });

            // Action buttons
            const actionsContainer = entryEl.createDiv({ cls: 'entry-actions' });
            
            // Edit button
            new ButtonComponent(actionsContainer)
                .setIcon('pencil')
                .setTooltip('Edit')
                .onClick(() => {
                    this.editEntry(entry.id);
                });

            // Delete button
            new ButtonComponent(actionsContainer)
                .setIcon('trash')
                .setTooltip('Delete')
                .onClick(() => {
                    this.deleteEntry(entry.id);
                });

            // Continue button
            new ButtonComponent(actionsContainer)
                .setIcon('copy')
                .setTooltip('Start new timer')
                .onClick(() => {
                    this.continueEntry(entry.id);
                });
        });
    }

    private editEntry(id: string) {
        const entry = this.dataManager.getEntry(id);
        if (!entry) return;

        this.isEditing = true;
        this.editingId = id;
        
        // Fill the form with entry data
        this.categoryDropdown.setValue(entry.category);
        this.memoInput.setValue(entry.memo);
    }

    private deleteEntry(id: string) {
        this.dataManager.deleteEntry(id);
        this.displayRecentEntries(this.contentEl);
    }

    private continueEntry(id: string) {
        const entry = this.dataManager.getEntry(id);
        if (!entry) return;

        // Stop any running timer
        if (this.activeTimer && this.activeTimer.isRunning) {
            this.stopTimer();
        }

        // Start a new timer with the same category and memo
        this.categoryDropdown.setValue(entry.category);
        this.memoInput.setValue(entry.memo);
        this.startTimer();
    }

    onClose() {
        // Stop any running interval
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }

        // Clear the modal content
        const { contentEl } = this;
        contentEl.empty();
    }
}