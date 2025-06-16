import { App, ItemView, WorkspaceLeaf, ButtonComponent, TextComponent, DropdownComponent, Modal, Notice, setIcon } from 'obsidian';
import { DataManager } from './data-manager';
import { PunchClockSettings, TimeEntry } from './types';
import moment, { Moment } from 'moment';

/**
 * Modal for editing an existing time entry
 */
class EditEntryModal extends Modal {
    private dataManager: DataManager;
    private settings: PunchClockSettings;
    private entry: TimeEntry;
    private categoryDropdown: DropdownComponent;
    private memoInput: TextComponent;
    private startTimeInput: TextComponent;
    private endTimeInput: TextComponent;
    private onSaveCallback: () => void;

    constructor(
        app: App, 
        dataManager: DataManager, 
        settings: PunchClockSettings,
        entry: TimeEntry,
        onSaveCallback: () => void
    ) {
        super(app);
        this.dataManager = dataManager;
        this.settings = settings;
        this.entry = { ...entry }; // Make a copy
        this.onSaveCallback = onSaveCallback;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('punch-clock-edit-modal');

        // Title
        contentEl.createEl('h2', { text: 'Edit Time Entry' });

        // Form container
        const formContainer = contentEl.createDiv({ cls: 'form-container' });

        // Start Time
        const startTimeContainer = formContainer.createDiv({ cls: 'input-container' });
        startTimeContainer.createEl('label', { text: 'Start Time' });
        
        // Create date-time picker sections
        const startDateTime = formContainer.createDiv({ cls: 'datetime-container' });
        
        // Start date picker
        const startDateContainer = startDateTime.createDiv({ cls: 'date-picker-container' });
        startDateContainer.createEl('label', { text: 'Date' });
        
        const startDateInput = document.createElement('input');
        startDateInput.type = 'date';
        startDateContainer.appendChild(startDateInput);
        
        // Start time picker
        const startTimePickerContainer = startDateTime.createDiv({ cls: 'time-picker-container' });
        startTimePickerContainer.createEl('label', { text: 'Time' });
        
        const startTimeInput = document.createElement('input');
        startTimeInput.type = 'time';
        startTimeInput.step = '1'; // Enable seconds selection
        startTimePickerContainer.appendChild(startTimeInput);
        
        // Format the start date and time for the input
        const startDate = moment(this.entry.startTime);
        startDateInput.value = startDate.format('YYYY-MM-DD');
        startTimeInput.value = startDate.format('HH:mm:ss');

        // End Time
        const endTimeContainer = formContainer.createDiv({ cls: 'input-container' });
        endTimeContainer.createEl('label', { text: 'End Time' });
        
        // Create date-time picker sections for end time
        const endDateTime = formContainer.createDiv({ cls: 'datetime-container' });
        
        // End date picker
        const endDateContainer = endDateTime.createDiv({ cls: 'date-picker-container' });
        endDateContainer.createEl('label', { text: 'Date' });
        
        const endDateInput = document.createElement('input');
        endDateInput.type = 'date';
        endDateContainer.appendChild(endDateInput);
        
        // End time picker
        const endTimePickerContainer = endDateTime.createDiv({ cls: 'time-picker-container' });
        endTimePickerContainer.createEl('label', { text: 'Time' });
        
        const endTimeInput = document.createElement('input');
        endTimeInput.type = 'time';
        endTimeInput.step = '1'; // Enable seconds selection
        endTimePickerContainer.appendChild(endTimeInput);
        
        // Format the end date and time for the input
        if (this.entry.endTime) {
            const endDate = moment(this.entry.endTime);
            endDateInput.value = endDate.format('YYYY-MM-DD');
            endTimeInput.value = endDate.format('HH:mm:ss');
        }
        
        // Store references for saving later
        this.startTimeInput = {
            getValue: () => {
                return `${startDateInput.value}T${startTimeInput.value}`;
            }
        } as TextComponent;
        
        this.endTimeInput = {
            getValue: () => {
                return endDateInput.value && endTimeInput.value ? 
                    `${endDateInput.value}T${endTimeInput.value}` : '';
            }
        } as TextComponent;

        // Category dropdown
        const categoryContainer = formContainer.createDiv({ cls: 'input-container' });
        categoryContainer.createEl('label', { text: 'Category' });
        
        const selectContainer = categoryContainer.createDiv();
        this.categoryDropdown = new DropdownComponent(selectContainer);
        
        // Add categories from settings
        this.settings.categories.forEach(category => {
            this.categoryDropdown.addOption(category, category);
        });
        
        // Set current category
        this.categoryDropdown.setValue(this.entry.category);

        // Memo field
        const memoContainer = formContainer.createDiv({ cls: 'input-container' });
        memoContainer.createEl('label', { text: 'Memo' });
        
        this.memoInput = new TextComponent(memoContainer);
        this.memoInput.setValue(this.entry.memo || '');
        this.memoInput.setPlaceholder('What were you working on?');

        // Button container
        const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

        // Save button
        new ButtonComponent(buttonContainer)
            .setButtonText('Save')
            .setCta()
            .onClick(async () => {
                await this.saveEntry();
            });

        // Cancel button
        new ButtonComponent(buttonContainer)
            .setButtonText('Cancel')
            .onClick(() => {
                this.close();
            });
    }

