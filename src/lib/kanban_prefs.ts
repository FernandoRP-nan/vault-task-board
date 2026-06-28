/* Preferencias locales del Task Board (zoom, UI). */

const PREFIX = "vault-task-board";

export const KanbanPrefs = {
    diagramZoomKey: (diagramId: string): string =>
        `${PREFIX}:zoom:${encodeURIComponent(diagramId || "main")}`,

    getZoom: (key: string): number => {
        try {
            const v = parseFloat(localStorage.getItem(key) ?? "");
            return Number.isFinite(v) ? Math.min(3, Math.max(0.5, v)) : 1;
        } catch {
            return 1;
        }
    },

    setZoom: (key: string, zoom: number): void => {
        try {
            localStorage.setItem(key, String(zoom));
        } catch {
            /* sin espacio de almacenamiento */
        }
    },

    isMapaColapsado: (): boolean => {
        try {
            return localStorage.getItem(`${PREFIX}:mapa-colapsado`) === "1";
        } catch {
            return false;
        }
    },

    setMapaColapsado: (colapsado: boolean): void => {
        try {
            localStorage.setItem(`${PREFIX}:mapa-colapsado`, colapsado ? "1" : "0");
        } catch {
            /* ignorar */
        }
    }
};
