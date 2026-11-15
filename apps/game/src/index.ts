// The package entry stays JSX-free so the root tsconfig (which covers .ts only)
// can type-check the workspace. Screens and components are imported by path.
export * from './store/gameStore';
export * from './testApi';
