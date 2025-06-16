import { Plugin, TFile, Notice } from 'obsidian';
import { TimeEntry, MonthlyReport, DailyReport, PunchClockSettings } from './types';
import moment from 'moment';

// Interface for the plugin that DataManager expects
interface PunchClockPluginInterface extends Plugin {
    settings: PunchClockSettings;
    saveSettings(): Promise<void>;
}

export class DataManager {
    private plugin: PunchClockPluginInterface;
    private settings: PunchClockSettings;
    private entries: TimeEntry[] = [];
    private categoriesFile = 'categories.json';
    private runningTimerFile = 'running-timer.json';
    private storageDirectory: string;

    constructor(plugin: PunchClockPluginInterface) {
        this.plugin = plugin;
        // Access settings from the plugin instance
        this.settings = plugin.settings;
        this.storageDirectory = this.settings?.storageDirectory || 'punch-clock-data';
    }

    /**
     * Assign default colors to categories that don't have colors
     */
    private assignDefaultColors(categories: string[]): { [categoryName: string]: string } {
        const defaultColors = [
            '#4a90e2', // Blue
            '#50c878', // Green
            '#ffa500', // Orange
            '#dc143c', // Red
            '#9370db', // Purple
            '#20b2aa', // Teal
            '#ff69b4', // Pink
            '#4682b4', // Steel Blue
            '#daa520', // Goldenrod
            '#8b4513'  // Saddle Brown
        ];

        const colors: { [categoryName: string]: string } = {};
        categories.forEach((category, index) => {
            if (!this.settings.categoryColors || !this.settings.categoryColors[category]) {
                colors[category] = defaultColors[index % defaultColors.length];
            } else {
                colors[category] = this.settings.categoryColors[category];
            }
        });

        return colors;
    }

    /**
     * Updates the storage directory path
     */
    updateStorageDirectory(newPath: string): void {
        this.storageDirectory = newPath;
    }

    /**
     * Ensures the storage directory exists
     */
    async ensureStorageDirectory(): Promise<void> {
        const vault = this.plugin.app.vault;
        
        // Only create directory if it's not empty (not root)
        if (this.storageDirectory && this.storageDirectory.trim() !== '') {
            // Check if directory exists
            const exists = await vault.adapter.exists(this.storageDirectory);
            if (!exists) {
                // Create the directory
                await vault.createFolder(this.storageDirectory);
            }
        }
        
        // Initialize categories file if it doesn't exist
        const categoriesPath = this.storageDirectory ? `${this.storageDirectory}/${this.categoriesFile}` : this.categoriesFile;
        const existingCategoriesFile = vault.getAbstractFileByPath(categoriesPath);
        if (!existingCategoriesFile) {
            // Initialize with default categories
            const categories = {
                categories: this.settings.categories,
                defaultCategory: this.settings.defaultCategory,
                categoryColors: this.settings.categoryColors || this.assignDefaultColors(this.settings.categories)
            };
            try {
                await vault.create(categoriesPath, JSON.stringify(categories, null, 2));
            } catch (error) {
                if (error.message !== 'File already exists.') {
                    console.error('Error creating categories file:', error);
                }
            }
        }
    }

    /**
     * Loads all time entries from the CSV files
     */
    async loadData(): Promise<void> {
        try {
            const vault = this.plugin.app.vault;
            
            // Ensure storage directory exists
            await this.ensureStorageDirectory();
            
            // Clear current entries
            this.entries = [];
            
            // Get all CSV files in the directory
            const files = vault.getFiles()
                .filter(file => file.path.startsWith(this.storageDirectory) && 
                                file.path.endsWith('.csv') &&
                                !file.path.includes('/_'));
            
            // Load data from each CSV file
            for (const file of files) {
                const content = await vault.read(file);
                const entries = this.parseCSV(content);
                this.entries.push(...entries);
            }
            
            // Check for running timer
            const runningTimerPath = this.storageDirectory ? `${this.storageDirectory}/${this.runningTimerFile}` : this.runningTimerFile;
            if (await vault.adapter.exists(runningTimerPath)) {
                try {
                    const runningTimerData = await vault.adapter.read(runningTimerPath);
                    const runningTimer = JSON.parse(runningTimerData);
                    
                    // Add running timer to entries if it exists
                    if (runningTimer && runningTimer.id) {
                        this.entries.push(runningTimer);
                    }
                } catch (e) {
                    console.error('Failed to load running timer:', e);
                }
            }
            
            // Sort entries by start time
            this.entries.sort((a, b) => a.startTime - b.startTime);
            
        } catch (error) {
            console.error('Failed to load data:', error);
            new Notice('Failed to load time tracking data');
            this.entries = [];
        }
    }
    
