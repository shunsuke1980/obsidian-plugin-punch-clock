import { App, PluginSettingTab, Setting } from 'obsidian';
import PunchClockPlugin from '../main';
import { PunchClockSettings } from './types';

export class PunchClockSettingTab extends PluginSettingTab {
    plugin: PunchClockPlugin;
    constructor(app: App, plugin: PunchClockPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    
    /**
     * Updates dynamic styles in all open views
     */
    private updateViewStyles(): void {
        // Get all leaves with our view type
        const leaves = this.app.workspace.getLeavesOfType('punch-clock-view');
        leaves.forEach((leaf) => {
            const view = leaf.view as any;
            if (view && view.updateDynamicStyles) {
                view.updateDynamicStyles();
            }
        });
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Punch Clock Settings' });

        // Categories
        new Setting(containerEl)
            .setName('Categories')
            .setDesc('Comma-separated list of categories for time entries.')
            .addText(text => text
                .setPlaceholder('Work, Personal, Research')
                .setValue(this.plugin.settings.categories.join(', '))
                .onChange(async (value) => {
                    // Split by comma and trim whitespace
                    this.plugin.settings.categories = value
                        .split(',')
                        .map(category => category.trim())
                        .filter(category => category.length > 0);

                    await this.plugin.saveSettings();
                    // Also save categories to the storage directory
                    if (this.plugin.dataManager) {
                        await this.plugin.dataManager.saveCategories();
                    }
                    // Refresh the settings display to show color pickers for new categories
                    this.display();
                }));

        // Category Colors
        if (this.plugin.settings.categories.length > 0) {
            containerEl.createEl('h3', { text: 'Category Colors' });

            // Ensure all categories have colors
            if (!this.plugin.settings.categoryColors) {
                this.plugin.settings.categoryColors = {};
            }

            this.plugin.settings.categories.forEach(category => {
                new Setting(containerEl)
                    .setName(category)
                    .setDesc(`Choose a color for the ${category} category`)
                    .addColorPicker(color => {
                        const currentColor = this.plugin.settings.categoryColors[category] || '#4a90e2';
                        color.setValue(currentColor)
                            .onChange(async (value) => {
                                this.plugin.settings.categoryColors[category] = value;
                                await this.plugin.saveSettings();
                                // Also save categories to the storage directory
                                if (this.plugin.dataManager) {
                                    await this.plugin.dataManager.saveCategories();
                                }
                                // Update dynamic styles in the view
                                this.updateViewStyles();
                            });
                    });
            });
        }

        // Default Category
        new Setting(containerEl)
            .setName('Default Category')
            .setDesc('The default category for new time entries.')
            .addDropdown(dropdown => {
                this.plugin.settings.categories.forEach(category => {
                    dropdown.addOption(category, category as string);
                });
                dropdown.setValue(this.plugin.settings.defaultCategory);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.defaultCategory = value;
                    await this.plugin.saveSettings();
                    // Also save categories to the storage directory
                    if (this.plugin.dataManager) {
                        await this.plugin.dataManager.saveCategories();
                    }
                });
            });

        // Auto-save
        new Setting(containerEl)
            .setName('Auto-save Entries')
            .setDesc('Automatically save entries when timer is stopped.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoSave)
                .onChange(async (value) => {
                    this.plugin.settings.autoSave = value;
                    await this.plugin.saveSettings();
                }));


        // Default view
        new Setting(containerEl)
            .setName('Default View')
            .setDesc('The default view when opening the punch clock panel.')
            .addDropdown(dropdown => {
                dropdown.addOption('daily', 'Daily');
                dropdown.addOption('weekly', 'Weekly');
                dropdown.addOption('monthly', 'Monthly');
                dropdown.setValue(this.plugin.settings.defaultView);
                dropdown.onChange(async (value: 'daily' | 'weekly' | 'monthly') => {
                    this.plugin.settings.defaultView = value;
                    await this.plugin.saveSettings();
                });
            });

        // Date format setting
        new Setting(containerEl)
            .setName('Date Format')
            .setDesc('Format for displaying dates. Uses Moment.js syntax.')
            .addText(text => text
                .setPlaceholder('YYYY-MM-DD')
                .setValue(this.plugin.settings.dateFormat)
                .onChange(async (value) => {
                    this.plugin.settings.dateFormat = value || 'YYYY-MM-DD';
                    await this.plugin.saveSettings();
                }));

        // Time format setting
        new Setting(containerEl)
            .setName('Time Format')
            .setDesc('Format for displaying times. Uses Moment.js syntax.')
            .addDropdown(dropdown => {
                dropdown.addOption('HH:mm:ss', '24-hour (13:45:30)');
                dropdown.addOption('hh:mm:ss A', '12-hour (01:45:30 PM)');
                dropdown.addOption('HH:mm', '24-hour, no seconds (13:45)');
                dropdown.addOption('hh:mm A', '12-hour, no seconds (01:45 PM)');
                dropdown.setValue(this.plugin.settings.timeFormat);
                dropdown.onChange(async (value) => {
                    this.plugin.settings.timeFormat = value;
                    await this.plugin.saveSettings();
                });
            });

        // Storage directory setting
        new Setting(containerEl)
            .setName('Storage Directory')
            .setDesc('Directory to store punch clock data (CSV files and categories).')
            .addText(text => text
                .setPlaceholder('punch-clock-data')
                .setValue(this.plugin.settings.storageDirectory)
                .onChange(async (value) => {
                    this.plugin.settings.storageDirectory = value || 'punch-clock-data';
                    await this.plugin.saveSettings();
                }));

        // Start day of week setting
        new Setting(containerEl)
            .setName('Start Day of Week')
            .setDesc('Choose which day the week starts on (affects weekly view).')
            .addDropdown(dropdown => {
                dropdown.addOption('0', 'Sunday');
                dropdown.addOption('1', 'Monday');
                dropdown.addOption('2', 'Tuesday');
                dropdown.addOption('3', 'Wednesday');
                dropdown.addOption('4', 'Thursday');
                dropdown.addOption('5', 'Friday');
                dropdown.addOption('6', 'Saturday');
                dropdown.setValue(String(this.plugin.settings.startDayOfWeek));
                dropdown.onChange(async (value) => {
                    this.plugin.settings.startDayOfWeek = parseInt(value) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
                    await this.plugin.saveSettings();
                });
            });
    }
}