    async saveEntry() {
        try {
            // Parse the start and end times
            const startTime = new Date(this.startTimeInput.getValue()).getTime();
            
            let endTime: number | null = null;
            if (this.endTimeInput.getValue() && !this.entry.isRunning) {
                endTime = new Date(this.endTimeInput.getValue()).getTime();
            }
            
            // Calculate duration
            let duration = this.entry.duration;
            if (startTime && endTime) {
                duration = Math.floor((endTime - startTime) / 1000);
            }
            
            // Update the entry
            await this.dataManager.updateEntry(this.entry.id, {
                startTime,
                endTime,
                duration,
                category: this.categoryDropdown.getValue(),
                memo: this.memoInput.getValue()
            });
            
            // Notify and close
            new Notice('Time entry updated');
            this.close();
            
            // Call the callback
            this.onSaveCallback();
        } catch (error) {
            console.error('Failed to save entry:', error);
            new Notice('Failed to save entry. Please check the time format.');
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * Modal for starting a new timer with category and memo
 */
class StartTimerModal extends Modal {
    private dataManager: DataManager;
    private settings: PunchClockSettings;
    private categoryDropdown: DropdownComponent;
    private memoInput: TextComponent;
    private timerInterval: number | null = null;
    private elapsedTimeEl: HTMLElement;
    private onStartCallback: () => void;

    constructor(
        app: App, 
        dataManager: DataManager, 
        settings: PunchClockSettings,
        onStartCallback: () => void
    ) {
        super(app);
        this.dataManager = dataManager;
        this.settings = settings;
        this.onStartCallback = onStartCallback;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('punch-clock-start-modal');

        // Title
        contentEl.createEl('h2', { text: 'Start New Timer' });

        // Timer display (will update in real-time)
        const timerContainer = contentEl.createDiv({ cls: 'timer-container' });
        this.elapsedTimeEl = timerContainer.createEl('div', { 
            cls: 'elapsed-time',
            text: '00:00:00' 
        });

        // Form container
        const formContainer = contentEl.createDiv({ cls: 'form-container' });

        // Category dropdown
        const categoryContainer = formContainer.createDiv({ cls: 'input-container' });
        categoryContainer.createEl('label', { text: 'Category' });
        
        const selectContainer = categoryContainer.createDiv();
        this.categoryDropdown = new DropdownComponent(selectContainer);
        
        // Add categories from settings
        this.settings.categories.forEach(category => {
            this.categoryDropdown.addOption(category, category);
        });
        
        // Set default category
        this.categoryDropdown.setValue(this.settings.defaultCategory);

        // Memo field
        const memoContainer = formContainer.createDiv({ cls: 'input-container' });
        memoContainer.createEl('label', { text: 'Memo (optional)' });
        
        this.memoInput = new TextComponent(memoContainer);
        this.memoInput.setPlaceholder('What are you working on?');

        // Button container
        const buttonContainer = contentEl.createDiv({ cls: 'button-container' });

        // Start button
        new ButtonComponent(buttonContainer)
            .setButtonText('Start Timer')
            .setCta()
            .onClick(async () => {
                await this.startTimer();
            });

        // Cancel button
        new ButtonComponent(buttonContainer)
            .setButtonText('Cancel')
            .onClick(() => {
                this.close();
            });
    }

    async startTimer() {
        const now = Date.now();
        
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
        
        // Add to data manager
        await this.dataManager.addEntry(newEntry);
        
        // Notify user
        new Notice(`Started timer for ${newEntry.category}`);
        
        // Close the modal
        this.close();
        
        // Call the callback
        this.onStartCallback();
    }
    
    startTimerDisplay(entry: TimeEntry) {
        // Initial update
        this.updateElapsedTime(entry);
        
        // Update every second
        this.timerInterval = window.setInterval(() => {
            this.updateElapsedTime(entry);
        }, 1000);
    }
    
    updateElapsedTime(entry: TimeEntry) {
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - entry.startTime) / 1000);
        
        const hours = Math.floor(elapsedSeconds / 3600);
        const minutes = Math.floor((elapsedSeconds % 3600) / 60);
        const seconds = elapsedSeconds % 60;
        
        this.elapsedTimeEl.setText(
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
    }

    onClose() {
        // Clear any running intervals
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        const { contentEl } = this;
        contentEl.empty();
    }
}

export const PUNCH_CLOCK_VIEW_TYPE = 'punch-clock-view';

export class PunchClockView extends ItemView {
    private dataManager: DataManager;
    private settings: PunchClockSettings;
    private currentDate: Moment;
    private viewType: 'daily' | 'weekly' | 'monthly';
    private contentContainer: HTMLElement;
    private categoriesListEl: HTMLElement | null = null;
    private baseCategoryBreakdown: { [category: string]: number } = {};
    private currentTotalDuration: number = 0;
    private dayButton: ButtonComponent | null = null;
    private weekButton: ButtonComponent | null = null;
    private monthButton: ButtonComponent | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        dataManager: DataManager,
        settings: PunchClockSettings
    ) {
        super(leaf);
        this.dataManager = dataManager;
        this.settings = settings;
        this.currentDate = moment();
        this.viewType = this.settings.defaultView;
    }

    getViewType(): string {
        return PUNCH_CLOCK_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Punch Clock';
    }

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('punch-clock-view');

        // Create header
        const headerEl = contentEl.createDiv({ cls: 'punch-clock-header' });
        
        // View switcher
        const viewSwitcherEl = headerEl.createDiv({ cls: 'view-switcher' });
        
        // Daily button
        this.dayButton = new ButtonComponent(viewSwitcherEl)
            .setButtonText('Day')
            .onClick(async () => {
                this.viewType = 'daily';
                this.updateActiveButton();
                await this.refreshView();
            });
        
        // Weekly button
        this.weekButton = new ButtonComponent(viewSwitcherEl)
            .setButtonText('Week')
            .onClick(async () => {
                this.viewType = 'weekly';
                this.updateActiveButton();
                await this.refreshView();
            });
        
        // Monthly button
        this.monthButton = new ButtonComponent(viewSwitcherEl)
            .setButtonText('Month')
            .onClick(async () => {
                this.viewType = 'monthly';
                this.updateActiveButton();
                await this.refreshView();
            });

        // Set initial active button
        this.updateActiveButton();

        // Date navigation
        const dateNavEl = headerEl.createDiv({ cls: 'date-nav' });
        
        // Previous button
        new ButtonComponent(dateNavEl)
            .setIcon('arrow-left')
            .onClick(async () => {
                await this.navigateDate('prev');
            });
        
        // Current date display
        dateNavEl.createDiv({ 
            cls: 'current-date',
            text: this.formatDateForView()
        });
        
        // Next button
        new ButtonComponent(dateNavEl)
            .setIcon('arrow-right')
            .onClick(async () => {
                await this.navigateDate('next');
            });

        // Today button
        new ButtonComponent(dateNavEl)
            .setButtonText('Today')
            .onClick(async () => {
                this.currentDate = moment();
                await this.refreshView();
            });

        // Start Timer button (adding this as requested)
        new ButtonComponent(headerEl)
            .setIcon('play')
            .setTooltip('Start New Timer')
            .setCta() // Make it stand out
            .onClick(async () => {
                await this.openTimerModal();
            });


        // Content container
        this.contentContainer = contentEl.createDiv({ cls: 'punch-clock-content' });

        // Initial render
        await this.refreshView();
    }

