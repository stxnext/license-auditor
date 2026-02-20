# License Auditor Landing Page

This is the landing page application for License Auditor, built with React, TypeScript, and Shadcn/UI components. The app provides a modern, responsive interface showcasing the License Auditor product.

## Tech Stack

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Shadcn/UI Components
- Radix UI

## Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (v18 or higher)
- Bun
- Git

## Installation

Since this is part of a monorepo, you'll need to install dependencies from the root directory:

```bash
# From the root directory
bun install

```

## Development

To start the development server:

```bash
# From the root directory
turbo dev

# Or from the apps/landing directory
cd apps/landing
bun run dev
```

The app will be available at http://localhost:5173

## Available Scripts

- `bun run dev` - Start the development server
- `bun run build` - Build the application for production
- `bun run lint` - Run ESLint to check for code issues
- `bun run preview` - Preview the production build locally

## Project Structure

```
apps/landing/
├── src/              # Source files
├── public/           # Static assets
├── components/       # Reusable UI components
├── styles/          # CSS and style files
└── vite.config.ts   # Vite configuration
```

## Credits

- Icons from [devicon.dev](https://devicon.dev/)
- UI components based on [shadcn/ui](https://ui.shadcn.com/)
- Originally forked from [leoMirandaa/shadcn-landing-page](https://github.com/leoMirandaa/shadcn-landing-page)

## License

This project is proprietary and UNLICENSED. All rights reserved.

## TODO

- [ ] clean styles in index.css
