import { ItemView, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { ScriptsRuntime } from "./runtime/scripts-runtime";
import { KanbanDB } from "./lib/kanban_db";
import { KanbanUI } from "./lib/kanban_ui";
import { KanbanModals } from "./lib/kanban_modals";
import { abrirBusquedaTareas } from "./lib/kanban_search";
import { prepareScrollableView } from "./lib/view-scroll";
import { TaskBoardBridgeFactory } from "./lib/task-board-bridge";
import type { TaskBoardApi } from "./types";

import "./lib/kanban_modals";

const PLUGIN_ID = "vault-task-board";
const PLUGIN_ROOT = `.obsidian/plugins/${PLUGIN_ID}`;
const LEGACY_DB = ".obsidian/scripts/kanban_tareas.db";

export const VIEW_TYPE = "vault-task-board-dashboard";

export default class TaskBoardPlugin extends Plugin {
    api!: TaskBoardApi;
    private viewRef: TaskBoardView | null = null;

    async onload(): Promise<void> {
        KanbanUI.configure(this.app);

        ScriptsRuntime.configure(this.app, {
            sqlJsRel: `${PLUGIN_ROOT}/assets/sql-wasm.js`,
            sqlWasmRel: `${PLUGIN_ROOT}/assets/sql-wasm.wasm`
        });

        if (await ScriptsRuntime.migrarArchivoBinario(LEGACY_DB, KanbanDB.DB_RELATIVE)) {
            new Notice("Task Board: base de datos migrada a plugins-data.");
        }

        this.api = TaskBoardBridgeFactory(() => this.sql) as TaskBoardApi;

        this.registerView(VIEW_TYPE, (leaf) => {
            this.viewRef = new TaskBoardView(leaf, this);
            return this.viewRef;
        });
        this.addRibbonIcon("layout-dashboard", "Task Board", () => this.activateView());
        this.addCommand({
            id: "open-dashboard",
            name: "Abrir tablero de tareas",
            callback: () => this.activateView()
        });
        this.addCommand({
            id: "new-task",
            name: "Task Board: Nueva tarea",
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "t" }],
            callback: () => void this.abrirNuevaTarea()
        });
        this.addCommand({
            id: "search-tasks",
            name: "Task Board: Buscar tareas",
            hotkeys: [{ modifiers: ["Mod", "Shift"], key: "f" }],
            callback: () => void this.abrirBusquedaTareas()
        });

        this.app.workspace.onLayoutReady(() => {
            this.app.workspace.trigger("vault-task-board:ready" as never);
        });
    }

    private sql: unknown = null;

    async ensureSql(): Promise<unknown> {
        if (!this.sql) this.sql = await ScriptsRuntime.initSqlJs();
        return this.sql;
    }

    private async activateView(): Promise<void> {
        let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
        if (!leaf) {
            leaf = this.app.workspace.getLeaf(true);
            await leaf.setViewState({ type: VIEW_TYPE, active: true });
        }
        this.app.workspace.revealLeaf(leaf);
    }

    async abrirNuevaTarea(): Promise<void> {
        await this.activateView();
        this.viewRef?.abrirModalNuevaTarea();
    }

    async abrirBusquedaTareas(): Promise<void> {
        await this.activateView();
        this.viewRef?.abrirBusquedaTareas();
    }
}

interface UiAcciones {
    db: unknown;
    dbPath: string;
    refrescarTrasMutacion: () => Promise<void>;
    proyectoFiltro: string;
}

class TaskBoardView extends ItemView {
    private proyectoFiltro = "";
    private mostrarBloqueadas = true;
    private mostrarCompletadas = true;
    private scrollHost: HTMLElement | null = null;
    private ejecutarDashboard: (() => Promise<void>) | null = null;
    private omitirProximoChanged = false;
    private uiAcciones: UiAcciones | null = null;

    constructor(leaf: WorkspaceLeaf, private plugin: TaskBoardPlugin) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Task Board";
    }

    getIcon(): string {
        return "layout-dashboard";
    }

    abrirModalNuevaTarea(): void {
        const ctx = this.uiAcciones;
        if (!ctx) {
            new Notice("Task Board: espera a que cargue el tablero.");
            return;
        }
        new KanbanModals.TareaFormModal(
            this.app, ctx.db, ctx.dbPath, null, ctx.refrescarTrasMutacion, ctx.proyectoFiltro
        ).open();
    }

    abrirBusquedaTareas(): void {
        const ctx = this.uiAcciones;
        if (!ctx) {
            new Notice("Task Board: espera a que cargue el tablero.");
            return;
        }
        abrirBusquedaTareas(
            this.app, ctx.db, ctx.dbPath, ctx.refrescarTrasMutacion, KanbanUI._abrirEdicionTarea
        );
    }

    async onOpen(): Promise<void> {
        await this.inicializarVista();
        this.registerEvent(
            // @ts-expect-error evento personalizado
            this.app.workspace.on("vault-task-board:changed", () => {
                if (this.omitirProximoChanged) {
                    this.omitirProximoChanged = false;
                    return;
                }
                void this.ejecutarDashboard?.();
            })
        );
    }

    async onClose(): Promise<void> {
        this.scrollHost = null;
        this.uiAcciones = null;
        this.containerEl.empty();
    }

    private getScrollRoot(): HTMLElement {
        if (!this.scrollHost?.isConnected) {
            this.scrollHost = prepareScrollableView(
                this,
                VIEW_TYPE,
                "vault-task-board-root"
            );
        }
        return this.scrollHost;
    }

    private async inicializarVista(): Promise<void> {
        const root = this.getScrollRoot();
        root.empty();

        try {
            const SQL = await this.plugin.ensureSql();
            const dbPath = KanbanDB.DB_RELATIVE;
            if (!ScriptsRuntime.puedeUsarFs()) {
                await ScriptsRuntime.leerBinarioAsync(dbPath);
            }
            let db = await KanbanDB.init(SQL, dbPath);
            KanbanUI.injectStyles();

            const ejecutar = async () => {
                db = await KanbanDB.init(SQL, dbPath);
                root.empty();
                await KanbanUI.renderDashboard(
                    root, db, dbPath, refrescarTrasMutacion,
                    this.proyectoFiltro,
                    (p: string) => { this.proyectoFiltro = p; void ejecutar(); },
                    this.mostrarBloqueadas,
                    (v: boolean) => { this.mostrarBloqueadas = v; void ejecutar(); },
                    this.mostrarCompletadas,
                    (v: boolean) => { this.mostrarCompletadas = v; void ejecutar(); }
                );
                if (this.uiAcciones) {
                    this.uiAcciones.db = db;
                    this.uiAcciones.proyectoFiltro = this.proyectoFiltro;
                }
            };

            const refrescarTrasMutacion = async () => {
                await ejecutar();
                this.omitirProximoChanged = true;
                this.plugin.api.emitChange(this.app);
            };

            this.uiAcciones = {
                db,
                dbPath,
                refrescarTrasMutacion,
                proyectoFiltro: this.proyectoFiltro
            };
            this.ejecutarDashboard = ejecutar;
            await ejecutar();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            root.createEl("p", { text: `❌ Error: ${msg}` });
            new Notice("Task Board: error al cargar.");
        }
    }
}

export type { TaskBoardApi };