    private formatDateForView(): string {
        // Use the configured date format
        const dateFormat = this.settings.dateFormat || 'YYYY-MM-DD';
        
        switch (this.viewType) {
            case 'daily':
                return this.currentDate.format(dateFormat);
            case 'weekly':
                const weekStart = this.currentDate.clone().startOf('week').add(this.settings.startDayOfWeek, 'days');
                const weekEnd = weekStart.clone().add(6, 'days');
                
                // Smart formatting: skip year/month in end date if same as start
                const startFormatted = weekStart.format(dateFormat);
                let endFormatted: string;
                
                // Check if same year and month
                if (weekStart.year() === weekEnd.year() && weekStart.month() === weekEnd.month()) {
                    // Same month - just show day
                    if (dateFormat.includes('YYYY-MM-DD')) {
                        endFormatted = weekEnd.format('DD');
                    } else if (dateFormat.includes('DD/MM/YYYY')) {
                        endFormatted = weekEnd.format('DD');
                    } else if (dateFormat.includes('MM/DD/YYYY')) {
                        endFormatted = weekEnd.format('DD');
                    } else {
                        endFormatted = weekEnd.format('DD');
                    }
                } else if (weekStart.year() === weekEnd.year()) {
                    // Same year, different month - skip year in end
                    if (dateFormat.includes('YYYY-MM-DD')) {
                        endFormatted = weekEnd.format('MM-DD');
                    } else if (dateFormat.includes('DD/MM/YYYY')) {
                        endFormatted = weekEnd.format('DD/MM');
                    } else if (dateFormat.includes('MM/DD/YYYY')) {
                        endFormatted = weekEnd.format('MM/DD');
                    } else {
                        endFormatted = weekEnd.format(dateFormat);
                    }
                } else {
                    // Different year - show full format
                    endFormatted = weekEnd.format(dateFormat);
                }
                
                return `${startFormatted} - ${endFormatted}`;
            case 'monthly':
                // For monthly view, show year-month based on date format
                if (dateFormat.includes('MM-DD')) {
                    return this.currentDate.format('YYYY-MM');
                } else if (dateFormat.includes('DD/MM')) {
                    return this.currentDate.format('MM/YYYY');
                } else {
                    return this.currentDate.format('YYYY-MM');
                }
            default:
                return this.currentDate.format(dateFormat);
        }
    }
    