    /**
     * Parse CSV content into time entries
     */
    private parseCSV(csvContent: string): TimeEntry[] {
        const lines = csvContent.split('\n');
        const entries: TimeEntry[] = [];
        
        // Skip header row
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Parse CSV line
            const parts = this.parseCSVLine(line);
            if (parts.length < 5) continue;
            
            // Extract data - support both old and new CSV formats
            const date = parts[0];
            const startTime = parts[1];
            const endTime = parts[2];
            const duration = parseInt(parts[3], 10) || 0;
            
            // Check if this is new format (with minutes and hours columns) or old format
            let category, memo;
            if (parts.length >= 8) {
                // New format: Date,Start Time,End Time,Duration(seconds),Duration(minutes),Duration(hours),Category,Memo
                category = parts[6];
                memo = parts[7] || '';
            } else {
                // Old format: Date,Start Time,End Time,Duration,Category,Memo
                category = parts[4];
                memo = parts[5] || '';
            }
            
            // Create entry
            const startDateTime = moment(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm:ss').valueOf();
            let endDateTime = null;
            if (endTime) {
                endDateTime = moment(`${date} ${endTime}`, 'YYYY-MM-DD HH:mm:ss').valueOf();
            }
            
            entries.push({
                id: startDateTime.toString(),
                startTime: startDateTime,
                endTime: endDateTime,
                duration: duration,
                category: category,
                memo: memo,
                isRunning: false
            });
        }
        
        return entries;
    }
    
    /**
     * Parse a CSV line accounting for quoted fields
     */
    private parseCSVLine(line: string): string[] {
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                    // Double quotes inside quotes - add a single quote
                    current += '"';
                    i++;
                } else {
                    // Toggle quotes mode
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // End of field
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        // Add the last field
        result.push(current);
        return result;
    }

    /**
     * Save a time entry to the appropriate CSV file
     */
    private async saveEntryToCSV(entry: TimeEntry): Promise<void> {
        
        if (entry.isRunning) {
            // Running timers are saved to a separate JSON file
            await this.saveRunningTimer(entry);
            return;
        }
        
        const vault = this.plugin.app.vault;
        
        // Get date from the entry
        const entryDate = new Date(entry.startTime);
        const year = entryDate.getFullYear();
        const month = (entryDate.getMonth() + 1).toString().padStart(2, '0');
        
        // Generate file name for the month
        const fileName = `${year}-${month}.csv`;
        const filePath = this.storageDirectory ? `${this.storageDirectory}/${fileName}` : fileName;
        
        let content = '';
        let fileExists = await vault.adapter.exists(filePath);
        
        if (!fileExists) {
            // Create new file with header
            content = 'Date,Start Time,End Time,Duration(seconds),Duration(minutes),Duration(hours),Category,Memo\n';
        } else {
            // Read existing file
            const abstractFile = vault.getAbstractFileByPath(filePath);
            if (abstractFile instanceof TFile) {
                content = await vault.read(abstractFile);
            } else {
                // File doesn't exist yet
                content = 'Date,Start Time,End Time,Duration(seconds),Duration(minutes),Duration(hours),Category,Memo\n';
                fileExists = false;
            }
        }
        
        // Format date and times
        const dateStr = moment(entry.startTime).format('YYYY-MM-DD');
        const startTimeStr = moment(entry.startTime).format('HH:mm:ss');
        const endTimeStr = entry.endTime ? moment(entry.endTime).format('HH:mm:ss') : '';
        
        // Calculate duration in different units
        const durationSeconds = entry.duration;
        const durationMinutes = Math.round((durationSeconds / 60) * 100) / 100; // Round to 2 decimal places
        const durationHours = Math.round((durationSeconds / 3600) * 100) / 100; // Round to 2 decimal places
        
        // Escape and quote fields
        const categoryEscaped = `"${entry.category.replace(/"/g, '""')}"`;
        const memoEscaped = `"${entry.memo.replace(/"/g, '""')}"`;
        
        // Add entry to CSV
        const newLine = `${dateStr},"${startTimeStr}","${endTimeStr}",${durationSeconds},${durationMinutes},${durationHours},${categoryEscaped},${memoEscaped}\n`;
        
        if (fileExists) {
            // Check if this entry already exists in the file
            if (!this.entryExistsInCSV(content, entry.id)) {
                content += newLine;
            } else {
                // Entry exists, so we need to update it
                content = this.updateEntryInCSV(content, entry);
            }
        } else {
            content += newLine;
        }
        
        // Write the updated content
        try {
            if (fileExists) {
                // Update existing file
                const abstractFile = vault.getAbstractFileByPath(filePath);
                if (abstractFile instanceof TFile) {
                    await vault.modify(abstractFile, content);
                } else {
                    // Fallback to adapter write
                    await vault.adapter.write(filePath, content);
                }
            } else {
                // Create new file through Obsidian's vault API
                await vault.create(filePath, content);
            }
        } catch (error) {
            console.error('Error writing CSV file:', error);
        }
    }
    
