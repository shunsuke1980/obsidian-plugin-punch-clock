# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Punch Clock Obsidian plugin codebase.

## Project Overview

**Punch Clock** is a comprehensive time tracking plugin for Obsidian with:
- Real-time timer functionality
- Category-based time tracking with custom colors
- Multiple view modes (Daily, Weekly, Monthly)
- CSV data export and JSON configuration
- Mobile and desktop compatibility

## Commands

- **Install**: `npm install`
- **Build**: `npm run build` (TypeScript compilation + esbuild)
- **Build (esbuild only)**: `node esbuild.config.mjs production`
- **Lint**: `npm run lint` (ESLint - may need configuration)
- **Test**: `npm run test` (Jest - if tests exist)

## Project Structure

```
src/
├── types.ts           # TypeScript interfaces (PunchClockSettings, TimeEntry, etc.)
├── main.ts           # Main plugin class (PunchClockPlugin)
├── view.ts           # Main view component (PunchClockView) with Daily/Weekly/Monthly views
├── modal.ts          # Timer modal (TimerModal) for starting/managing timers
├── settings-tab.ts   # Settings UI (PunchClockSettingTab) with category color pickers
├── data-manager.ts   # Data persistence (DataManager) handling CSV/JSON files
styles.css            # Plugin styling with chart visualizations
manifest.json         # Plugin metadata (id: "punch-clock")
package.json          # Dependencies and build scripts
```

## Key Features Implementation

### Category Colors
- **Settings**: Color pickers for each category in settings tab
- **Storage**: Colors saved in `categories.json` with backward compatibility
- **Display**: Applied to timers, charts, and category badges throughout UI

### Real-time Updates
- **Running timers**: Background color matches category color
- **Category breakdown**: Updates every second in Daily view while timer runs
- **Live switching**: Category changes update timer background immediately

### View Types
- **Daily**: Detailed entries list + real-time category breakdown chart
- **Weekly**: Summary with category charts + daily breakdown (no entries list)
- **Monthly**: Total time + category distribution chart only

### Data Storage
- **CSV files**: Monthly files (`YYYY-MM.csv`) for time entries
- **JSON files**: `categories.json` (categories + colors), `running-timer.json` (active timer)
- **Directory**: Configurable storage directory (default: `punch-clock-data`)

## Code Style Guidelines

- **TypeScript**: Strict type safety with custom interfaces
- **Naming**: 
  - Classes: PascalCase (`PunchClockView`, `DataManager`)
  - Methods/variables: camelCase (`updateCategoryBreakdown`, `currentDate`)
  - CSS classes: kebab-case with prefix (`punch-clock-view`, `chart-bar-container`)
- **Async/await**: Preferred over Promise chains
- **Error handling**: Proper try/catch with user-friendly notices
- **Comments**: JSDoc for public methods, inline for complex logic
- **Imports**: External libs, then internal modules, then relative paths

## Important Notes

- **No Anthropic SDK**: Project is clean of AI SDK dependencies
- **Mobile compatible**: `isDesktopOnly: false` in manifest
- **Color system**: Uses CSS custom properties for theming
- **Obsidian API**: Extensive use of Obsidian's Plugin, Modal, Setting, and ButtonComponent APIs
- **Moment.js**: Used for all date/time formatting and manipulation

## Development Workflow

1. Make code changes
2. Run `npm run build` or `node esbuild.config.mjs production`
3. Copy `main.js` and `manifest.json` to Obsidian plugins directory
4. Reload Obsidian to test changes
5. Use browser dev tools to debug CSS/JavaScript issues

## Testing

- Manual testing in Obsidian desktop and mobile
- Test all view modes (Day/Week/Month)
- Test timer functionality (start/stop/continue)
- Test category color changes and real-time updates
- Verify data persistence across sessions