    /**
     * Formats a date according to user settings
     */
    private formatDate(timestamp: number): string {
        return moment(timestamp).format(this.settings.dateFormat);
    }
    
    /**
     * Formats a time according to user settings
     */
    private formatTime(timestamp: number): string {
        return moment(timestamp).format(this.settings.timeFormat);
    }

    private async navigateDate(direction: 'prev' | 'next'): Promise<void> {
        switch (this.viewType) {
            case 'daily':
                this.currentDate = direction === 'prev' 
                    ? this.currentDate.clone().subtract(1, 'day')
                    : this.currentDate.clone().add(1, 'day');
                break;
            case 'weekly':
                this.currentDate = direction === 'prev'
                    ? this.currentDate.clone().subtract(1, 'week')
                    : this.currentDate.clone().add(1, 'week');
                break;
            case 'monthly':
                this.currentDate = direction === 'prev'
                    ? this.currentDate.clone().subtract(1, 'month')
                    : this.currentDate.clone().add(1, 'month');
                break;
        }

        await this.refreshView();
    }

    private timerInterval: number | null = null;
    private timerValueEl: HTMLElement | null = null;
    private runningEntryId: string | null = null;
    
    private async refreshView(): Promise<void> {
        // Clear any existing timer interval
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
            this.timerValueEl = null;
        }
        
        // Update date display
        const dateDisplay = this.contentEl.querySelector('.current-date');
        if (dateDisplay) {
            dateDisplay.textContent = this.formatDateForView();
        }

        // Clear content container
        this.contentContainer.empty();
        
        // Check for running timer and display it prominently with real-time updates
        const runningEntry = this.dataManager.getRunningEntry();
        if (runningEntry) {
            // Store the ID of the running entry
            this.runningEntryId = runningEntry.id;
            
            const runningTimerEl = this.contentContainer.createDiv({ cls: 'running-timer-container' });
            
            // Apply category color as background
            const categoryColor = this.settings.categoryColors?.[runningEntry.category] || '#4a90e2';
            runningTimerEl.style.setProperty('--punch-clock-category-color', categoryColor);
            
            const headerEl = runningTimerEl.createDiv({ cls: 'running-timer-header' });
            headerEl.createEl('h3', { text: 'Timer Running' });
            
            // Calculate initial elapsed time
            const now = Date.now();
            const elapsedSeconds = Math.floor((now - runningEntry.startTime) / 1000) + runningEntry.duration;
            
            // Format as HH:MM:SS
            const hours = Math.floor(elapsedSeconds / 3600);
            const minutes = Math.floor((elapsedSeconds % 3600) / 60);
            const seconds = elapsedSeconds % 60;
            const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
            const timerEl = runningTimerEl.createDiv({ cls: 'running-timer' });
            this.timerValueEl = timerEl.createSpan({ cls: 'timer-value', text: formattedTime });
            
            // Set up timer to update in real-time
            this.timerInterval = window.setInterval(() => {
                this.updateRunningTimer();
            }, 1000);
            
            const detailsEl = runningTimerEl.createDiv({ cls: 'timer-details' });
            
            // Add category with the ability to change it
            const categoryContainer = detailsEl.createDiv({ cls: 'timer-category-container' });
            categoryContainer.createSpan({ text: 'Category: ' });
            
            const selectContainer = categoryContainer.createSpan({ cls: 'category-dropdown-container' });
            const categoryDropdown = new DropdownComponent(selectContainer);
            
            // Add categories from settings
            this.settings.categories.forEach(category => {
                categoryDropdown.addOption(category, category);
            });
            
            // Set current category
            categoryDropdown.setValue(runningEntry.category);
            
            // Update category when changed
            categoryDropdown.onChange(async value => {
                if (runningEntry.id) {
                    await this.dataManager.updateEntry(runningEntry.id, { category: value });
                    // Update background color to match new category
                    const newCategoryColor = this.settings.categoryColors?.[value] || '#4a90e2';
                    runningTimerEl.style.setProperty('--punch-clock-category-color', newCategoryColor);
                    // Update the running entry reference for category breakdown updates
                    runningEntry.category = value;
                    new Notice(`Category updated to ${value}`);
                }
            });
            
            // Add memo with ability to edit
            const memoContainer = detailsEl.createDiv({ cls: 'timer-memo-container' });
            memoContainer.createSpan({ text: 'Memo: ' });
            
            const memoInput = new TextComponent(memoContainer);
            memoInput.setValue(runningEntry.memo || '');
            memoInput.setPlaceholder('What are you working on?');
            
            // Update memo when changed
            memoInput.onChange(async value => {
                if (runningEntry.id) {
                    await this.dataManager.updateEntry(runningEntry.id, { memo: value });
                }
            });
            
            const actionsEl = runningTimerEl.createDiv({ cls: 'timer-actions' });
            
            // Stop button
            new ButtonComponent(actionsEl)
                .setButtonText('Stop Timer')
                .setCta()
                .onClick(async () => {
                    await this.dataManager.stopRunningEntry();
                    if (this.timerInterval) {
                        clearInterval(this.timerInterval);
                        this.timerInterval = null;
                    }
                    await this.refreshView();
                    new Notice('Timer stopped');
                });
        }