    /**
     * Check if an entry already exists in the CSV content
     */
    private entryExistsInCSV(csvContent: string, entryId: string): boolean {
        const lines = csvContent.split('\n');
        const targetTime = parseInt(entryId, 10);
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = this.parseCSVLine(line);
            if (parts.length >= 2) {
                const date = parts[0];
                const startTime = parts[1];
                const lineTime = moment(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm:ss').valueOf();
                if (lineTime.toString() === entryId) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * Update an existing entry in the CSV content
     */
    private updateEntryInCSV(csvContent: string, entry: TimeEntry): string {
        const lines = csvContent.split('\n');
        const targetId = entry.id;
        const dateStr = moment(entry.startTime).format('YYYY-MM-DD');
        const startTimeStr = moment(entry.startTime).format('HH:mm:ss');
        const endTimeStr = entry.endTime ? moment(entry.endTime).format('HH:mm:ss') : '';
        
        // Calculate duration in different units
        const durationSeconds = entry.duration;
        const durationMinutes = Math.round((durationSeconds / 60) * 100) / 100;
        const durationHours = Math.round((durationSeconds / 3600) * 100) / 100;
        
        // Escape and quote fields
        const categoryEscaped = `"${entry.category.replace(/"/g, '""')}"`;
        const memoEscaped = `"${entry.memo.replace(/"/g, '""')}"`;
        
        const newLine = `${dateStr},"${startTimeStr}","${endTimeStr}",${durationSeconds},${durationMinutes},${durationHours},${categoryEscaped},${memoEscaped}`;
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = this.parseCSVLine(line);
            if (parts.length >= 2) {
                const date = parts[0];
                const startTime = parts[1];
                const lineTime = moment(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm:ss').valueOf();
                if (lineTime.toString() === targetId) {
                    lines[i] = newLine;
                    break;
                }
            }
        }
        
        return lines.join('\n');
    }
    
    /**
     * Save running timer to JSON file
     */
    private async saveRunningTimer(entry: TimeEntry): Promise<void> {
        const vault = this.plugin.app.vault;
        const runningTimerPath = this.storageDirectory ? `${this.storageDirectory}/${this.runningTimerFile}` : this.runningTimerFile;
        
        if (entry.isRunning) {
            // Save the running timer
            try {
                const jsonContent = JSON.stringify(entry, null, 2);
                const abstractFile = vault.getAbstractFileByPath(runningTimerPath);
                if (abstractFile instanceof TFile) {
                    await vault.modify(abstractFile, jsonContent);
                } else {
                    await vault.create(runningTimerPath, jsonContent);
                }
            } catch (error) {
                console.error('Error writing running timer file:', error);
            }
        } else {
            // Delete the running timer file if it exists
            const abstractFile = vault.getAbstractFileByPath(runningTimerPath);
            if (abstractFile instanceof TFile) {
                try {
                    await this.plugin.app.fileManager.trashFile(abstractFile);
                } catch (error) {
                    console.error('Error deleting running timer file:', error);
                }
            }
        }
    }
    
    /**
     * Delete an entry from the CSV file
     */
    private async deleteEntryFromCSV(entry: TimeEntry): Promise<void> {
        const vault = this.plugin.app.vault;
        
        // Get date from the entry
        const entryDate = new Date(entry.startTime);
        const year = entryDate.getFullYear();
        const month = (entryDate.getMonth() + 1).toString().padStart(2, '0');
        
        // Generate file name for the month
        const fileName = `${year}-${month}.csv`;
        const filePath = this.storageDirectory ? `${this.storageDirectory}/${fileName}` : fileName;
        
        if (!(await vault.adapter.exists(filePath))) {
            return; // File doesn't exist, nothing to delete
        }
        
        // Read existing file
        const abstractFile = vault.getAbstractFileByPath(filePath);
        if (!(abstractFile instanceof TFile)) return;
        
        const content = await vault.read(abstractFile);
        const lines = content.split('\n');
        const targetId = entry.id;
        
        // Filter out the line with matching start time
        const newLines: string[] = [lines[0]]; // Keep header
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = this.parseCSVLine(line);
            if (parts.length >= 2) {
                const date = parts[0];
                const startTime = parts[1];
                const lineTime = moment(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm:ss').valueOf();
                if (lineTime.toString() !== targetId) {
                    newLines.push(lines[i]);
                }
            }
        }
        
        // Write the updated content
        await vault.adapter.write(filePath, newLines.join('\n'));
    }

    async saveData(): Promise<void> {
        // This method is called after modifications
        // We don't need to save all entries, as they're already saved to CSV
        // Just ensure categories are up to date
        await this.saveCategories();
    }
    
    /**
     * Load categories from JSON file
     */
    async loadCategories(): Promise<void> {
        const vault = this.plugin.app.vault;
        const categoriesPath = this.storageDirectory ? `${this.storageDirectory}/${this.categoriesFile}` : this.categoriesFile;
        
        
        try {
            // First check if file exists using adapter
            const fileExists = await vault.adapter.exists(categoriesPath);
            
            if (fileExists) {
                // Try to read using vault API first
                const abstractFile = vault.getAbstractFileByPath(categoriesPath);
                
                let categoriesData: string;
                
                if (abstractFile instanceof TFile) {
                    // Use vault.read if file object is available
                    categoriesData = await vault.read(abstractFile);
                } else {
                    // Fallback to adapter.read if getAbstractFileByPath failed
                    categoriesData = await vault.adapter.read(categoriesPath);
                }
                
                const categories = JSON.parse(categoriesData);
                
                // Update settings with loaded categories
                if (categories.categories && Array.isArray(categories.categories)) {
                    this.settings.categories = categories.categories;
                }
                if (categories.defaultCategory) {
                    this.settings.defaultCategory = categories.defaultCategory;
                }
                if (categories.categoryColors) {
                    this.settings.categoryColors = categories.categoryColors;
                } else {
                    // Ensure backward compatibility - assign default colors if not present
                    this.settings.categoryColors = this.assignDefaultColors(this.settings.categories);
                }
                
                // Update the plugin settings
                if (this.plugin.saveSettings) {
                    await this.plugin.saveSettings();
                }
            } else {
                // Create default categories file if it doesn't exist
                await this.saveCategories();
            }
        } catch (e) {
            console.error('Failed to load categories:', e);
        }
    }
    
    /**
     * Save categories to JSON file
     */
    async saveCategories(): Promise<void> {
        const vault = this.plugin.app.vault;
        const categoriesPath = this.storageDirectory ? `${this.storageDirectory}/${this.categoriesFile}` : this.categoriesFile;
        
        const categories = {
            categories: this.settings.categories,
            defaultCategory: this.settings.defaultCategory,
            categoryColors: this.settings.categoryColors
        };
        
        const jsonContent = JSON.stringify(categories, null, 2);
        const abstractFile = vault.getAbstractFileByPath(categoriesPath);
        
        try {
            if (abstractFile instanceof TFile) {
                await vault.modify(abstractFile, jsonContent);
            } else {
                // Check if file exists using adapter before creating
                const fileExists = await vault.adapter.exists(categoriesPath);
                if (fileExists) {
                    // File exists but getAbstractFileByPath failed, use adapter to write
                    await vault.adapter.write(categoriesPath, jsonContent);
                } else {
                    await vault.create(categoriesPath, jsonContent);
                }
            }
        } catch (error) {
            console.error('Error saving categories file:', error);
        }
    }

    getEntries(): TimeEntry[] {
        return [...this.entries];
    }

    getEntry(id: string): TimeEntry | undefined {
        // First check in-memory entries (including running timer)
        return this.entries.find(entry => entry.id === id);
    }

    async getEntryAsync(id: string): Promise<TimeEntry | undefined> {
        // First check in-memory entries (including running timer)
        const memoryEntry = this.entries.find(entry => entry.id === id);
        if (memoryEntry) {
            return memoryEntry;
        }
        
        // If not found in memory, search in CSV files
        // The ID is the timestamp, so we can determine which file to check
        const timestamp = parseInt(id, 10);
        if (isNaN(timestamp)) {
            return undefined;
        }
        
        const entryDate = new Date(timestamp);
        const year = entryDate.getFullYear();
        const month = entryDate.getMonth() + 1;
        
        // Get entries for that month and find the matching one
        try {
            const entries = await this.getEntriesForMonth(year, month);
            return entries.find(entry => entry.id === id);
        } catch (error) {
            return undefined;
        }
    }

    async addEntry(entry: TimeEntry): Promise<void> {
        this.entries.push(entry);
        await this.saveEntryToCSV(entry);
        
        // Sort entries by start time
        this.entries.sort((a, b) => a.startTime - b.startTime);
    }

    async updateEntry(id: string, updatedEntry: Partial<TimeEntry>): Promise<void> {
        // First try to find in memory
        const entryIndex = this.entries.findIndex(entry => entry.id === id);
        if (entryIndex >= 0) {
            const oldEntry = this.entries[entryIndex];
            this.entries[entryIndex] = { ...oldEntry, ...updatedEntry };
            
            // Save to CSV or running timer file
            await this.saveEntryToCSV(this.entries[entryIndex]);
            return;
        }
        
        // If not in memory, try to find in CSV files
        const existingEntry = await this.getEntryAsync(id);
        if (existingEntry) {
            const updatedFullEntry = { ...existingEntry, ...updatedEntry };
            
            // Add to memory for consistency
            this.entries.push(updatedFullEntry);
            
            // Save to CSV
            await this.saveEntryToCSV(updatedFullEntry);
            
            // Sort entries by start time
            this.entries.sort((a, b) => a.startTime - b.startTime);
        }
    }

    async deleteEntry(id: string): Promise<void> {
        // First try to find in memory
        let entry = this.entries.find(e => e.id === id);
        if (entry) {
            this.entries = this.entries.filter(e => e.id !== id);
            await this.deleteEntryFromCSV(entry);
            return;
        }
        
        // If not in memory, try to find in CSV files
        entry = await this.getEntryAsync(id);
        if (entry) {
            await this.deleteEntryFromCSV(entry);
        }
    }

    getRunningEntry(): TimeEntry | undefined {
        return this.entries.find(entry => entry.isRunning);
    }

    async stopRunningEntry(): Promise<void> {
        const runningEntry = this.getRunningEntry();
        if (runningEntry) {
            const now = Date.now();
            const duration = runningEntry.duration + Math.floor((now - runningEntry.startTime) / 1000);
            
            // Update the entry
            const updatedEntry = {
                ...runningEntry,
                endTime: now,
                duration,
                isRunning: false
            };
            
            // Update in entries array
            const entryIndex = this.entries.findIndex(e => e.id === runningEntry.id);
            if (entryIndex >= 0) {
                this.entries[entryIndex] = updatedEntry;
            }
            
            // Save to CSV
            await this.saveEntryToCSV(updatedEntry);
            
            // Remove running timer file
            const vault = this.plugin.app.vault;
            const runningTimerPath = this.storageDirectory ? `${this.storageDirectory}/${this.runningTimerFile}` : this.runningTimerFile;
            if (await vault.adapter.exists(runningTimerPath)) {
                const abstractFile = vault.getAbstractFileByPath(runningTimerPath);
                if (abstractFile) {
                    await this.plugin.app.fileManager.trashFile(abstractFile);
                }
            }
        }
    }

    async getMonthlyReport(year: number, month: number): Promise<MonthlyReport> {
        const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
        const entries = await this.getEntriesForMonth(year, month);

        const categoryBreakdown: { [category: string]: number } = {};
        let totalDuration = 0;

        entries.forEach(entry => {
            const duration = entry.duration;
            totalDuration += duration;
            
            if (!categoryBreakdown[entry.category]) {
                categoryBreakdown[entry.category] = 0;
            }
            categoryBreakdown[entry.category] += duration;
        });

        return {
            month: monthStr,
            totalDuration,
            categoryBreakdown,
            entries
        };
    }

    async getDailyReport(year: number, month: number, day: number): Promise<DailyReport> {
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const entries = await this.getEntriesForDay(year, month, day);

        const categoryBreakdown: { [category: string]: number } = {};
        let totalDuration = 0;

        entries.forEach(entry => {
            const duration = entry.duration;
            totalDuration += duration;
            
            if (!categoryBreakdown[entry.category]) {
                categoryBreakdown[entry.category] = 0;
            }
            categoryBreakdown[entry.category] += duration;
        });

        return {
            date: dateStr,
            totalDuration,
            categoryBreakdown,
            entries
        };
    }

    /**
     * Get entries for a specific month from CSV files
     */
    async getEntriesForMonth(year: number, month: number): Promise<TimeEntry[]> {
        const vault = this.plugin.app.vault;
        const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
        const fileName = `${monthStr}.csv`;
        const filePath = this.storageDirectory ? `${this.storageDirectory}/${fileName}` : fileName;
        
        
        const abstractFile = vault.getAbstractFileByPath(filePath);
        if (!(abstractFile instanceof TFile)) {
            return [];
        }

        try {
            const content = await vault.read(abstractFile);
            const entries = this.parseCSV(content);
            
            // Add any running timer for the current month if it exists
            const runningEntry = this.getRunningEntry();
            if (runningEntry) {
                const runningDate = new Date(runningEntry.startTime);
                if (runningDate.getFullYear() === year && runningDate.getMonth() + 1 === month) {
                    entries.push(runningEntry);
                }
            }
            
            return entries;
        } catch (error) {
            console.error('Error reading monthly CSV file:', error);
            return [];
        }
    }

    /**
     * Get entries for a specific day from CSV files
     */
    async getEntriesForDay(year: number, month: number, day: number): Promise<TimeEntry[]> {
        const monthEntries = await this.getEntriesForMonth(year, month);
        
        return monthEntries.filter(entry => {
            const entryDate = new Date(entry.startTime);
            return entryDate.getDate() === day;
        });
    }

    /**
     * Get entries for a date range (for weekly view)
     */
    async getEntriesForDateRange(startDate: Date, endDate: Date): Promise<TimeEntry[]> {
        const entries: TimeEntry[] = [];
        const vault = this.plugin.app.vault;
        
        // Get all months in the date range
        const months = this.getMonthsInRange(startDate, endDate);
        
        for (const { year, month } of months) {
            const monthEntries = await this.getEntriesForMonth(year, month);
            
            // Filter entries to only include those in the date range
            const filteredEntries = monthEntries.filter(entry => {
                const entryDate = new Date(entry.startTime);
                const inRange = entryDate >= startDate && entryDate <= endDate;
                return inRange;
            });
            
            entries.push(...filteredEntries);
        }
        
        // Sort by start time
        entries.sort((a, b) => a.startTime - b.startTime);
        
        return entries;
    }

    /**
     * Helper method to get all months in a date range
     */
    private getMonthsInRange(startDate: Date, endDate: Date): Array<{year: number, month: number}> {
        const months: Array<{year: number, month: number}> = [];
        const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
        const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
        
        while (current <= end) {
            months.push({
                year: current.getFullYear(),
                month: current.getMonth() + 1
            });
            current.setMonth(current.getMonth() + 1);
        }
        
        return months;
    }
}