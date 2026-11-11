// Render starts this file from the repository root and supplies PORT.
process.env.HOST ||= '0.0.0.0';
await import('./orbitcraft/server/index.js');