        // Render appropriate view
        switch (this.viewType) {
            case 'daily':
                await this.renderDailyView();
                break;
            case 'weekly':
                await this.renderWeeklyView();
                break;
            case 'monthly':
                await this.renderMonthlyView();
                break;
        }
    }

    private async renderDailyView(): Promise<void> {
        const year = this.currentDate.year();
        const month = this.currentDate.month() + 1; // moment months are 0-indexed
        const day = this.currentDate.date();

        const report = await this.dataManager.getDailyReport(year, month, day);
        
        // Summary section
        const summaryEl = this.contentContainer.createDiv({ cls: 'summary-section' });
        
        // Total duration
        const totalDuration = this.formatDuration(report.totalDuration);
        summaryEl.createEl('h3', { text: `Total time: ${totalDuration}` });

        // Store base category breakdown for real-time updates
        this.baseCategoryBreakdown = { ...report.categoryBreakdown };
        this.currentTotalDuration = report.totalDuration;
        
        // Category breakdown with running timer included
        const categoryBreakdownWithRunning = { ...report.categoryBreakdown };
        const runningEntry = this.dataManager.getRunningEntry();
        
        if (runningEntry) {
            const now = Date.now();
            const elapsedSeconds = Math.floor((now - runningEntry.startTime) / 1000) + runningEntry.duration;
            
            if (categoryBreakdownWithRunning[runningEntry.category]) {
                categoryBreakdownWithRunning[runningEntry.category] += elapsedSeconds;
            } else {
                categoryBreakdownWithRunning[runningEntry.category] = elapsedSeconds;
            }
        }
        
        if (Object.keys(categoryBreakdownWithRunning).length > 0) {
            const breakdownEl = summaryEl.createDiv({ cls: 'category-breakdown' });
            breakdownEl.createEl('h4', { text: 'Category Breakdown' });
            
            // Create visual breakdown - horizontal bar chart
            this.categoriesListEl = breakdownEl.createDiv({ cls: 'chart-container' });
            this.updateCategoryBreakdown(categoryBreakdownWithRunning);
        } else {
            summaryEl.createEl('p', { text: 'No time entries for this day.' });
        }

        // Entries list
        if (report.entries.length > 0) {
            const entriesEl = this.contentContainer.createDiv({ cls: 'entries-section' });
            entriesEl.createEl('h3', { text: 'Entries' });
            
            const entriesListEl = entriesEl.createDiv({ cls: 'entries-list' });
            report.entries.forEach(entry => {
                const entryEl = entriesListEl.createDiv({ cls: 'entry-item' });
                
                // Format date and time using the user's preferred format
                const dateFormatted = this.formatDate(entry.startTime);
                const startTimeFormatted = this.formatTime(entry.startTime);
                const endTimeFormatted = entry.endTime ? this.formatTime(entry.endTime) : 'Running';
                
                entryEl.createDiv({
                    cls: 'entry-date',
                    text: dateFormatted
                });
                
                entryEl.createDiv({
                    cls: 'entry-header',
                    text: `${startTimeFormatted} - ${endTimeFormatted}`
                });
                
                entryEl.createDiv({
                    cls: 'entry-duration',
                    text: `Duration: ${this.formatDuration(entry.duration)}`
                });
                
                // Category with edit ability
                const categoryEl = entryEl.createDiv({ cls: 'entry-category' });
                categoryEl.createSpan({ text: 'Category: ' });
                
                // Add edit button
                const editButtonsContainer = entryEl.createDiv({ cls: 'entry-edit-buttons' });
                
                // Edit button
                new ButtonComponent(editButtonsContainer)
                    .setIcon('pencil')
                    .setTooltip('Edit Entry')
                    .onClick(async () => {
                        await this.openEditEntryModal(entry.id);
                    });
                
                // Delete button
                new ButtonComponent(editButtonsContainer)
                    .setIcon('trash')
                    .setTooltip('Delete Entry')
                    .onClick(async () => {
                        if (confirm('Are you sure you want to delete this entry?')) {
                            await this.dataManager.deleteEntry(entry.id);
                            await this.refreshView();
                            new Notice('Entry deleted');
                        }
                    });
                
                // Continue button
                new ButtonComponent(editButtonsContainer)
                    .setIcon('copy')
                    .setTooltip('Start New Timer with Same Settings')
                    .onClick(async () => {
                        await this.continueTimer(entry.id);
                    });
                    
                // Show category and memo
                const categoryColor = this.settings.categoryColors?.[entry.category] || '#4a90e2';
                const categoryValueEl = categoryEl.createSpan({ 
                    cls: 'entry-category-value',
                    text: entry.category
                });
                categoryValueEl.style.setProperty('--punch-clock-category-color', categoryColor);
                
                if (entry.memo) {
                    const memoEl = entryEl.createDiv({ cls: 'entry-memo' });
                    memoEl.createSpan({ text: 'Memo: ' });
                    memoEl.createSpan({ 
                        cls: 'entry-memo-value',
                        text: entry.memo
                    });
                }
            });
        }
    }

    private async renderWeeklyView(): Promise<void> {
        const weekStart = this.currentDate.clone().startOf('week').add(this.settings.startDayOfWeek, 'days');
        const weekEnd = weekStart.clone().add(6, 'days');
        
        // Get all entries for the week from CSV files
        const entries = await this.dataManager.getEntriesForDateRange(weekStart.toDate(), weekEnd.toDate());

        // Calculate totals and breakdowns
        const categoryBreakdown: { [category: string]: number } = {};
        let totalDuration = 0;

        entries.forEach(entry => {
            const category = entry.category || 'Uncategorized';
            if (!categoryBreakdown[category]) {
                categoryBreakdown[category] = 0;
            }
            categoryBreakdown[category] += entry.duration;
            totalDuration += entry.duration;
        });

        // Summary section
        const summaryEl = this.contentContainer.createDiv({ cls: 'summary-section' });
        
        // Total duration
        const totalDurationFormatted = this.formatDuration(totalDuration);
        summaryEl.createEl('h3', { text: `Total time: ${totalDurationFormatted}` });

        // Category breakdown with visualization
        if (Object.keys(categoryBreakdown).length > 0) {
            const breakdownEl = summaryEl.createDiv({ cls: 'category-breakdown' });
            breakdownEl.createEl('h4', { text: 'Category Breakdown' });
            
            // Create visual breakdown - horizontal bar chart
            const chartContainer = breakdownEl.createDiv({ cls: 'chart-container' });
            
            // Sort categories by duration (descending)
            const sortedCategories = Object.entries(categoryBreakdown)
                .sort((a, b) => b[1] - a[1]);
                
            sortedCategories.forEach(([category, duration]) => {
                const percentage = Math.round((duration / totalDuration) * 100);
                
                const barContainer = chartContainer.createDiv({ cls: 'chart-bar-container' });
                
                // Category label and percentage
                const labelContainer = barContainer.createDiv({ cls: 'chart-bar-label-container' });
                const categoryColor = this.settings.categoryColors?.[category] || '#4a90e2';
                
                // Create category label with color badge
                const categoryLabelEl = labelContainer.createDiv({ cls: 'chart-bar-label' });
                const colorBadge = categoryLabelEl.createSpan({ cls: 'category-color-badge' });
                colorBadge.style.setProperty('--punch-clock-category-color', categoryColor);
                categoryLabelEl.createSpan({ text: category });
                
                labelContainer.createDiv({
                    cls: 'chart-bar-value',
                    text: `${this.formatDuration(duration)} (${percentage}%)`
                });
                
                // Bar visualization
                const barEl = barContainer.createDiv({ cls: 'chart-bar' });
                const barFill = barEl.createDiv({ cls: 'chart-bar-fill' });
                barFill.style.setProperty('--punch-clock-bar-width', `${percentage}%`);
                barFill.style.setProperty('--punch-clock-category-color', categoryColor);
            });
        } else {
            summaryEl.createEl('p', { text: 'No time entries for this week.' });
        }

        // Daily breakdown with visualization
        if (entries.length > 0) {
            const dailyBreakdownEl = this.contentContainer.createDiv({ cls: 'daily-breakdown' });
            dailyBreakdownEl.createEl('h3', { text: 'Daily Breakdown' });
            
            // Group entries by day
            const dailyGroups: { [date: string]: number } = {};
            
            for (let i = 0; i < 7; i++) {
                const day = weekStart.clone().add(i, 'days');
                const dateKey = day.format('YYYY-MM-DD');
                dailyGroups[dateKey] = 0;
            }
            
            entries.forEach(entry => {
                const date = moment(entry.startTime).format('YYYY-MM-DD');
                if (!dailyGroups[date]) {
                    dailyGroups[date] = 0;
                }
                dailyGroups[date] += entry.duration;
            });
            
            // Create visual daily breakdown
            const dailyChartContainer = dailyBreakdownEl.createDiv({ cls: 'daily-chart-container' });
            
            // Find max duration for scaling
            const maxDailyDuration = Math.max(...Object.values(dailyGroups));
            
            Object.entries(dailyGroups).forEach(([date, duration]) => {
                const dayName = moment(date).format('ddd, MMM D');
                const percentage = maxDailyDuration > 0 ? Math.round((duration / maxDailyDuration) * 100) : 0;
                
                const dayContainer = dailyChartContainer.createDiv({ cls: 'day-bar-container' });
                
                // Day label and duration
                dayContainer.createDiv({
                    cls: 'day-name',
                    text: dayName
                });
                
                // Bar container
                const barContainer = dayContainer.createDiv({ cls: 'day-bar-wrapper' });
                const barEl = barContainer.createDiv({ cls: 'day-bar' });
                const barFill = barEl.createDiv({ cls: 'day-bar-fill' });
                barFill.style.setProperty('--punch-clock-bar-width', `${percentage}%`);
                
                dayContainer.createDiv({
                    cls: 'day-duration',
                    text: this.formatDuration(duration)
                });
            });
        }
    }

    private async renderMonthlyView(): Promise<void> {
        const year = this.currentDate.year();
        const month = this.currentDate.month() + 1; // moment months are 0-indexed

        const report = await this.dataManager.getMonthlyReport(year, month);
        
        // Summary section
        const summaryEl = this.contentContainer.createDiv({ cls: 'summary-section' });
        
        // Total duration
        const totalDuration = this.formatDuration(report.totalDuration);
        summaryEl.createEl('h3', { text: `Total time: ${totalDuration}` });

        // Category chart (visual representation)
        if (Object.keys(report.categoryBreakdown).length > 0) {
            const chartEl = this.contentContainer.createDiv({ cls: 'category-chart' });
            chartEl.createEl('h4', { text: 'Time Distribution' });
            
            const chartContainer = chartEl.createDiv({ cls: 'chart-container' });
            
            // Simple bar chart visualization
            Object.entries(report.categoryBreakdown).forEach(([category, duration]) => {
                const percentage = Math.round((duration / report.totalDuration) * 100);
                const categoryColor = this.settings.categoryColors?.[category] || '#4a90e2';
                
                const barContainer = chartContainer.createDiv({ cls: 'chart-bar-container' });
                
                // Category label with color badge
                const labelEl = barContainer.createDiv({ cls: 'chart-bar-label' });
                const colorBadge = labelEl.createSpan({ cls: 'category-color-badge' });
                colorBadge.style.setProperty('--punch-clock-category-color', categoryColor);
                labelEl.createSpan({ text: category });
                
                const barEl = barContainer.createDiv({ cls: 'chart-bar' });
                const barFill = barEl.createDiv({ cls: 'chart-bar-fill' });
                barFill.style.setProperty('--punch-clock-bar-width', `${percentage}%`);
                barFill.style.setProperty('--punch-clock-category-color', categoryColor);
                
                barContainer.createDiv({
                    cls: 'chart-bar-value',
                    text: `${this.formatDuration(duration)} (${percentage}%)`
                });
            });
        } else {
            summaryEl.createEl('p', { text: 'No time entries for this month.' });
        }
    }

    private formatDuration(seconds: number): string {
        if (seconds < 60) return `${seconds}s`;
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours === 0) return `${minutes}m`;
        return `${hours}h ${minutes}m`;
    }

    /**
     * Updates the category breakdown display with real-time data
     */
    private updateCategoryBreakdown(categoryBreakdown: { [category: string]: number }): void {
        if (!this.categoriesListEl) return;
        
        // Clear existing content
        this.categoriesListEl.empty();
        
        // Calculate total duration for current breakdown
        const totalDuration = Object.values(categoryBreakdown).reduce((sum, duration) => sum + duration, 0);
        
        if (totalDuration === 0) return;
        
        // Sort categories by duration (descending)
        const sortedCategories = Object.entries(categoryBreakdown)
            .sort((a, b) => b[1] - a[1]);
            
        // Create chart bars for each category
        sortedCategories.forEach(([category, duration]) => {
            const percentage = Math.round((duration / totalDuration) * 100);
            
            const barContainer = this.categoriesListEl!.createDiv({ cls: 'chart-bar-container' });
            
            // Category label and percentage
            const labelContainer = barContainer.createDiv({ cls: 'chart-bar-label-container' });
            const categoryColor = this.settings.categoryColors?.[category] || '#4a90e2';
            
            // Create category label with color badge
            const categoryLabelEl = labelContainer.createDiv({ cls: 'chart-bar-label' });
            const colorBadge = categoryLabelEl.createSpan({ cls: 'category-color-badge' });
            colorBadge.style.setProperty('--punch-clock-category-color', categoryColor);
            categoryLabelEl.createSpan({ text: category });
            
            labelContainer.createDiv({
                cls: 'chart-bar-value',
                text: `${this.formatDuration(duration)} (${percentage}%)`
            });
            
            // Bar visualization
            const barEl = barContainer.createDiv({ cls: 'chart-bar' });
            const barFill = barEl.createDiv({ cls: 'chart-bar-fill' });
            barFill.style.setProperty('--punch-clock-bar-width', `${percentage}%`);
            barFill.style.setProperty('--punch-clock-category-color', categoryColor);
        });
    }

    /**
     * Updates the active state of view switcher buttons
     */
    private updateActiveButton(): void {
        // Remove active class from all buttons
        this.dayButton?.buttonEl.removeClass('active');
        this.weekButton?.buttonEl.removeClass('active');
        this.monthButton?.buttonEl.removeClass('active');
        
        // Add active class to current view button
        switch (this.viewType) {
            case 'daily':
                this.dayButton?.buttonEl.addClass('active');
                break;
            case 'weekly':
                this.weekButton?.buttonEl.addClass('active');
                break;
            case 'monthly':
                this.monthButton?.buttonEl.addClass('active');
                break;
        }
    }

    /**
     * Opens the timer modal to start a new time tracking session
     */
    private async openTimerModal(): Promise<void> {
        // Stop any running timer first
        const runningEntry = this.dataManager.getRunningEntry();
        if (runningEntry) {
            // If there's a running timer, ask the user if they want to stop it
            const stopExisting = confirm("There's already a timer running. Stop it and start a new one?");
            if (stopExisting) {
                await this.dataManager.stopRunningEntry();
            } else {
                return;
            }
        }

        // Create and open a custom modal for starting a timer
        const modal = new StartTimerModal(this.app, this.dataManager, this.settings, async () => {
            // Callback to refresh view after timer is started
            await this.refreshView();
        });
        modal.open();
    }

    /**
     * Opens a modal to edit an existing time entry
     */
    private async openEditEntryModal(entryId: string): Promise<void> {
        const entry = await this.dataManager.getEntryAsync(entryId);
        if (!entry) {
            new Notice('Entry not found');
            return;
        }
        
        const modal = new EditEntryModal(this.app, this.dataManager, this.settings, entry, async () => {
            // Refresh view when the edit is complete
            await this.refreshView();
        });
        modal.open();
    }
    
    /**
     * Continues a timer from a previous entry
     */
    private async continueTimer(entryId: string): Promise<void> {
        const entry = await this.dataManager.getEntryAsync(entryId);
        if (!entry) {
            new Notice('Entry not found');
            return;
        }
        
        // Check if there's a running entry
        const runningEntry = this.dataManager.getRunningEntry();
        if (runningEntry) {
            const stopExisting = confirm("There's already a timer running. Stop it and start a new one?");
            if (stopExisting) {
                await this.dataManager.stopRunningEntry();
            } else {
                return;
            }
        }
        
        // Create a new entry with the same category and memo
        const now = Date.now();
        const newEntry: TimeEntry = {
            id: now.toString(),
            startTime: now,
            endTime: null,
            duration: 0,
            category: entry.category,
            memo: entry.memo,
            isRunning: true
        };
        
        await this.dataManager.addEntry(newEntry);
        new Notice(`Started new timer for ${entry.category}`);
        await this.refreshView();
    }
    
    /**
     * Updates the running timer display with the current elapsed time
     */
    private updateRunningTimer(): void {
        if (!this.timerValueEl || !this.runningEntryId) return;
        
        // Get the running entry again in case it was updated
        const runningEntry = this.dataManager.getEntry(this.runningEntryId);
        if (!runningEntry || !runningEntry.isRunning) {
            // Timer was stopped elsewhere
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            return;
        }
        
        // Calculate current elapsed time
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - runningEntry.startTime) / 1000) + runningEntry.duration;
        
        // Format as HH:MM:SS
        const hours = Math.floor(elapsedSeconds / 3600);
        const minutes = Math.floor((elapsedSeconds % 3600) / 60);
        const seconds = elapsedSeconds % 60;
        
        // Update the timer display
        this.timerValueEl.setText(
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
        
        // Update category breakdown in real-time (only for daily view)
        if (this.viewType === 'daily' && this.categoriesListEl) {
            const categoryBreakdownWithRunning = { ...this.baseCategoryBreakdown };
            
            if (categoryBreakdownWithRunning[runningEntry.category]) {
                categoryBreakdownWithRunning[runningEntry.category] += elapsedSeconds;
            } else {
                categoryBreakdownWithRunning[runningEntry.category] = elapsedSeconds;
            }
            
            this.updateCategoryBreakdown(categoryBreakdownWithRunning);
        }
    }
    
    async onClose(): Promise<void> {
        // Clear any timer intervals
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
}