/* Preferencias y utilidades de distribución del diagrama Mermaid */
// @ts-nocheck
import { Modal, Setting } from "obsidian";

const PREFIX = "vault-task-board:diagram";

export const DiagramLayout = {
    MODOS: [
        { id: "jerarquico", label: "Jerárquico", desc: "Capas clásicas según dependencias (Dagre)." },
        { id: "arbol", label: "Árbol", desc: "Raíces abajo, ramas hacia arriba." },
        { id: "arana", label: "Araña / radial", desc: "Centro morado; prerequisitos a la izquierda, siguientes a la derecha." },
        { id: "compacto", label: "Compacto", desc: "Menos espacio entre nodos." }
    ],
    DIRECCIONES: [
        { id: "TD", label: "Vertical ↓", desc: "Arriba → abajo" },
        { id: "BT", label: "Vertical ↑", desc: "Abajo → arriba" },
        { id: "LR", label: "Horizontal →", desc: "Izquierda → derecha" },
        { id: "RL", label: "Horizontal ←", desc: "Derecha → izquierda" }
    ],
    DISTRIBUCIONES: [
        { id: "vertical", label: "Apilados (vertical)", desc: "Cada diagrama debajo del anterior, a ancho completo." },
        { id: "horizontal", label: "En fila (horizontal)", desc: "Paneles de ancho fijo en una sola fila; desplazamiento horizontal si no caben." },
        { id: "cuadricula", label: "Cuadrícula", desc: "Diagramas en rejilla; cada árbol desconectado en su celda." },
        { id: "unificado", label: "Un solo diagrama", desc: "Todo en un mapa: proyectos como zonas dentro del mismo gráfico (sin bloques separados)." }
    ],
    ORDENES: [
        { id: "id", label: "Creación (ID)" },
        { id: "alfabetico", label: "Alfabético" },
        { id: "estado", label: "Estado" },
        { id: "topologico", label: "Topológico (dependencias)" },
        { id: "proyecto", label: "Proyecto" }
    ],
    CURVAS: [
        { id: "basis", label: "Curva suave" },
        { id: "linear", label: "Recta" },
        { id: "step", label: "Escalón" },
        { id: "cardinal", label: "Ortogonal" }
    ],

    _get: (key, fallback) => {
        try {
            const v = localStorage.getItem(`${PREFIX}:${key}`);
            return v ?? fallback;
        } catch {
            return fallback;
        }
    },
    _set: (key, val) => {
        try { localStorage.setItem(`${PREFIX}:${key}`, val); } catch { /* ignorar */ }
    },

    getConfig: () => ({
        modo: DiagramLayout._get("modo", "jerarquico"),
        dirFlujo: DiagramLayout._get("dir-flujo", "TD"),
        dirPadreHijo: DiagramLayout._get("dir-padre-hijo", "TD"),
        dirDiagramas: DiagramLayout._get("dir-diagramas", "vertical"),
        orden: DiagramLayout._get("orden", "topologico"),
        curva: DiagramLayout._get("curva", "basis")
    }),

    setConfig: (cfg) => {
        DiagramLayout._set("modo", cfg.modo);
        DiagramLayout._set("dir-flujo", cfg.dirFlujo);
        DiagramLayout._set("dir-padre-hijo", cfg.dirPadreHijo);
        DiagramLayout._set("dir-diagramas", cfg.dirDiagramas);
        DiagramLayout._set("orden", cfg.orden);
        DiagramLayout._set("curva", cfg.curva);
    },

    flowchartDirection: (cfg) => {
        if (cfg.modo === "arbol") return "BT";
        if (cfg.modo === "arana") return "LR";
        return cfg.dirFlujo;
    },

    mermaidSpacing: (cfg) => cfg.modo === "compacto"
        ? { nodeSpacing: 28, rankSpacing: 36, padding: 12 }
        : { nodeSpacing: 50, rankSpacing: 60, padding: 20 },

    cssDistribucionDiagramas: (dirDiagramas) => {
        if (dirDiagramas === "horizontal") return "kanban-mermaid-dist--horizontal";
        if (dirDiagramas === "cuadricula") return "kanban-mermaid-dist--grid";
        if (dirDiagramas === "unificado") return "kanban-mermaid-dist--unificado";
        return "kanban-mermaid-dist--vertical";
    },

    debeSepararBloques: (dirDiagramas) => dirDiagramas !== "unificado",

    ordenarTareas: (tareas, orden, mapa, requisitosVisibles) => {
        const copia = [...tareas];
        const pesoEstado = { "En Proceso": 0, "Por Hacer": 1, Terminado: 2 };
        const cmpTexto = (a, b) => a.texto.localeCompare(b.texto, "es");
        if (orden === "alfabetico") return copia.sort(cmpTexto);
        if (orden === "estado") {
            return copia.sort((a, b) =>
                (pesoEstado[a.estado] ?? 9) - (pesoEstado[b.estado] ?? 9) || cmpTexto(a, b));
        }
        if (orden === "proyecto") {
            return copia.sort((a, b) =>
                a.proyecto.localeCompare(b.proyecto, "es") || cmpTexto(a, b));
        }
        if (orden === "topologico") return DiagramLayout._ordenTopologico(copia, mapa, requisitosVisibles);
        return copia.sort((a, b) => a.id - b.id);
    },

    _ordenTopologico: (tareas, mapa, requisitosVisibles) => {
        const ids = new Set(tareas.map(t => t.id));
        const entrada = new Map(tareas.map(t => [t.id, 0]));
        tareas.forEach(t => {
            (requisitosVisibles(t, mapa) || []).forEach(req => {
                if (ids.has(req)) entrada.set(t.id, (entrada.get(t.id) || 0) + 1);
            });
        });
        const cola = tareas.filter(t => !entrada.get(t.id)).sort((a, b) => a.id - b.id);
        const ordenados = [];
        const vistos = new Set();
        while (cola.length) {
            const t = cola.shift();
            if (vistos.has(t.id)) continue;
            vistos.add(t.id);
            ordenados.push(t);
            tareas.forEach(hijo => {
                if (!(requisitosVisibles(hijo, mapa) || []).includes(t.id)) return;
                const n = (entrada.get(hijo.id) || 0) - 1;
                entrada.set(hijo.id, n);
                if (n === 0) cola.push(hijo);
            });
            cola.sort((a, b) => a.id - b.id);
        }
        tareas.forEach(t => { if (!vistos.has(t.id)) ordenados.push(t); });
        return ordenados;
    },

    /** Divide tareas en árboles independientes (sin flechas entre grupos). */
    componentesConexos: (tareas, mapa, requisitosVisibles) => {
        const ids = new Set(tareas.map(t => t.id));
        const porId = new Map(tareas.map(t => [t.id, t]));
        const adj = new Map(tareas.map(t => [t.id, new Set()]));

        tareas.forEach(t => {
            (requisitosVisibles(t, mapa) || []).forEach(reqId => {
                if (!ids.has(reqId)) return;
                adj.get(t.id).add(reqId);
                adj.get(reqId).add(t.id);
            });
        });

        const visitados = new Set();
        const grupos = [];
        tareas.forEach(t => {
            if (visitados.has(t.id)) return;
            const comp = [];
            const cola = [t.id];
            visitados.add(t.id);
            while (cola.length) {
                const id = cola.pop();
                comp.push(porId.get(id));
                adj.get(id).forEach(nbr => {
                    if (!visitados.has(nbr)) {
                        visitados.add(nbr);
                        cola.push(nbr);
                    }
                });
            }
            grupos.push(comp);
        });
        return grupos.sort((a, b) => b.length - a.length);
    },

    tituloComponente: (nombreProyecto, componente, indice, total, mapa, requisitosVisibles) => {
        if (total <= 1) return nombreProyecto;
        const ids = new Set(componente.map(t => t.id));
        const raices = componente.filter(t =>
            !(requisitosVisibles(t, mapa) || []).some(r => ids.has(r))
        );
        const etiqueta = raices[0]?.texto || `Árbol ${indice + 1}`;
        return `${nombreProyecto} — ${etiqueta}`;
    },

    elegirHubArana: (tareas, mapa, requisitosVisibles) => {
        const dependientes = new Map(tareas.map(t => [t.id, 0]));
        tareas.forEach(t => {
            (requisitosVisibles(t, mapa) || []).forEach(req => {
                dependientes.set(req, (dependientes.get(req) || 0) + 1);
            });
        });
        let mejor = tareas[0];
        let mejorPts = -1;
        tareas.forEach(t => {
            const pts = (requisitosVisibles(t, mapa) || []).length + (dependientes.get(t.id) || 0)
                + (t.estado === "En Proceso" ? 3 : 0);
            if (pts > mejorPts) { mejorPts = pts; mejor = t; }
        });
        return mejor;
    },

    capasArana: (tareas, mapa, hubId, requisitosVisibles) => {
        const ids = new Set(tareas.map(t => t.id));
        const porId = new Map(tareas.map(t => [t.id, t]));
        const capas = new Map();
        const asignar = (id, depth) => {
            if (!ids.has(id) || capas.has(id)) return;
            capas.set(id, depth);
            const t = porId.get(id);
            (requisitosVisibles(t, mapa) || []).forEach(req => asignar(req, depth - 1));
            tareas.forEach(h => {
                if ((requisitosVisibles(h, mapa) || []).includes(id)) asignar(h.id, depth + 1);
            });
        };
        asignar(hubId, 0);
        const agrupadas = new Map();
        tareas.forEach(t => {
            const d = capas.has(t.id) ? capas.get(t.id) : 99;
            if (!agrupadas.has(d)) agrupadas.set(d, []);
            agrupadas.get(d).push(t);
        });
        return [...agrupadas.entries()].sort((a, b) => a[0] - b[0]);
    }
};

