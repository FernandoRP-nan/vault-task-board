# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [2.2.0] - 2026-06-27

### Fixed
- Scroll vertical en la vista del tablero con contenedor interno dedicado (`view-scroll`).

## [2.1.0] - 2026-06-27

### Fixed
- Scroll vertical en la vista del tablero y en modales de sugerencias.

## [2.0.0] - 2026-06-27

### Changed
- Migración completa a TypeScript con módulos ES (`src/lib/*.ts`, `src/runtime/`).
- Eliminado uso de `window.*` en el núcleo del plugin.

## [1.1.0] - 2026-06-27

### Added
- sql.js empaquetado en `assets/` (sin dependencia externa en el vault).
- Migración automática desde `.obsidian/scripts/kanban_tareas.db`.
- Almacenamiento en `.obsidian/plugins-data/vault-task-board/`.

### Changed
- README y documentación orientados a instalación pública.

## [1.0.0] - 2026-06-27

### Added
- Tablero Kanban con proyectos, dependencias y subtareas.
- API `TaskBoardBridge` para integración con otros plugins.
- Vista de panel y comandos de Obsidian.
