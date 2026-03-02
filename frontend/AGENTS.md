# AGENTS.md

Starter guidance for contributors and AI agents working in this repo.

## Project overview
- Stack: TypeScript + Vite + React
- Package manager: npm (see `package-lock.json`)
- Source: `src/`
- Build output: `dist/`

## Environment
- Node version: see `.nvmrc` or `package.json` engines (if present)
- Vite config: `vite.config.ts`
- TypeScript configs: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`

## Folder hints
- `src/main.tsx`: app entrypoint
- `src/App.tsx`: root component
- `src/lib/`: shared utilities
- `public/`: static assets copied as-is
- 'docs/': documentation files. Consult for application architecture, design, and usage.

## Code style & conventions
- Prefer functional React components with hooks.
- Keep components small; split by feature when a file grows large.
- Use camelCase for variables, functions, and methods. When naming types and interfaces, use PascalCase.
  - When a name includes an acronyn and you're using PascalCase, capitalize every letter (e.g.: `smartUSBDevice`, `HTTPRequest`, `SCPICommand`). 
  - When a name includes an acronym and you're using camelCase, do not capitalize it if it's the at the start of the name, do not capitalize the first letter (e.g.: `usbDevice`, not `USBDevice`).
  - If the acronym is in the middle or end of the name, capitalize all letters (e.g.: `getUSBDevice`, `parseHTTPResponse`).
- Do not use `private` fields or methods; use `protected` or `public`.
- Prefer composition over inheritance for React components.
- Use async/await for asynchronous code.
- Use template literals for string interpolation.
- Add docblocks to all functions and classes, even if protected.
  - Add ///< comments for single-line explanations of variables or class fields.
- Use ESLint and Prettier for code formatting and linting.

## Javascript/TypeScript
- Use TypeScript types/interfaces for public props and exports.
- Write modern, idiomatic TypeScript/JavaScript (e.g., use `const`/`let`, arrow functions, async/await).
- Prefer named exports for reusable components/utilities.
- Keep side effects inside `useEffect` with cleanups.
- Take full advantage of TypeScript's type system and capabilities.
- Use 2 spaces for indentation.

## UI and UX
- Avoid blocking the main thread; use async operations or workers for heavy tasks.
- Ensure components are accessible (e.g., proper ARIA attributes, keyboard navigation).
- Use CSS modules or styled-components for scoped styling.
- Follow responsive design principles for mobile compatibility.
- Header popover typography must use shared tokens from `src/index.css`:
  - `--font-size-header-popup-base`
  - `--font-size-header-popup-text`
  - `--font-size-header-popup-label`
  - `--font-size-header-popup-input`
  - `--font-size-header-popup-hint`
  - `--font-size-header-popup-button`
  Do not hardcode popup font sizes in instrument CSS modules.

## Testing
- Unit tests live near sources (e.g. `src/**/__tests__` or `*.test.ts/tsx`).
- Prefer testing user-visible behavior with React Testing Library (if present).
- Run `npm run test` before PRs.
- Always write tests for new features and bug fixes.
- Always run tests after modifying existing code.
- Keep test files adjacent to the code they test. Do not create separate `__tests__` folders unless necessary.

# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in `PLANS.md`) from design to implementation.
