export interface TimeEntry {
    id: string;
    startTime: number; // timestamp in milliseconds
    endTime: number | null; // timestamp in milliseconds or null if ongoing
    duration: number; // seconds
    category: string;
    memo: string;
    isRunning: boolean;
}

export interface CategoryConfig {
    name: string;
    color: string; // hex color code
}

export interface PunchClockSettings {
    categories: string[];
    categoryColors: { [categoryName: string]: string }; // category name to hex color mapping
    defaultCategory: string;
    autoSave: boolean;
    showInRibbon: boolean;
    defaultView: 'daily' | 'weekly' | 'monthly';
    dateFormat: string;
    timeFormat: string;
    storageDirectory: string;
    startDayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
}

export interface MonthlyReport {
    month: string; // YYYY-MM format
    totalDuration: number; // seconds
    categoryBreakdown: {
        [category: string]: number; // seconds
    };
    entries: TimeEntry[];
}

export interface DailyReport {
    date: string; // YYYY-MM-DD format
    totalDuration: number; // seconds
    categoryBreakdown: {
        [category: string]: number; // seconds
    };
    entries: TimeEntry[];
}