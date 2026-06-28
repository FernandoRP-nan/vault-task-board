/* kanban_ui.ts — migrado a módulo TS */
// @ts-nocheck
import { KanbanDB } from "./kanban_db";
import { KanbanModals } from "./kanban_modals";
import { KanbanPrefs } from "./kanban_prefs";
import { DiagramaExpandidoModal } from "./kanban_diagram_modal";
import { abrirBusquedaTareas } from "./kanban_search";
import { montarStageDiagrama, inicializarViewportDiagrama } from "./kanban_diagram_viewport";
import { Modal, Setting, SuggestModal, Notice } from "obsidian";

/* kanban_ui.js - Mapa Dr. Stone (Mermaid) + Tablero Kanban con Drag & Drop */

let kanbanUiApp = null;

export const KanbanUI = {
    ESTADOS: ["Por Hacer", "En Proceso", "Terminado"],
    MIME_TAREA_DRAG: "application/x-kanban-tarea-id",

    configure: (app) => {
        kanbanUiApp = app;
    },

    _getApp: () => kanbanUiApp,

    _abrirBusquedaTareas: (app, db, dbPath, onRefresh) => {
        abrirBusquedaTareas(app, db, dbPath, onRefresh, KanbanUI._abrirEdicionTarea);
    },

    _extraerTareaIdDesdeDataTransfer: (dataTransfer) => {
        const custom = dataTransfer.getData(KanbanUI.MIME_TAREA_DRAG);
        if (custom) return parseInt(custom, 10) || null;
        const plain = dataTransfer.getData("text/plain");
        return plain ? parseInt(plain, 10) || null : null;
    },

    _marcarDatosDragTarea: (dataTransfer, tareaId) => {
        const id = String(tareaId);
        dataTransfer.setData(KanbanUI.MIME_TAREA_DRAG, id);
        dataTransfer.setData("text/plain", id);
        dataTransfer.effectAllowed = "all";
    },

    injectStyles: () => {
        const ID = "estilos-kanban-drstone-v14";
        document.getElementById("estilos-kanban-drstone")?.remove();
        document.getElementById("estilos-kanban-drstone-v2")?.remove();
        document.getElementById("estilos-kanban-drstone-v3")?.remove();
        document.getElementById("estilos-kanban-drstone-v4")?.remove();
        document.getElementById("estilos-kanban-drstone-v5")?.remove();
        document.getElementById("estilos-kanban-drstone-v6")?.remove();
        document.getElementById("estilos-kanban-drstone-v7")?.remove();
        document.getElementById("estilos-kanban-drstone-v8")?.remove();
        document.getElementById("estilos-kanban-drstone-v13")?.remove();
        if (document.getElementById(ID)) return;

        const styleEl = document.createElement("style");
        styleEl.id = ID;
        styleEl.textContent = `
            .kanban-layout-principal {
                display: flex;
                flex-direction: column;
                gap: 28px;
                width: 100%;
            }
            .kanban-seccion-mapa {
                background: var(--background-secondary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 10px;
                padding: 20px;
            }
            .kanban-seccion-mapa h3 {
                margin: 0 0 16px 0;
                color: var(--text-accent);
            }
            .kanban-mermaid-contenedor {
                display: flex;
                flex-direction: column;
                gap: 12px;
                min-height: 120px;
            }
            .kanban-mermaid-zoom-wrap {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .kanban-mermaid-zoom-bar {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 6px;
                flex-wrap: wrap;
            }
            .kanban-mermaid-zoom-btn {
                min-width: 32px;
                padding: 4px 10px;
                border-radius: 6px;
                border: 1px solid var(--background-modifier-border);
                background: var(--background-secondary);
                color: var(--text-normal);
                cursor: pointer;
                font-weight: 600;
                line-height: 1.2;
            }
            .kanban-mermaid-zoom-btn:hover {
                border-color: var(--interactive-accent);
            }
            .kanban-mermaid-zoom-label {
                min-width: 3.2em;
                text-align: center;
                font-size: 0.85em;
                color: var(--text-muted);
                font-variant-numeric: tabular-nums;
            }
            .kanban-mermaid-viewport {
                position: relative;
                height: min(420px, 48vh);
                min-height: 220px;
                overflow: hidden;
                border: 1px solid var(--background-modifier-border);
                border-radius: 8px;
                background: var(--background-primary);
                overscroll-behavior: contain;
                cursor: default;
                scrollbar-width: none;
            }
            .kanban-mermaid-viewport::-webkit-scrollbar {
                display: none;
            }
            .kanban-mermaid-stage {
                transform-origin: 0 0;
                will-change: transform;
            }
            .kanban-mermaid-minimap {
                position: absolute;
                right: 10px;
                bottom: 10px;
                width: 128px;
                height: 84px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 8px;
                background: color-mix(in srgb, var(--background-primary) 88%, transparent);
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
                z-index: 12;
                overflow: hidden;
                cursor: crosshair;
                backdrop-filter: blur(4px);
                pointer-events: auto;
            }
            .kanban-mermaid-minimap.kanban-minimap-oculto {
                display: none;
            }
            .kanban-mermaid-minimap-inner {
                transform-origin: 0 0;
                pointer-events: none;
                opacity: 0.72;
            }
            .kanban-mermaid-minimap-inner svg {
                display: block;
                max-width: none;
            }
            .kanban-mermaid-minimap-lens {
                position: absolute;
                left: 0;
                top: 0;
                border: 2px solid var(--interactive-accent);
                background: color-mix(in srgb, var(--interactive-accent) 18%, transparent);
                border-radius: 3px;
                box-sizing: border-box;
                pointer-events: none;
            }
            .kanban-mermaid-viewport.kanban-mermaid-panning {
                cursor: grabbing;
                user-select: none;
            }
            .kanban-mermaid-svg {
                position: relative;
            }
            .kanban-mermaid-svg svg {
                max-width: none;
                height: auto;
            }
            .kanban-mermaid-svg svg { display: block; }
            .kanban-mermaid-svg [data-tarea-id] {
                cursor: grab;
                user-select: none;
                -webkit-user-select: none;
                touch-action: none;
            }
            .kanban-mermaid-svg [data-tarea-id]:active { cursor: grabbing; }
            .kanban-mermaid-svg [data-tarea-id]:hover rect,
            .kanban-mermaid-svg [data-tarea-id]:hover polygon,
            .kanban-mermaid-svg [data-tarea-id]:hover path {
                opacity: 0.92;
            }
            .kanban-mermaid-svg [data-tarea-id].kanban-mermaid-arrastrando {
                opacity: 0.5;
            }
            .kanban-mermaid-svg [data-tarea-id].kanban-mermaid-drop-over rect,
            .kanban-mermaid-svg [data-tarea-id].kanban-mermaid-drop-over polygon,
            .kanban-mermaid-svg [data-tarea-id].kanban-mermaid-drop-over path {
                stroke: var(--interactive-accent) !important;
                stroke-width: 3px !important;
            }
            .kanban-mermaid-overlays {
                position: absolute;
                inset: 0;
                pointer-events: none;
                z-index: 2;
            }
            .kanban-mermaid-overlay {
                position: absolute;
                pointer-events: auto;
                cursor: grab;
                border-radius: 16px;
                background: transparent;
            }
            .kanban-mermaid-overlay:active { cursor: grabbing; }
            .kanban-mermaid-overlay.kanban-mermaid-drop-over {
                outline: 2px dashed var(--interactive-accent);
                outline-offset: 2px;
                background: rgba(var(--interactive-accent-rgb, 99, 102, 241), 0.12);
            }
            .kanban-mermaid-fantasma {
                position: fixed;
                z-index: 10000;
                pointer-events: none;
                padding: 6px 14px;
                border-radius: 16px;
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                font-weight: 600;
                font-size: 13px;
                box-shadow: 0 4px 14px rgba(0,0,0,0.28);
                opacity: 0.94;
                transform: translate(-4px, -4px);
            }
            .kanban-mermaid-svg .edgePath path {
                stroke-width: 2px;
                stroke: #718096;
            }
            .kanban-mermaid-svg .arrowheadPath {
                fill: #718096;
                stroke: #718096;
            }
            .kanban-mapa-proyecto {
                border-radius: 8px;
                border: 1px solid var(--background-modifier-border);
                padding: 16px;
                margin-bottom: 16px;
            }
            .kanban-mapa-proyecto:last-child { margin-bottom: 0; }
            .kanban-mapa-proyecto-titulo {
                margin: 0 0 12px 0;
                font-size: 0.95em;
                font-weight: 700;
                color: var(--text-normal);
            }
            .kanban-grupo-proyecto {
                display: flex;
                flex-direction: column;
                gap: 8px;
                border-radius: 8px;
                padding: 10px;
                margin-bottom: 12px;
                border: 1px solid transparent;
            }
            .kanban-grupo-proyecto:last-child { margin-bottom: 0; }
            .kanban-grupo-proyecto-titulo {
                font-size: 0.75em;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                margin-bottom: 2px;
                opacity: 0.9;
            }
            .kanban-mermaid-hint {
                margin: 0 0 12px 0;
                font-size: 0.85em;
                color: var(--text-muted);
            }
            .kanban-mapa-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                flex-wrap: wrap;
                margin-bottom: 8px;
            }
            .kanban-mapa-header h3 {
                margin: 0;
                color: var(--text-accent);
            }
            .kanban-btn-colapsar-mapa {
                padding: 4px 12px;
                border-radius: 6px;
                border: 1px solid var(--background-modifier-border);
                background: var(--background-secondary);
                cursor: pointer;
                font-size: 0.85em;
                white-space: nowrap;
            }
            .kanban-btn-colapsar-mapa:hover {
                border-color: var(--interactive-accent);
            }
            .kanban-mapa-cuerpo--oculto {
                display: none !important;
            }
            .kanban-subtarea-grip {
                cursor: grab;
                color: var(--text-muted);
                font-size: 1.1em;
                line-height: 1;
                padding: 4px 2px;
                flex-shrink: 0;
                user-select: none;
            }
            .kanban-subtarea-fila.kanban-subtarea-arrastrando {
                opacity: 0.55;
            }
            .kanban-subtarea-fila.kanban-subtarea-drop-target {
                outline: 2px dashed var(--interactive-accent);
                outline-offset: 2px;
            }
            .kanban-tarjeta-progreso {
                height: 4px;
                border-radius: 4px;
                background: var(--background-modifier-border);
                margin-top: 8px;
                overflow: hidden;
            }
            .kanban-tarjeta-progreso-fill {
                height: 100%;
                border-radius: 4px;
                background: var(--interactive-accent);
                transition: width 0.2s ease;
            }
            .kanban-modal-atajos {
                font-size: 0.82em;
                color: var(--text-muted);
                margin: 0 0 12px 0;
            }
            .modal.kanban-modal-diagrama-expandido {
                width: min(96vw, 1200px);
                max-width: 96vw;
            }
            .kanban-diagrama-expandido-host .kanban-mermaid-viewport {
                height: min(72vh, 680px);
                min-height: 360px;
            }
            .kanban-seccion-tablero {
                background: var(--background-secondary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 10px;
                padding: 20px;
            }
            .kanban-tablero-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 16px;
                flex-wrap: wrap;
                margin-bottom: 16px;
                padding-bottom: 14px;
                border-bottom: 1px solid var(--background-modifier-border);
            }
            .kanban-tablero-titulo {
                margin: 0;
                color: var(--text-accent);
                font-size: 1.1em;
            }
            .kanban-tablero-subtitulo {
                margin: 4px 0 0 0;
                font-size: 0.85em;
                color: var(--text-muted);
            }
            .kanban-toggles-wrap {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                align-items: center;
            }
            .kanban-toggle-grupo {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 14px;
                border-radius: 8px;
                background: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                font-size: 0.9em;
                user-select: none;
            }
            .kanban-toggle-grupo input { cursor: pointer; accent-color: var(--interactive-accent); }
            .kanban-toggle-grupo label { cursor: pointer; font-weight: 500; }
            .kanban-toolbar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 16px;
                flex-wrap: wrap;
            }
            .kanban-panel-superior {
                background: var(--background-secondary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 10px;
                padding: 16px 20px;
            }
            .kanban-filtro-grupo {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }
            .kanban-filtro-grupo label {
                font-weight: 600;
                font-size: 0.95em;
                white-space: nowrap;
            }
            .kanban-filtro-select {
                padding: 8px 12px;
                border-radius: 6px;
                border: 1px solid var(--background-modifier-border);
                background: var(--background-primary);
                min-width: 220px;
                height: 38px;
            }
            .kanban-btn-nueva {
                background: var(--interactive-accent);
                color: var(--text-on-accent);
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                font-weight: bold;
                cursor: pointer;
            }
            .kanban-btn-nueva:hover { opacity: 0.9; }
            .kanban-toolbar-acciones {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }
            .kanban-btn-gestion-proyectos {
                padding: 6px 12px;
                border-radius: 6px;
                border: 1px solid var(--background-modifier-border);
                background: var(--background-primary);
                cursor: pointer;
            }
            .kanban-btn-buscar,
            .kanban-btn-gestion-proyectos {
                background: var(--background-primary);
                color: var(--text-normal);
                border: 1px solid var(--background-modifier-border);
                padding: 10px 16px;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
            }
            .kanban-btn-gestion-proyectos:hover {
                border-color: var(--interactive-accent);
            }
            .kanban-proyectos-seccion { margin-bottom: 8px; }
            .kanban-proyectos-lista {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .kanban-proyecto-fila {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 12px;
                padding: 10px 12px;
                border-radius: 8px;
                border: 1px solid var(--background-modifier-border);
                background: var(--background-primary);
            }
            .kanban-proyecto-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
                min-width: 0;
            }
            .kanban-proyecto-btn-archivar,
            .kanban-proyecto-btn-restaurar {
                flex-shrink: 0;
                padding: 6px 12px;
                border-radius: 6px;
                border: 1px solid var(--background-modifier-border);
                background: var(--background-secondary);
                cursor: pointer;
                font-size: 0.85em;
                white-space: nowrap;
            }
            .kanban-proyecto-btn-archivar:hover { border-color: var(--text-muted); }
            .kanban-proyecto-btn-restaurar:hover { border-color: var(--interactive-accent); }
            .kanban-columnas-wrapper {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 16px;
            }
            @media (max-width: 900px) {
                .kanban-columnas-wrapper { grid-template-columns: 1fr; }
            }
            .kanban-columna {
                background: var(--background-secondary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 10px;
                min-height: 200px;
                display: flex;
                flex-direction: column;
            }
            .kanban-columna-header {
                padding: 12px 14px;
                font-weight: 700;
                border-bottom: 1px solid var(--background-modifier-border);
                text-align: center;
            }
            .kanban-columna-por-hacer .kanban-columna-header { color: #a0aec0; }
            .kanban-columna-en-proceso .kanban-columna-header { color: #63b3ed; }
            .kanban-columna-terminado .kanban-columna-header { color: #68d391; }
            .kanban-columna-body {
                flex: 1;
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                min-height: 120px;
            }
            .kanban-columna-body.kanban-drag-over {
                background: var(--background-modifier-hover);
                outline: 2px dashed var(--interactive-accent);
                outline-offset: -4px;
            }
            .kanban-tarjeta {
                background: var(--background-primary);
                border: 1px solid var(--background-modifier-border);
                border-radius: 8px;
                padding: 8px 10px;
                cursor: grab;
                transition: box-shadow 0.15s ease, border-color 0.15s ease;
            }
            .kanban-tarjeta:hover {
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                border-color: var(--interactive-accent);
            }
            .kanban-tarjeta:active { cursor: grabbing; }
            .kanban-tarjeta-bloqueada {
                background: #2d3748;
                border-color: #4a5568;
                opacity: 0.9;
            }
            .kanban-tarjeta-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 6px;
            }
            .kanban-tarjeta-texto {
                flex: 1;
                font-weight: 600;
                font-size: 0.9em;
                line-height: 1.3;
                word-break: break-word;
            }
            .kanban-tarjeta-meta {
                font-size: 0.76em;
                line-height: 1.25;
                color: var(--text-muted);
                margin-top: 4px;
            }
            .kanban-tarjeta-nota {
                font-size: 0.76em;
                line-height: 1.3;
                color: var(--text-muted);
                margin-top: 4px;
                font-style: italic;
                word-break: break-word;
                opacity: 0.9;
            }
            .kanban-tarjeta-acciones {
                display: flex;
                flex-shrink: 0;
                margin: 0;
            }
            .kanban-tarjeta-btn {
                background: none;
                border: none;
                cursor: pointer;
                font-size: 0.95em;
                opacity: 0.65;
                padding: 0 2px;
                line-height: 1;
            }
            .kanban-tarjeta-btn:hover { opacity: 1; }
            .kanban-formulario-grid {
                display: grid;
                grid-template-columns: 1.2fr 2.8fr;
                gap: 14px 12px;
                align-items: center;
            }
            .kanban-formulario-grid input,
            .kanban-formulario-grid select,
            .kanban-formulario-grid textarea {
                width: 100%;
                padding: 8px 12px;
                border-radius: 6px;
                border: 1px solid var(--background-modifier-border);
                background: var(--background-primary);
            }
            .kanban-formulario-grid input,
            .kanban-formulario-grid select {
                height: 38px;
            }
            .kanban-input-nota {
                min-height: 88px;
                max-height: 200px;
                resize: vertical;
                line-height: 1.4;
                font-family: inherit;
            }
            .kanban-formulario-acciones {
                display: flex;
                gap: 12px;
                justify-content: flex-end;
                margin-top: 24px;
                padding-top: 16px;
                border-top: 1px solid var(--background-modifier-border);
            }
            .modal:has(.kanban-modal-tarea) {
                width: min(960px, 94vw);
                max-width: 960px;
            }
            .modal:has(.kanban-modal-tarea) .modal-content {
                max-height: 88vh;
                overflow-y: auto;
            }
            .kanban-modal-tarea-titulo {
                margin: 0 0 18px 0;
                color: var(--text-accent);
            }
            .kanban-form-doble {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 22px;
                align-items: start;
            }
            @media (max-width: 760px) {
                .kanban-form-doble { grid-template-columns: 1fr; }
            }
            .kanban-form-columna {
                display: flex;
                flex-direction: column;
                gap: 14px;
                min-width: 0;
            }
            .kanban-campo {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .kanban-campo label {
                font-weight: 600;
                font-size: 0.9em;
            }
            .kanban-campo-nota {
                flex: 1;
                min-height: 0;
            }
            .kanban-input,
            .kanban-form-columna input,
            .kanban-form-columna select,
            .kanban-form-columna textarea {
                width: 100%;
                padding: 8px 12px;
                border-radius: 6px;
                border: 1px solid var(--background-modifier-border);
                background: var(--background-primary);
                box-sizing: border-box;
            }
            .kanban-input-nota-amplia {
                min-height: 220px;
                resize: vertical;
                line-height: 1.45;
                font-family: inherit;
                flex: 1;
            }
            .kanban-fila-proyecto,
            .kanban-fila-acciones {
                display: flex;
                gap: 8px;
                align-items: center;
                flex-wrap: wrap;
            }
            .kanban-fila-proyecto .kanban-input { flex: 1; min-width: 120px; }
            .kanban-input-sub {
                flex: 1;
                min-width: 140px;
                resize: none;
                overflow: hidden;
                min-height: 2.5em;
                line-height: 1.45;
                word-break: break-word;
                white-space: pre-wrap;
            }
            .kanban-chips-requisitos {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                min-height: 28px;
            }
            .kanban-chip-req {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                border-radius: 6px;
                background: var(--background-modifier-border);
                font-size: 0.85em;
            }
            .kanban-chip-quitar,
            .kanban-subtarea-quitar,
            .kanban-imagen-quitar {
                border: none;
                background: none;
                cursor: pointer;
                padding: 0 2px;
                opacity: 0.7;
            }
            .kanban-texto-vacio {
                color: var(--text-muted);
                font-style: italic;
                font-size: 0.88em;
            }
            .kanban-subtareas-lista {
                display: flex;
                flex-direction: column;
                gap: 8px;
                max-height: min(320px, 40vh);
                overflow-y: auto;
            }
            .kanban-subtarea-fila {
                display: flex;
                align-items: flex-start;
                gap: 8px;
            }
            .kanban-subtarea-fila input[type="checkbox"] {
                width: auto;
                flex-shrink: 0;
                margin-top: 10px;
                accent-color: var(--interactive-accent);
            }
            .kanban-subtarea-texto {
                flex: 1;
                min-width: 0;
                resize: none;
                overflow: hidden;
                min-height: 2.5em;
                line-height: 1.45;
                word-break: break-word;
                white-space: pre-wrap;
            }
            .kanban-subtarea-fila:has(input[type="checkbox"]:checked) .kanban-subtarea-texto {
                opacity: 0.55;
                text-decoration: line-through;
            }
            .kanban-imagenes-galeria {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
                gap: 8px;
                min-height: 48px;
            }
            .kanban-imagen-item {
                position: relative;
                border: 1px solid var(--background-modifier-border);
                border-radius: 8px;
                overflow: hidden;
                background: var(--background-primary);
            }
            .kanban-imagen-item img {
                width: 100%;
                height: 72px;
                object-fit: cover;
                display: block;
            }
            .kanban-imagen-nombre {
                display: block;
                padding: 4px 6px;
                font-size: 0.7em;
                color: var(--text-muted);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .kanban-imagen-item .kanban-imagen-quitar {
                position: absolute;
                top: 2px;
                right: 4px;
                background: rgba(0,0,0,0.55);
                color: #fff;
                border-radius: 4px;
                padding: 0 4px;
                opacity: 1;
            }
            .kanban-imagen-fallback {
                display: flex;
                align-items: center;
                justify-content: center;
                height: 72px;
                font-size: 1.6em;
            }
            .suggestion-item.kanban-suggest-img {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .suggestion-item.kanban-suggest-img img {
                width: 40px;
                height: 40px;
                object-fit: cover;
                border-radius: 4px;
                flex-shrink: 0;
            }
            .kanban-tarjeta-indicadores {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 4px;
                font-size: 0.72em;
                color: var(--text-muted);
            }
            .kanban-tarjeta-badge {
                padding: 2px 6px;
                border-radius: 4px;
                background: var(--background-modifier-hover);
            }
            .kanban-vacio {
                text-align: center;
                color: var(--text-muted);
                font-style: italic;
                padding: 20px;
            }
        `;
        document.head.appendChild(styleEl);
    },

    _esBloqueada: (tarea, mapaTareas) => {
        const ids = KanbanDB._filtrarRequisitosSinAncestros(tarea.requisito_ids, mapaTareas);
        if (ids.length === 0) return false;
        return ids.some(reqId => {
            const req = mapaTareas.get(reqId);
            return req && req.estado !== "Terminado";
        });
    },

    _requisitosVisibles: (tarea, mapaTareas) =>
        KanbanDB._filtrarRequisitosSinAncestros(tarea.requisito_ids, mapaTareas),

    _sanitizarMermaid: (texto) =>
        String(texto).replace(/["\[\]{}|#;]/g, " ").replace(/\n/g, " ").trim(),

    _PALETA_PROYECTO: [
        { bg: "rgba(45, 55, 72, 0.55)", border: "#4a5568", kanban: "rgba(45, 55, 72, 0.35)" },
        { bg: "rgba(44, 82, 130, 0.45)", border: "#2b6cb0", kanban: "rgba(44, 82, 130, 0.28)" },
        { bg: "rgba(39, 103, 73, 0.45)", border: "#276749", kanban: "rgba(39, 103, 73, 0.28)" },
        { bg: "rgba(128, 90, 43, 0.45)", border: "#975a16", kanban: "rgba(128, 90, 43, 0.28)" },
        { bg: "rgba(107, 70, 193, 0.4)", border: "#6b46c1", kanban: "rgba(107, 70, 193, 0.25)" },
        { bg: "rgba(155, 44, 44, 0.4)", border: "#9b2c2c", kanban: "rgba(155, 44, 44, 0.25)" }
    ],

    _colorProyecto: (indice) =>
        KanbanUI._PALETA_PROYECTO[indice % KanbanUI._PALETA_PROYECTO.length],

    _ordenarPorProyecto: (tareas) =>
        [...tareas].sort((a, b) =>
            a.proyecto.localeCompare(b.proyecto, "es") || a.id - b.id
        ),

    _agruparPorProyecto: (tareas) => {
        const mapa = new Map();
        KanbanUI._ordenarPorProyecto(tareas).forEach(t => {
            if (!mapa.has(t.proyecto)) mapa.set(t.proyecto, []);
            mapa.get(t.proyecto).push(t);
        });
        return [...mapa.entries()].map(([nombre, items]) => ({ nombre, tareas: items }));
    },

    _parsearTareaIdDesdeDomId: (domId) => {
        if (!domId) return null;
        const patrones = [
            /flowchart-T(\d+)-\d+/i,
            /flowchart-node-T(\d+)/i,
            /^T(\d+)$/i
        ];
        for (const p of patrones) {
            const m = domId.match(p);
            if (m) return parseInt(m[1], 10);
        }
        return null;
    },

    _obtenerApiMermaid: async () => {
        // Siempre CDN: el Mermaid de Obsidian puede usar securityLevel estricto y bloquear clics
        if (!window._kanbanMermaidCDN) {
            const mod = await import("https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.esm.min.mjs");
            window._kanbanMermaidCDN = mod.default?.mermaidAPI ?? mod.default;
            window._kanbanMermaidCDN.initialize({
                startOnLoad: false,
                securityLevel: "loose",
                theme: "base",
                themeVariables: {
                    fontFamily: "var(--font-text, system-ui, sans-serif)",
                    fontSize: "14px",
                    lineColor: "#718096",
                    primaryTextColor: "#f8fafc"
                },
                flowchart: {
                    curve: "basis",
                    padding: 20,
                    nodeSpacing: 50,
                    rankSpacing: 60,
                    htmlLabels: false
                }
            });
            window._kanbanMermaidInit = true;
        }
        return window._kanbanMermaidCDN;
    },

    _renderMermaidSvg: async (hostEl, codigo) => {
        hostEl.innerHTML = "";
        const renderId = `kanban-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

        try {
            const api = await KanbanUI._obtenerApiMermaid();

            if (typeof api.initialize === "function" && !window._kanbanMermaidInit) {
                api.initialize({
                    startOnLoad: false,
                    securityLevel: "loose",
                    theme: "base",
                    themeVariables: {
                        fontFamily: "var(--font-text, system-ui, sans-serif)",
                        fontSize: "14px",
                        lineColor: "#718096"
                    },
                    flowchart: { curve: "basis", padding: 20, nodeSpacing: 50, rankSpacing: 60 }
                });
                window._kanbanMermaidInit = true;
            }

            if (typeof api.render === "function") {
                const { svg, bindFunctions } = await api.render(renderId, codigo);
                hostEl.innerHTML = svg;
                if (bindFunctions) bindFunctions(hostEl);
                return;
            }

            if (typeof api.run === "function") {
                const el = document.createElement("div");
                el.className = "mermaid";
                el.textContent = codigo;
                hostEl.appendChild(el);
                await api.run({ nodes: [el] });
                return;
            }
        } catch (err) {
            console.error("Error renderizando Mermaid:", err);
        }

        hostEl.innerHTML = `<pre style="font-size:0.85em;color:var(--text-error);white-space:pre-wrap;">${codigo}</pre>`;
    },

    _montarDiagramaConZoom: () => {
        const wrap = document.createElement("div");
        wrap.className = "kanban-mermaid-zoom-wrap";
        const bar = document.createElement("div");
        bar.className = "kanban-mermaid-zoom-bar";
        const stageParts = montarStageDiagrama();

        wrap.appendChild(bar);
        wrap.appendChild(stageParts.viewport);

        return { wrap, bar, ...stageParts };
    },

    _inicializarZoomDiagrama: (parts, opts = {}) => {
        const {
            bar, viewport, stage, svgHost, minimap, miniInner, miniLens,
            zoomStorageKey = null,
            permitirExpandir = true,
            expandPayload = null
        } = { ...parts, ...opts };

        const label = document.createElement("span");
        label.className = "kanban-mermaid-zoom-label";

        const mkBtn = (texto, titulo, fn) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "kanban-mermaid-zoom-btn";
            btn.textContent = texto;
            btn.title = titulo;
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                fn();
            });
            return btn;
        };

        const vista = inicializarViewportDiagrama(
            viewport, stage, svgHost, minimap, miniInner, miniLens,
            { zoomStorageKey, label }
        );

        bar.appendChild(mkBtn("−", "Alejar (Ctrl + rueda)", () => vista.zoomOut()));
        bar.appendChild(label);
        bar.appendChild(mkBtn("+", "Acercar (Ctrl + rueda)", () => vista.zoomIn()));
        bar.appendChild(mkBtn("⟲", "Restablecer vista", () => vista.resetVista()));

        if (permitirExpandir && expandPayload) {
            bar.appendChild(mkBtn("⛶", "Pantalla completa", () => {
                const app = KanbanUI._getApp();
                if (!app) return;
                new DiagramaExpandidoModal(app, expandPayload).open();
            }));
        }

        return vista;
    },

    _extraerTareaIdDesdeNodoMermaid: (elemento, svgRoot) => {
        const marcado = elemento.closest?.("[data-tarea-id]");
        if (marcado?.dataset.tareaId) return parseInt(marcado.dataset.tareaId, 10);

        let nodo = elemento;
        while (nodo && nodo !== svgRoot) {
            const id = KanbanUI._parsearTareaIdDesdeDomId(nodo.id);
            if (id) return id;
            nodo = nodo.parentElement;
        }
        return null;
    },

    _etiquetarNodosMermaid: (hostEl, tareas) => {
        const svg = hostEl.querySelector("svg");
        if (!svg) return;

        const idsVinculados = new Set();
        svg.querySelectorAll("[id]").forEach(el => {
            const tareaId = KanbanUI._parsearTareaIdDesdeDomId(el.id);
            if (!tareaId) return;
            const nodo = el.closest("g.node") || el.closest("g") || el;
            nodo.dataset.tareaId = String(tareaId);
            idsVinculados.add(tareaId);
        });

        // Respaldo: vincular por texto visible del nodo
        tareas.forEach(t => {
            if (idsVinculados.has(t.id)) return;
            const objetivo = KanbanUI._sanitizarMermaid(t.texto).toLowerCase();
            if (!objetivo) return;

            const textos = svg.querySelectorAll("text, foreignObject p, foreignObject span, .nodeLabel");
            for (const txt of textos) {
                const contenido = (txt.textContent || "").trim().toLowerCase();
                if (contenido !== objetivo) continue;
                const nodo = txt.closest("g.node") || txt.closest("g[class*='node']") || txt.closest("g[id]");
                if (!nodo) continue;
                nodo.dataset.tareaId = String(t.id);
                idsVinculados.add(t.id);
                break;
            }
        });
    },

    _pulirEstiloNodosMermaid: (hostEl) => {
        const svg = hostEl.querySelector("svg");
        if (!svg) return;

        const uid = `kanban-fx-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
        let defs = svg.querySelector("defs");
        if (!defs) {
            defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            svg.insertBefore(defs, svg.firstChild);
        }

        const filtroSombra = document.createElementNS("http://www.w3.org/2000/svg", "filter");
        filtroSombra.setAttribute("id", `${uid}-sombra`);
        filtroSombra.setAttribute("x", "-20%");
        filtroSombra.setAttribute("y", "-20%");
        filtroSombra.setAttribute("width", "140%");
        filtroSombra.setAttribute("height", "140%");
        filtroSombra.innerHTML =
            '<feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.28"/>';
        defs.appendChild(filtroSombra);

        svg.querySelectorAll("g.node").forEach(g => {
            const forma = g.querySelector("rect, polygon, path");
            if (forma) {
                forma.setAttribute("filter", `url(#${uid}-sombra)`);
                if (forma.tagName === "rect") {
                    forma.setAttribute("rx", "16");
                    forma.setAttribute("ry", "16");
                }
                if (forma.tagName === "path") {
                    forma.setAttribute("stroke-linejoin", "round");
                }
            }
            g.querySelectorAll("text").forEach(txt => {
                txt.setAttribute("font-weight", "600");
                txt.setAttribute("font-size", "13px");
            });
        });
    },

    _abrirEdicionTarea: (db, dbPath, tareaId, onRefresh) => {
        const actualizada = KanbanDB.obtenerTodas(db).find(x => x.id === tareaId);
        if (!actualizada) return;
        const app = KanbanUI._getApp();
        if (!app) return;
        new KanbanModals.TareaFormModal(
            app, db, dbPath, actualizada, onRefresh
        ).open();
    },

    _enlazarClicksMermaidDom: (hostEl, tareas, db, dbPath, onRefresh) => {
        KanbanUI._etiquetarNodosMermaid(hostEl, tareas);
        return KanbanUI._enlazarInteraccionOverlaysMermaid(hostEl, db, dbPath, onRefresh);
    },

    // Elige el overlay cuyo centro está más cerca del puntero (evita tomar el último del DOM)
    _overlayEnPunto: (capa, clientX, clientY, excluir = null) => {
        let mejor = null;
        let mejorDist = Infinity;

        capa.querySelectorAll(".kanban-mermaid-overlay").forEach(ov => {
            if (ov === excluir) return;

            const r = ov.getBoundingClientRect();
            const dentro = clientX >= r.left && clientX <= r.right
                && clientY >= r.top && clientY <= r.bottom;
            if (!dentro) return;

            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const dist = Math.hypot(clientX - cx, clientY - cy);
            if (dist < mejorDist) {
                mejorDist = dist;
                mejor = ov;
            }
        });

        return mejor;
    },

    _nodoSvgDesdeOverlay: (svg, overlay) => {
        if (!overlay) return null;
        const tareaId = overlay.dataset.tareaId;
        return svg.querySelector(`g.node[data-tarea-id="${tareaId}"]`)
            || svg.querySelector(`[data-tarea-id="${tareaId}"]`);
    },

    _enlazarInteraccionOverlaysMermaid: (hostEl, db, dbPath, onRefresh) => {
        const svg = hostEl.querySelector("svg");
        if (!svg) return null;

        hostEl.querySelector(".kanban-mermaid-overlays")?.remove();

        const capa = document.createElement("div");
        capa.className = "kanban-mermaid-overlays";
        hostEl.appendChild(capa);

        const UMBRAL_PX = 6;
        let activo = null;
        let overlayDestino = null;

        const limpiarDestino = () => {
            if (overlayDestino) {
                overlayDestino.classList.remove("kanban-mermaid-drop-over");
                const nodo = KanbanUI._nodoSvgDesdeOverlay(svg, overlayDestino);
                nodo?.classList.remove("kanban-mermaid-drop-over");
                overlayDestino = null;
            }
        };

        const crearFantasma = (texto) => {
            const el = document.createElement("div");
            el.className = "kanban-mermaid-fantasma";
            el.textContent = texto;
            document.body.appendChild(el);
            return el;
        };

        const aplicarRequisito = async (arrastradoId, requisitoId) => {
            if (!arrastradoId || !requisitoId || arrastradoId === requisitoId) return;

            try {
                // El chip sobre el que sueltas (requisitoId) pasa a ser prerequisito del arrastrado
                const resultado = KanbanDB.agregarRequisito(db, dbPath, arrastradoId, requisitoId);
                if (resultado.agregado) {
                    const todas = KanbanDB.obtenerTodas(db);
                    const arrastrado = todas.find(t => t.id === arrastradoId);
                    const requisito = todas.find(t => t.id === requisitoId);
                    new Notice(
                        `🔗 "${arrastrado?.texto || `#${arrastradoId}`}" ahora requiere "${requisito?.texto || `#${requisitoId}`}"`
                    );
                    void onRefresh?.();
                } else if (resultado.motivo === "ya_existe") {
                    new Notice("ℹ️ Ese requisito ya estaba definido.");
                }
            } catch (err) {
                console.error("Error al vincular requisito:", err);
                new Notice(`❌ ${err.message || "No se pudo añadir el requisito."}`);
            }
        };

        const resaltarDestino = (candidato, arrastradoId) => {
            if (!candidato) {
                limpiarDestino();
                return;
            }
            const requisitoId = parseInt(candidato.dataset.tareaId, 10);
            if (!requisitoId || requisitoId === arrastradoId) {
                limpiarDestino();
                return;
            }
            if (overlayDestino !== candidato) {
                limpiarDestino();
                overlayDestino = candidato;
                overlayDestino.classList.add("kanban-mermaid-drop-over");
                KanbanUI._nodoSvgDesdeOverlay(svg, overlayDestino)
                    ?.classList.add("kanban-mermaid-drop-over");
            }
        };

        const posicionarOverlays = () => {
            if (activo) return;
            const zoom = Math.max(0.01, parseFloat(hostEl.dataset.kanbanZoom || "1") || 1);
            capa.innerHTML = "";
            const hostRect = hostEl.getBoundingClientRect();
            const vistos = new Set();

            svg.querySelectorAll("g.node[data-tarea-id]").forEach(nodo => {
                const tareaId = nodo.dataset.tareaId;
                if (!tareaId || vistos.has(tareaId)) return;
                vistos.add(tareaId);

                const rect = nodo.getBoundingClientRect();
                if (rect.width < 2 || rect.height < 2) return;

                const ov = document.createElement("div");
                ov.className = "kanban-mermaid-overlay";
                ov.dataset.tareaId = tareaId;
                ov.title = nodo.querySelector("text")?.textContent?.trim() || "";
                ov.style.left = `${(rect.left - hostRect.left) / zoom}px`;
                ov.style.top = `${(rect.top - hostRect.top) / zoom}px`;
                ov.style.width = `${rect.width / zoom}px`;
                ov.style.height = `${rect.height / zoom}px`;
                capa.appendChild(ov);
            });
        };

        let posicionPendiente = null;
        const reprogramar = () => {
            if (posicionPendiente != null) cancelAnimationFrame(posicionPendiente);
            posicionPendiente = requestAnimationFrame(() => {
                posicionPendiente = null;
                posicionarOverlays();
            });
        };
        hostEl.addEventListener("kanban-mermaid-resize", reprogramar);
        window.addEventListener("resize", reprogramar, { passive: true });

        const finalizarArrastre = async (clientX, clientY) => {
            if (!activo) return;

            const { overlay, tareaId, arrastrando, fantasma, startX, startY } = activo;
            const dx = clientX - startX;
            const dy = clientY - startY;
            const fueClick = !arrastrando && Math.hypot(dx, dy) < UMBRAL_PX;

            overlay.classList.remove("kanban-mermaid-arrastrando");
            overlay.style.pointerEvents = "";
            KanbanUI._nodoSvgDesdeOverlay(svg, overlay)
                ?.classList.remove("kanban-mermaid-arrastrando");
            if (fantasma) fantasma.remove();

            if (arrastrando) {
                const destino = overlayDestino
                    || KanbanUI._overlayEnPunto(capa, clientX, clientY, overlay);
                if (destino) {
                    const destinoId = parseInt(destino.dataset.tareaId, 10);
                    await aplicarRequisito(tareaId, destinoId);
                }
            } else if (fueClick) {
                KanbanUI._abrirEdicionTarea(db, dbPath, tareaId, onRefresh);
            }

            limpiarDestino();
            activo = null;
            document.body.style.userSelect = "";
            if (arrastrando) reprogramar();
        };

        const moverDocumento = (e) => {
            if (!activo) return;

            const dx = e.clientX - activo.startX;
            const dy = e.clientY - activo.startY;

            if (!activo.arrastrando) {
                if (Math.hypot(dx, dy) < UMBRAL_PX) return;
                activo.arrastrando = true;
                activo.overlay.classList.add("kanban-mermaid-arrastrando");
                activo.overlay.style.pointerEvents = "none";
                KanbanUI._nodoSvgDesdeOverlay(svg, activo.overlay)
                    ?.classList.add("kanban-mermaid-arrastrando");
                activo.fantasma = crearFantasma(activo.texto);
                document.body.style.userSelect = "none";
            }

            if (activo.fantasma) {
                activo.fantasma.style.left = `${e.clientX}px`;
                activo.fantasma.style.top = `${e.clientY}px`;
            }

            resaltarDestino(
                KanbanUI._overlayEnPunto(capa, e.clientX, e.clientY, activo.overlay),
                activo.tareaId
            );
        };

        const soltarDocumento = async (e) => {
            document.removeEventListener("mousemove", moverDocumento);
            document.removeEventListener("mouseup", soltarDocumento);
            await finalizarArrastre(e.clientX, e.clientY);
        };

        capa.addEventListener("mousedown", (e) => {
            const overlay = e.target.closest?.(".kanban-mermaid-overlay");
            if (!overlay || activo) return;
            if (e.button !== 0) return;

            const tareaId = parseInt(overlay.dataset.tareaId, 10);
            if (!tareaId) return;

            activo = {
                overlay,
                tareaId,
                texto: overlay.title || `#${tareaId}`,
                startX: e.clientX,
                startY: e.clientY,
                arrastrando: false,
                fantasma: null
            };

            document.addEventListener("mousemove", moverDocumento);
            document.addEventListener("mouseup", soltarDocumento);
            e.preventDefault();
        });

        hostEl.addEventListener("dragover", (e) => {
            const origenId = KanbanUI._extraerTareaIdDesdeDataTransfer(e.dataTransfer);
            if (!origenId) return;

            e.preventDefault();
            e.dataTransfer.dropEffect = "link";
            resaltarDestino(
                KanbanUI._overlayEnPunto(capa, e.clientX, e.clientY),
                origenId
            );
        }, true);

        hostEl.addEventListener("dragleave", (e) => {
            if (!hostEl.contains(e.relatedTarget)) limpiarDestino();
        }, true);

        hostEl.addEventListener("drop", async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const origenId = KanbanUI._extraerTareaIdDesdeDataTransfer(e.dataTransfer);
            const destino = overlayDestino
                || KanbanUI._overlayEnPunto(capa, e.clientX, e.clientY);
            limpiarDestino();

            if (!origenId || !destino) return;
            const destinoId = parseInt(destino.dataset.tareaId, 10);
            await aplicarRequisito(origenId, destinoId);
        }, true);

        return capa;
    },

    _construirMermaid: (tareas, agruparPorProyecto = false) => {
        const mapa = new Map(tareas.map(t => [t.id, t]));
        let codigo = "graph LR\n";
        codigo += "  classDef bloqueada fill:#1a2332,stroke:#718096,color:#cbd5e1,stroke-width:2px\n";
        codigo += "  classDef porHacer fill:#334155,stroke:#94a3b8,color:#f8fafc,stroke-width:2px\n";
        codigo += "  classDef enProceso fill:#2563eb,stroke:#93c5fd,color:#ffffff,stroke-width:2px\n";
        codigo += "  classDef terminado fill:#059669,stroke:#6ee7b7,color:#ffffff,stroke-width:2px\n";

        const clases = [];
        const emitirNodo = (t, indent = "  ") => {
            const label = KanbanUI._sanitizarMermaid(t.texto);
            // Forma stadium (pastilla) para aspecto de chip
            codigo += `${indent}T${t.id}(["${label}"])\n`;
        };
        const emitirClases = (t) => {
            if (KanbanUI._esBloqueada(t, mapa)) clases.push(`class T${t.id} bloqueada`);
            else if (t.estado === "Terminado") clases.push(`class T${t.id} terminado`);
            else if (t.estado === "En Proceso") clases.push(`class T${t.id} enProceso`);
            else clases.push(`class T${t.id} porHacer`);
        };

        if (agruparPorProyecto) {
            KanbanUI._agruparPorProyecto(tareas).forEach((grupo, idx) => {
                const sgId = `SG${idx}`;
                const titulo = KanbanUI._sanitizarMermaid(grupo.nombre);
                const color = KanbanUI._colorProyecto(idx);
                codigo += `  subgraph ${sgId}["📁 ${titulo}"]\n`;
                codigo += "    direction LR\n";
                grupo.tareas.forEach(t => emitirNodo(t, "    "));
                codigo += "  end\n";
                codigo += `  style ${sgId} fill:${color.bg},stroke:${color.border},color:#e2e8f0\n`;
            });
            tareas.forEach(t => emitirClases(t));
        } else {
            tareas.forEach(t => {
                emitirNodo(t);
                emitirClases(t);
            });
        }

        tareas.forEach(t => {
            KanbanUI._requisitosVisibles(t, mapa).forEach(reqId => {
                if (mapa.has(reqId)) codigo += `  T${reqId} --> T${t.id}\n`;
            });
        });

        if (clases.length) codigo += "  " + clases.join("\n  ") + "\n";
        return codigo;
    },

    _renderBloqueMermaid: async (
        contenedor, tareas, db, dbPath, tituloProyecto, indiceColor,
        agruparPorProyecto, onRefresh, zoomKey = "main", permitirExpandir = true
    ) => {
        const { wrap, bar, viewport, stage, svgHost, minimap, miniInner, miniLens } = KanbanUI._montarDiagramaConZoom();
        const storageKey = KanbanPrefs.diagramZoomKey(zoomKey);
        const tituloExpand = tituloProyecto
            ? `🔬 ${tituloProyecto}`
            : "🔬 Mapa de dependencias";

        if (tituloProyecto != null) {
            const bloque = document.createElement("div");
            bloque.className = "kanban-mapa-proyecto";
            const color = KanbanUI._colorProyecto(indiceColor);
            bloque.style.background = color.kanban;
            bloque.style.borderColor = color.border;

            const h4 = document.createElement("h4");
            h4.className = "kanban-mapa-proyecto-titulo";
            h4.textContent = `📁 ${tituloProyecto}`;
            bloque.appendChild(h4);
            bloque.appendChild(wrap);
            contenedor.appendChild(bloque);
        } else {
            contenedor.appendChild(wrap);
        }

        const codigo = KanbanUI._construirMermaid(tareas, tituloProyecto == null && agruparPorProyecto);
        await KanbanUI._renderMermaidSvg(svgHost, codigo);
        KanbanUI._pulirEstiloNodosMermaid(svgHost);
        const vista = KanbanUI._inicializarZoomDiagrama(
            { bar, viewport, stage, svgHost, minimap, miniInner, miniLens },
            {
                zoomStorageKey: storageKey,
                permitirExpandir,
                expandPayload: {
                    tareas,
                    db,
                    dbPath,
                    onRefresh,
                    titulo: tituloExpand,
                    zoomKey: `${zoomKey}:exp`
                }
            }
        );
        const capaOverlays = KanbanUI._enlazarClicksMermaidDom(svgHost, tareas, db, dbPath, onRefresh);
        vista.enlazarCapaPan?.(capaOverlays);
        vista.iniciar();
    },

    _renderMapa: async (contenedor, tareas, proyectoFiltro, db, dbPath, onRefresh) => {
        const wrapper = document.createElement("div");
        wrapper.className = "kanban-seccion-mapa";

        const header = document.createElement("div");
        header.className = "kanban-mapa-header";

        const titulo = document.createElement("h3");
        titulo.textContent = proyectoFiltro
            ? `🔬 Mapa de Dependencias — ${proyectoFiltro}`
            : "🔬 Mapa de Dependencias — Árbol de Ciencia";
        header.appendChild(titulo);

        const btnColapsar = document.createElement("button");
        btnColapsar.type = "button";
        btnColapsar.className = "kanban-btn-colapsar-mapa";

        const cuerpo = document.createElement("div");
        cuerpo.className = "kanban-mapa-cuerpo";

        const aplicarColapso = (colapsado) => {
            cuerpo.classList.toggle("kanban-mapa-cuerpo--oculto", colapsado);
            btnColapsar.textContent = colapsado ? "▶ Mostrar mapa" : "▼ Ocultar mapa";
            KanbanPrefs.setMapaColapsado(colapsado);
        };

        aplicarColapso(KanbanPrefs.isMapaColapsado());
        btnColapsar.addEventListener("click", () => {
            aplicarColapso(!cuerpo.classList.contains("kanban-mapa-cuerpo--oculto"));
        });
        header.appendChild(btnColapsar);
        wrapper.appendChild(header);

        const hint = document.createElement("p");
        hint.className = "kanban-mermaid-hint";
        hint.textContent = "💡 Arrastra chips · Clic editar · Rueda desplaza · Ctrl+rueda zoom · Botón central o Alt+arrastrar · Minimapa si el diagrama no cabe.";
        cuerpo.appendChild(hint);

        const mermaidHost = document.createElement("div");
        mermaidHost.className = "kanban-mermaid-contenedor";

        if (tareas.length === 0) {
            const vacio = document.createElement("p");
            vacio.className = "kanban-vacio";
            vacio.textContent = "Añade tareas para visualizar el árbol tecnológico.";
            mermaidHost.appendChild(vacio);
        } else if (!proyectoFiltro) {
            const grupos = KanbanUI._agruparPorProyecto(tareas);
            for (let i = 0; i < grupos.length; i++) {
                await KanbanUI._renderBloqueMermaid(
                    mermaidHost, grupos[i].tareas, db, dbPath,
                    grupos[i].nombre, i, false, onRefresh, grupos[i].nombre
                );
            }
        } else {
            await KanbanUI._renderBloqueMermaid(
                mermaidHost, tareas, db, dbPath, null, 0, false, onRefresh, proyectoFiltro
            );
        }

        cuerpo.appendChild(mermaidHost);
        wrapper.appendChild(cuerpo);
        contenedor.appendChild(wrapper);
    },

    _crearTarjeta: (tarea, mapaTareas, db, dbPath, ocultarProyecto = false, onRefresh) => {
        const bloqueada = KanbanUI._esBloqueada(tarea, mapaTareas);
        const card = document.createElement("div");
        card.className = "kanban-tarjeta" + (bloqueada ? " kanban-tarjeta-bloqueada" : "");
        card.draggable = true;
        card.dataset.tareaId = String(tarea.id);

        card.addEventListener("dragstart", (e) => {
            KanbanUI._marcarDatosDragTarea(e.dataTransfer, tarea.id);
        });

        const texto = document.createElement("div");
        texto.className = "kanban-tarjeta-texto";
        texto.textContent = tarea.texto;

        const acciones = document.createElement("div");
        acciones.className = "kanban-tarjeta-acciones";
        const btnEdit = document.createElement("button");
        btnEdit.className = "kanban-tarjeta-btn";
        btnEdit.textContent = "✏️";
        btnEdit.title = "Editar tarea";
        btnEdit.addEventListener("click", (e) => {
            e.stopPropagation();
            KanbanUI._abrirEdicionTarea(db, dbPath, tarea.id, onRefresh);
        });
        acciones.appendChild(btnEdit);

        const header = document.createElement("div");
        header.className = "kanban-tarjeta-header";
        header.appendChild(texto);
        header.appendChild(acciones);
        card.appendChild(header);

        const meta = document.createElement("div");
        meta.className = "kanban-tarjeta-meta";
        let metaTxt = ocultarProyecto ? "" : `📁 ${tarea.proyecto}`;
        if (bloqueada) metaTxt += (metaTxt ? " · " : "") + "🔒 Bloqueada";
        else {
            const reqsVisibles = KanbanUI._requisitosVisibles(tarea, mapaTareas);
            if (reqsVisibles.length) {
                metaTxt += (metaTxt ? " · " : "") +
                    `Requiere ${reqsVisibles.map(id => `#${id}`).join(", ")}`;
            }
        }
        if (metaTxt) {
            meta.textContent = metaTxt;
            card.appendChild(meta);
        }

        const notaTxt = (tarea.nota || "").trim();
        if (notaTxt) {
            const notaEl = document.createElement("div");
            notaEl.className = "kanban-tarjeta-nota";
            const primeraLinea = notaTxt.split("\n")[0];
            notaEl.textContent = primeraLinea.length > 72 ? `${primeraLinea.slice(0, 72)}…` : primeraLinea;
            notaEl.title = notaTxt;
            card.appendChild(notaEl);
        }

        const subs = tarea.subtareas || [];
        const imgs = tarea.imagenes || [];
        if (subs.length > 0) {
            const hechas = subs.filter(s => s.completado).length;
            const pct = Math.round((hechas / subs.length) * 100);
            const barra = document.createElement("div");
            barra.className = "kanban-tarjeta-progreso";
            barra.title = `Checklist: ${hechas}/${subs.length}`;
            const fill = document.createElement("div");
            fill.className = "kanban-tarjeta-progreso-fill";
            fill.style.width = `${pct}%`;
            barra.appendChild(fill);
            card.appendChild(barra);
        }
        if (subs.length > 0 || imgs.length > 0) {
            const ind = document.createElement("div");
            ind.className = "kanban-tarjeta-indicadores";
            if (subs.length > 0) {
                const hechas = subs.filter(s => s.completado).length;
                const badge = document.createElement("span");
                badge.className = "kanban-tarjeta-badge";
                badge.textContent = `☑ ${hechas}/${subs.length}`;
                badge.title = "Subtareas completadas";
                ind.appendChild(badge);
            }
            if (imgs.length > 0) {
                const badge = document.createElement("span");
                badge.className = "kanban-tarjeta-badge";
                badge.textContent = `📷 ${imgs.length}`;
                badge.title = "Imágenes adjuntas";
                ind.appendChild(badge);
            }
            card.appendChild(ind);
        }

        return card;
    },

    _configurarColumnaDrop: (colBody, estadoDestino, db, dbPath, onRefresh) => {
        colBody.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            colBody.classList.add("kanban-drag-over");
        });

        colBody.addEventListener("dragleave", () => {
            colBody.classList.remove("kanban-drag-over");
        });

        colBody.addEventListener("drop", async (e) => {
            e.preventDefault();
            colBody.classList.remove("kanban-drag-over");

            const tareaId = parseInt(e.dataTransfer.getData("text/plain"), 10);
            if (!tareaId) return;

            try {
                await KanbanDB.actualizarEstado(db, dbPath, tareaId, estadoDestino);
                void onRefresh?.();
            } catch (err) {
                console.error("Error en drop:", err);
                new Notice("❌ No se pudo mover la tarea.");
            }
        });
    },

    _renderPanelSuperior: (contenedor, db, dbPath, onRefresh, proyectoFiltro, setProyectoFiltro) => {
        const app = KanbanUI._getApp();
        const panel = document.createElement("div");
        panel.className = "kanban-panel-superior";

        const toolbar = document.createElement("div");
        toolbar.className = "kanban-toolbar";

        const filtroGrupo = document.createElement("div");
        filtroGrupo.className = "kanban-filtro-grupo";
        filtroGrupo.appendChild(Object.assign(document.createElement("label"), { textContent: "📂 Proyecto:" }));

        const selectProyecto = document.createElement("select");
        selectProyecto.className = "kanban-filtro-select";

        const optTodos = document.createElement("option");
        optTodos.value = "";
        optTodos.textContent = "Todos los proyectos";
        if (!proyectoFiltro) optTodos.selected = true;
        selectProyecto.appendChild(optTodos);

        KanbanDB.obtenerProyectos(db).forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.nombre;
            opt.textContent = `${p.nombre} (${p.total})`;
            if (proyectoFiltro === p.nombre) opt.selected = true;
            selectProyecto.appendChild(opt);
        });

        selectProyecto.addEventListener("change", () => {
            setProyectoFiltro(selectProyecto.value);
        });

        filtroGrupo.appendChild(selectProyecto);
        toolbar.appendChild(filtroGrupo);

        const accionesGrupo = document.createElement("div");
        accionesGrupo.className = "kanban-toolbar-acciones";

        const btnGestion = document.createElement("button");
        btnGestion.className = "kanban-btn-gestion-proyectos";
        btnGestion.textContent = "📦 Proyectos";
        btnGestion.addEventListener("click", () => {
            if (!app) return;
            new KanbanModals.ProyectosGestionModal(
                app, db, dbPath, proyectoFiltro, setProyectoFiltro, onRefresh
            ).open();
        });
        accionesGrupo.appendChild(btnGestion);

        const btnBuscar = document.createElement("button");
        btnBuscar.className = "kanban-btn-buscar";
        btnBuscar.textContent = "🔍 Buscar";
        btnBuscar.title = "Buscar tareas (Ctrl+Shift+F)";
        btnBuscar.addEventListener("click", () => {
            if (!app) return;
            KanbanUI._abrirBusquedaTareas(app, db, dbPath, onRefresh);
        });
        accionesGrupo.appendChild(btnBuscar);

        const btnNueva = document.createElement("button");
        btnNueva.className = "kanban-btn-nueva";
        btnNueva.textContent = "🧪 Añadir Nueva Tarea";
        btnNueva.addEventListener("click", () => {
            if (!app) return;
            new KanbanModals.TareaFormModal(
                app, db, dbPath, null, onRefresh, proyectoFiltro
            ).open();
        });
        accionesGrupo.appendChild(btnNueva);
        toolbar.appendChild(accionesGrupo);

        panel.appendChild(toolbar);
        contenedor.appendChild(panel);
    },

    _renderKanban: (contenedor, tareas, db, dbPath, onRefresh, proyectoFiltro, mostrarBloqueadas, setMostrarBloqueadas, mostrarCompletadas, setMostrarCompletadas, numCompletadas) => {
        const mapa = new Map(tareas.map(t => [t.id, t]));
        const bloqueadas = tareas.filter(t => KanbanUI._esBloqueada(t, mapa));
        const tareasVisibles = mostrarBloqueadas
            ? tareas
            : tareas.filter(t => !KanbanUI._esBloqueada(t, mapa));

        const seccion = document.createElement("div");
        seccion.className = "kanban-seccion-tablero";

        const header = document.createElement("div");
        header.className = "kanban-tablero-header";

        const tituloGrupo = document.createElement("div");
        const titulo = document.createElement("h3");
        titulo.className = "kanban-tablero-titulo";
        titulo.textContent = "📋 Tablero Kanban";
        tituloGrupo.appendChild(titulo);

        const subtitulo = document.createElement("p");
        subtitulo.className = "kanban-tablero-subtitulo";
        if (proyectoFiltro) {
            subtitulo.textContent = `Proyecto: ${proyectoFiltro} · ${tareasVisibles.length} visibles`;
        } else {
            subtitulo.textContent = `${tareasVisibles.length} tareas visibles`;
        }
        if (bloqueadas.length > 0) {
            subtitulo.textContent += mostrarBloqueadas
                ? ` · ${bloqueadas.length} bloqueada(s)`
                : ` · ${bloqueadas.length} bloqueada(s) oculta(s)`;
        }
        if (numCompletadas > 0) {
            subtitulo.textContent += mostrarCompletadas
                ? ` · ${numCompletadas} completada(s)`
                : ` · ${numCompletadas} completada(s) oculta(s)`;
        }
        tituloGrupo.appendChild(subtitulo);
        header.appendChild(tituloGrupo);

        const togglesWrap = document.createElement("div");
        togglesWrap.className = "kanban-toggles-wrap";

        const toggleBloqueadas = document.createElement("div");
        toggleBloqueadas.className = "kanban-toggle-grupo";
        const chkIdBloq = `kanban-mostrar-bloqueadas-${Date.now()}`;
        const chkBloqueadas = document.createElement("input");
        chkBloqueadas.type = "checkbox";
        chkBloqueadas.id = chkIdBloq;
        chkBloqueadas.checked = mostrarBloqueadas;
        chkBloqueadas.addEventListener("change", () => setMostrarBloqueadas(chkBloqueadas.checked));
        const lblBloqueadas = document.createElement("label");
        lblBloqueadas.htmlFor = chkIdBloq;
        lblBloqueadas.textContent = "Mostrar tareas bloqueadas";
        toggleBloqueadas.appendChild(chkBloqueadas);
        toggleBloqueadas.appendChild(lblBloqueadas);
        togglesWrap.appendChild(toggleBloqueadas);

        const toggleCompletadas = document.createElement("div");
        toggleCompletadas.className = "kanban-toggle-grupo";
        const chkIdComp = `kanban-mostrar-completadas-${Date.now()}`;
        const chkCompletadas = document.createElement("input");
        chkCompletadas.type = "checkbox";
        chkCompletadas.id = chkIdComp;
        chkCompletadas.checked = mostrarCompletadas;
        chkCompletadas.addEventListener("change", () => setMostrarCompletadas(chkCompletadas.checked));
        const lblCompletadas = document.createElement("label");
        lblCompletadas.htmlFor = chkIdComp;
        lblCompletadas.textContent = "Mostrar tareas completadas";
        toggleCompletadas.appendChild(chkCompletadas);
        toggleCompletadas.appendChild(lblCompletadas);
        togglesWrap.appendChild(toggleCompletadas);

        header.appendChild(togglesWrap);
        seccion.appendChild(header);

        const columnas = document.createElement("div");
        columnas.className = "kanban-columnas-wrapper";

        const indiceProyecto = new Map();
        if (!proyectoFiltro) {
            KanbanUI._agruparPorProyecto(tareas).forEach((g, i) => indiceProyecto.set(g.nombre, i));
        }

        const clasesColumna = {
            "Por Hacer": "kanban-columna-por-hacer",
            "En Proceso": "kanban-columna-en-proceso",
            "Terminado": "kanban-columna-terminado"
        };

        KanbanUI.ESTADOS.forEach(estado => {
            const col = document.createElement("div");
            col.className = `kanban-columna ${clasesColumna[estado]}`;

            const header = document.createElement("div");
            header.className = "kanban-columna-header";
            header.textContent = estado;
            col.appendChild(header);

            const body = document.createElement("div");
            body.className = "kanban-columna-body";
            body.dataset.estado = estado;

            const tareasCol = tareasVisibles.filter(t => t.estado === estado);
            if (tareasCol.length === 0) {
                const vacio = document.createElement("p");
                vacio.className = "kanban-vacio";
                vacio.textContent = "Sin tareas";
                body.appendChild(vacio);
            } else if (!proyectoFiltro) {
                const grupos = KanbanUI._agruparPorProyecto(tareasCol);
                grupos.forEach((grupo) => {
                    const color = KanbanUI._colorProyecto(indiceProyecto.get(grupo.nombre) ?? 0);
                    const grupoEl = document.createElement("div");
                    grupoEl.className = "kanban-grupo-proyecto";
                    grupoEl.style.background = color.kanban;
                    grupoEl.style.borderColor = color.border;

                    const grupoTitulo = document.createElement("div");
                    grupoTitulo.className = "kanban-grupo-proyecto-titulo";
                    grupoTitulo.textContent = `📁 ${grupo.nombre}`;
                    grupoEl.appendChild(grupoTitulo);

                    grupo.tareas.forEach(t => {
                        grupoEl.appendChild(
                            KanbanUI._crearTarjeta(t, mapa, db, dbPath, true, onRefresh)
                        );
                    });
                    body.appendChild(grupoEl);
                });
            } else {
                tareasCol.forEach(t => {
                    body.appendChild(KanbanUI._crearTarjeta(t, mapa, db, dbPath, false, onRefresh));
                });
            }

            KanbanUI._configurarColumnaDrop(body, estado, db, dbPath, onRefresh);
            col.appendChild(body);
            columnas.appendChild(col);
        });

        seccion.appendChild(columnas);
        contenedor.appendChild(seccion);
    },

    renderDashboard: async (mainContainer, db, dbPath, onRefresh, proyectoFiltro, setProyectoFiltro, mostrarBloqueadas, setMostrarBloqueadas, mostrarCompletadas, setMostrarCompletadas) => {
        while (mainContainer.firstChild) {
            mainContainer.removeChild(mainContainer.firstChild);
        }

        const layout = document.createElement("div");
        layout.className = "kanban-layout-principal";
        mainContainer.appendChild(layout);

        let tareasTodas = [];
        try {
            tareasTodas = KanbanDB.obtenerTodas(db);
            const archivados = new Set(KanbanDB.obtenerNombresProyectosArchivados(db));
            tareasTodas = tareasTodas.filter(t => !archivados.has(t.proyecto));
        } catch (err) {
            const errEl = document.createElement("p");
            errEl.style.color = "var(--text-error)";
            errEl.textContent = "❌ Error leyendo tareas: " + err.message;
            layout.appendChild(errEl);
            return;
        }

        const tareasBase = proyectoFiltro
            ? tareasTodas.filter(t => t.proyecto === proyectoFiltro)
            : tareasTodas;

        const numCompletadas = tareasBase.filter(t => t.estado === "Terminado").length;
        const tareas = mostrarCompletadas
            ? tareasBase
            : tareasBase.filter(t => t.estado !== "Terminado");

        KanbanUI._renderPanelSuperior(layout, db, dbPath, onRefresh, proyectoFiltro, setProyectoFiltro);
        await KanbanUI._renderMapa(layout, tareas, proyectoFiltro, db, dbPath, onRefresh);
        KanbanUI._renderKanban(
            layout, tareas, db, dbPath, onRefresh, proyectoFiltro,
            mostrarBloqueadas, setMostrarBloqueadas,
            mostrarCompletadas, setMostrarCompletadas, numCompletadas
        );
    }
};