export class DiagramaLayoutModal extends Modal {
    constructor(app, onApply) {
        super(app);
        this.onApply = onApply;
        this.cfg = DiagramLayout.getConfig();
    }

    _mkSelect(container, label, desc, opciones, valor, onChange) {
        new Setting(container)
            .setName(label)
            .setDesc(desc)
            .addDropdown(dd => {
                opciones.forEach(o => dd.addOption(o.id, o.label));
                dd.setValue(valor).onChange(v => onChange(v));
            });
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass("kanban-modal-diagrama-layout");
        contentEl.createEl("h2", { text: "📐 Distribución del diagrama", cls: "kanban-modal-tarea-titulo" });

        this._mkSelect(contentEl, "Modo de layout", "Estructura general del mapa.",
            DiagramLayout.MODOS, this.cfg.modo, v => { this.cfg.modo = v; });
        this._mkSelect(contentEl, "Flujo entre tareas", "Dirección de las flechas de dependencia.",
            DiagramLayout.DIRECCIONES, this.cfg.dirFlujo, v => { this.cfg.dirFlujo = v; });
        this._mkSelect(contentEl, "Padre → hijo (checklist)", "Cómo se distribuyen las subtareas respecto a su tarea.",
            DiagramLayout.DIRECCIONES, this.cfg.dirPadreHijo, v => { this.cfg.dirPadreHijo = v; });
        this._mkSelect(contentEl, "Entre diagramas / proyectos", "Cómo se colocan los mapas cuando hay varios proyectos.",
            DiagramLayout.DISTRIBUCIONES, this.cfg.dirDiagramas, v => { this.cfg.dirDiagramas = v; });
        this._mkSelect(contentEl, "Orden de tareas", "Secuencia al declarar nodos en el diagrama.",
            DiagramLayout.ORDENES, this.cfg.orden, v => { this.cfg.orden = v; });
        this._mkSelect(contentEl, "Estilo de conectores", "Forma de las líneas entre tareas.",
            DiagramLayout.CURVAS, this.cfg.curva, v => { this.cfg.curva = v; });

        const acciones = contentEl.createEl("div", { cls: "kanban-formulario-acciones" });
        acciones.createEl("button", { text: "Cancelar" }).onclick = () => this.close();
        acciones.createEl("button", {
            text: "Aplicar",
            style: "background: var(--interactive-accent); color: var(--text-on-accent); font-weight: bold;"
        }).onclick = () => {
            DiagramLayout.setConfig(this.cfg);
            this.onApply?.();
            this.close();
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}
