/**
 * Formats a duration in seconds into a human-readable string.
 * 
 * @param seconds The duration in seconds
 * @param format The format to use: 'short' for 1h 30m, 'long' for 1 hour 30 minutes, 'clock' for 01:30:00
 * @returns The formatted duration string
 */
export function formatDuration(seconds: number, format: 'short' | 'long' | 'clock' = 'short'): string {
    if (seconds < 0) seconds = 0;
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (format === 'clock') {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else if (format === 'long') {
        const parts = [];
        if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
        if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
        if (seconds < 60 && hours === 0) parts.push(`${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`);
        return parts.join(' ');
    } else {
        // Short format
        if (hours === 0 && minutes === 0) return `${remainingSeconds}s`;
        if (hours === 0) return `${minutes}m`;
        return `${hours}h ${minutes}m`;
    }
}

/**
 * Generates a unique ID for time entries.
 * 
 * @returns A unique string ID based on the current timestamp and a random value
 */
export function generateId(): string {
    return Date.now().toString() + Math.random().toString(36).substring(2, 9);
}

/**
 * Returns the current date in YYYY-MM-DD format.
 * 
 * @returns Current date string in YYYY-MM-DD format
 */
export function getCurrentDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

/**
 * Returns a month name from its number.
 * 
 * @param month Month number (1-12)
 * @returns Month name
 */
export function getMonthName(month: number): string {
    return [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ][month - 1];
}

/**
 * Creates a "safe" filename from a string by replacing invalid characters.
 * 
 * @param name The string to convert to a safe filename
 * @returns A string with invalid filename characters replaced
 */
export function sanitizeFilename(name: string): string {
    return name.replace(/[/\\?%*:|"<>]/g, '-');
}