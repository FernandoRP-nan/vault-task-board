/* Viewport fijo: pan/zoom por transform, minimapa, sin scrollbars. */
// @ts-nocheck
import { KanbanPrefs } from "./kanban_prefs";

const MIN_Z = 0.5;
const MAX_Z = 3;
const STEP = 0.25;
const MINI_W = 128;
const MINI_H = 84;
const MARGEN_BOUNDS = 28;
const UMBRAL_MINIMAP = 40;

function conMargenBounds(bb, pad = MARGEN_BOUNDS) {
    return {
        x: bb.x - pad,
        y: bb.y - pad,
        w: bb.width + pad * 2,
        h: bb.height + pad * 2
    };
}

function calcularBoundsDiagrama(svg) {
    const root = svg.querySelector("g.root") || svg.querySelector(":scope > g");
    if (root) {
        try {
            const bb = root.getBBox();
            if (bb.width > 2 && bb.height > 2) return conMargenBounds(bb);
        } catch { /* fallback abajo */ }
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let n = 0;

    const incluir = (bb) => {
        if (!bb || !Number.isFinite(bb.width) || !Number.isFinite(bb.height)) return;
        if (bb.width <= 0.5 && bb.height <= 0.5) return;
        n += 1;
        minX = Math.min(minX, bb.x);
        minY = Math.min(minY, bb.y);
        maxX = Math.max(maxX, bb.x + bb.width);
        maxY = Math.max(maxY, bb.y + bb.height);
    };

    svg.querySelectorAll("g.node, g.cluster, g.subgraph, foreignObject").forEach(el => {
        try { incluir(el.getBBox()); } catch { /* sin geometría */ }
    });

    if (n > 0) {
        return conMargenBounds({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    }

    try {
        return conMargenBounds(svg.getBBox());
    } catch {
        const vb = svg.viewBox?.baseVal;
        return conMargenBounds({
            x: vb?.x ?? 0,
            y: vb?.y ?? 0,
            width: Math.max(vb?.width ?? 100, 1),
            height: Math.max(vb?.height ?? 100, 1)
        });
    }
}

export function montarStageDiagrama() {
    const viewport = document.createElement("div");
    viewport.className = "kanban-mermaid-viewport";

    const stage = document.createElement("div");
    stage.className = "kanban-mermaid-stage";

    const svgHost = document.createElement("div");
    svgHost.className = "kanban-mermaid-svg";
    stage.appendChild(svgHost);

    const minimap = document.createElement("div");
    minimap.className = "kanban-mermaid-minimap";
    minimap.title = "Minimapa · clic para mover la vista";

    const miniInner = document.createElement("div");
    miniInner.className = "kanban-mermaid-minimap-inner";
    const miniLens = document.createElement("div");
    miniLens.className = "kanban-mermaid-minimap-lens";

    minimap.appendChild(miniInner);
    minimap.appendChild(miniLens);
    viewport.appendChild(stage);
    viewport.appendChild(minimap);

    return { viewport, stage, svgHost, minimap, miniInner, miniLens };
}

export function inicializarViewportDiagrama(viewport, stage, svgHost, minimap, miniInner, miniLens, opts = {}) {
    const { zoomStorageKey, label } = opts;
    let zoom = zoomStorageKey ? KanbanPrefs.getZoom(zoomStorageKey) : 1;
    let panX = 0;
    let panY = 0;
    let baseX = 0;
    let baseY = 0;
    let baseW = 0;
    let baseH = 0;
    let miniScale = 1;
    let panActivo = false;
    let panPointerId = null;
    let panOrigen = { x: 0, y: 0, panX: 0, panY: 0 };

    const notificar = () => {
        if (label) label.textContent = `${Math.round(zoom * 100)}%`;
        svgHost.dataset.kanbanZoom = String(zoom);
        svgHost.dispatchEvent(new CustomEvent("kanban-mermaid-resize", { detail: { zoom } }));
    };

    const guardarSvgOriginal = (svg) => {
        if (svg.dataset.kanbanOrigViewBox) return;
        const vb = svg.viewBox?.baseVal;
        if (vb?.width) {
            svg.dataset.kanbanOrigViewBox = `${vb.x} ${vb.y} ${vb.width} ${vb.height}`;
        } else {
            svg.dataset.kanbanOrigViewBox = svg.getAttribute("viewBox") || "0 0 100 100";
        }
    };

    const restaurarSvgParaMedir = (svg) => {
        guardarSvgOriginal(svg);
        svg.setAttribute("viewBox", svg.dataset.kanbanOrigViewBox);
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.style.transform = "";
        svg.style.width = "";
        svg.style.height = "";
    };

    const aplicarVentanaContenido = () => {
        const svg = svgHost.querySelector("svg");
        if (!svg || !baseW || !baseH) return;
        svg.setAttribute("viewBox", `${baseX} ${baseY} ${baseW} ${baseH}`);
        svg.setAttribute("width", String(Math.ceil(baseW)));
        svg.setAttribute("height", String(Math.ceil(baseH)));
        svg.style.display = "block";
        svg.style.maxWidth = "none";
        svg.style.width = `${baseW}px`;
        svg.style.height = `${baseH}px`;
        svg.style.transform = "none";
        svgHost.style.width = `${baseW}px`;
        svgHost.style.height = `${baseH}px`;
        svgHost.style.overflow = "visible";
    };

    const medirContenido = () => {
        stage.style.transform = "none";
        const svg = svgHost.querySelector("svg");
        if (!svg) {
            baseX = 0;
            baseY = 0;
            baseW = 1;
            baseH = 1;
            return;
        }
        restaurarSvgParaMedir(svg);
        const b = calcularBoundsDiagrama(svg);
        baseX = b.x;
        baseY = b.y;
        baseW = b.w;
        baseH = b.h;
        aplicarVentanaContenido();
    };

    const syncMinimapSvg = () => {
        miniInner.textContent = "";
        if (!baseW || !baseH) return;

        const svg = svgHost.querySelector("svg");
        if (!svg) return;

        const clone = svg.cloneNode(true);
        clone.setAttribute("viewBox", `${baseX} ${baseY} ${baseW} ${baseH}`);
        clone.setAttribute("width", String(baseW));
        clone.setAttribute("height", String(baseH));
        clone.style.width = `${baseW}px`;
        clone.style.height = `${baseH}px`;
        clone.style.display = "block";
        miniInner.appendChild(clone);

        miniScale = Math.min(MINI_W / baseW, MINI_H / baseH);
        miniInner.style.width = `${baseW}px`;
        miniInner.style.height = `${baseH}px`;
        miniInner.style.transform = `scale(${miniScale})`;
    };

    const calcularZoomAjuste = () => {
        const vpW = viewport.clientWidth || 1;
        const vpH = viewport.clientHeight || 1;
        const margen = 28;
        return Math.min(1, (vpW - margen) / baseW, (vpH - margen) / baseH);
    };

    const contenidoDesborda = () => {
        const vpW = viewport.clientWidth || 1;
        const vpH = viewport.clientHeight || 1;
        return baseW * zoom > vpW + UMBRAL_MINIMAP || baseH * zoom > vpH + UMBRAL_MINIMAP;
    };

    const clampPan = ({ centrar = false } = {}) => {
        const vpW = viewport.clientWidth;
        const vpH = viewport.clientHeight;
        const z = zoom;
        const cw = baseW * z;
        const ch = baseH * z;

        if (centrar) {
            panX = (vpW - cw) / 2;
            panY = (vpH - ch) / 2;
        }

        if (cw <= vpW) panX = (vpW - cw) / 2;
        else panX = Math.min(0, Math.max(vpW - cw, panX));

        if (ch <= vpH) panY = (vpH - ch) / 2;
        else panY = Math.min(0, Math.max(vpH - ch, panY));
    };

    const debeMostrarMinimapa = () => {
        if (!baseW || !baseH) return false;
        return contenidoDesborda();
    };

    const actualizarMinimapa = () => {
        if (!debeMostrarMinimapa()) {
            minimap.classList.add("kanban-minimap-oculto");
            return;
        }
        minimap.classList.remove("kanban-minimap-oculto");

        const vpW = viewport.clientWidth || 1;
        const vpH = viewport.clientHeight || 1;
        const visLeft = (-panX) / zoom;
        const visTop = (-panY) / zoom;
        const lensX = visLeft * miniScale;
        const lensY = visTop * miniScale;
        const lensW = (vpW / zoom) * miniScale;
        const lensH = (vpH / zoom) * miniScale;

        miniLens.style.left = `${Math.max(0, Math.min(MINI_W - 6, lensX))}px`;
        miniLens.style.top = `${Math.max(0, Math.min(MINI_H - 6, lensY))}px`;
        miniLens.style.width = `${Math.max(8, Math.min(MINI_W - lensX, lensW))}px`;
        miniLens.style.height = `${Math.max(8, Math.min(MINI_H - lensY, lensH))}px`;
    };

    const aplicarVista = ({ recentrar = false, persistirZoom = true } = {}) => {
        if (!baseW || !baseH) medirContenido();
        clampPan({ centrar: recentrar });

        stage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
        stage.style.transformOrigin = "0 0";

        actualizarMinimapa();
        if (zoomStorageKey && persistirZoom) {
            KanbanPrefs.setZoom(zoomStorageKey, zoom);
        }
        notificar();
    };

    const zoomEnPunto = (delta, clientX, clientY) => {
        const rect = viewport.getBoundingClientRect();
        const mx = clientX - rect.left;
        const my = clientY - rect.top;
        const prev = zoom;
        zoom = Math.min(MAX_Z, Math.max(MIN_Z, +(zoom + delta).toFixed(2)));
        if (zoom === prev) return;
        const ratio = zoom / prev;
        panX = mx - ratio * (mx - panX);
        panY = my - ratio * (my - panY);
        aplicarVista();
    };

    const moverPan = (e) => {
        if (!panActivo) return;
        if (panPointerId != null && e.pointerId !== panPointerId) return;
        panX = panOrigen.panX + (e.clientX - panOrigen.x);
        panY = panOrigen.panY + (e.clientY - panOrigen.y);
        aplicarVista();
    };

    const terminarPan = (e) => {
        if (!panActivo) return;
        if (e && panPointerId != null && e.pointerId !== panPointerId) return;
        panActivo = false;
        panPointerId = null;
        viewport.classList.remove("kanban-mermaid-panning");
        document.removeEventListener("pointermove", moverPan);
        document.removeEventListener("pointerup", terminarPan);
        document.removeEventListener("pointercancel", terminarPan);
        document.removeEventListener("mousemove", moverPanMouse);
        document.removeEventListener("mouseup", terminarPanMouse);
        if (typeof e?.pointerId === "number" && viewport.releasePointerCapture) {
            try { viewport.releasePointerCapture(e.pointerId); } catch { /* webview */ }
        }
    };

    const esBotonPan = (e) =>
        e.button === 1 || e.buttons === 4 || (e.button === 0 && e.altKey);

    const moverPanMouse = (e) => {
        if (!panActivo) return;
        panX = panOrigen.panX + (e.clientX - panOrigen.x);
        panY = panOrigen.panY + (e.clientY - panOrigen.y);
        aplicarVista();
    };

    const terminarPanMouse = (e) => {
        document.removeEventListener("mousemove", moverPanMouse);
        document.removeEventListener("mouseup", terminarPanMouse);
        terminarPan(e);
    };

    const iniciarPanDesde = (e) => {
        if (panActivo) return;
        panActivo = true;
        panPointerId = e.pointerId ?? null;
        panOrigen = { x: e.clientX, y: e.clientY, panX, panY };
        viewport.classList.add("kanban-mermaid-panning");
        document.addEventListener("pointermove", moverPan);
        document.addEventListener("pointerup", terminarPan);
        document.addEventListener("pointercancel", terminarPan);
        document.addEventListener("mousemove", moverPanMouse);
        document.addEventListener("mouseup", terminarPanMouse);
        if (typeof e.pointerId === "number" && viewport.setPointerCapture) {
            try { viewport.setPointerCapture(e.pointerId); } catch { /* webview */ }
        }
    };

    const onPointerDownPan = (e) => {
        if (!esBotonPan(e)) return;
        if (e.target.closest(".kanban-mermaid-minimap")) return;
        e.preventDefault();
        e.stopPropagation();
        iniciarPanDesde(e);
    };

    const onMouseDownPan = (e) => {
        if (e.button !== 1 && !(e.button === 0 && e.altKey)) return;
        if (e.target.closest(".kanban-mermaid-minimap")) return;
        e.preventDefault();
        e.stopPropagation();
        iniciarPanDesde(e);
    };

    const enlazarPan = (el) => {
        if (!el) return;
        el.addEventListener("pointerdown", onPointerDownPan, { capture: true });
        el.addEventListener("mousedown", onMouseDownPan, { capture: true });
    };

    enlazarPan(viewport);
    enlazarPan(stage);
    enlazarPan(svgHost);

    viewport.addEventListener("auxclick", (e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        e.stopPropagation();
    }, { capture: true });

    viewport.addEventListener("wheel", (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            zoomEnPunto(e.deltaY < 0 ? STEP : -STEP, e.clientX, e.clientY);
            return;
        }
        panX -= e.deltaX;
        panY -= e.deltaY;
        aplicarVista();
    }, { passive: false });

    viewport.addEventListener("mousedown", (e) => {
        if (e.button !== 1) return;
        if (e.target.closest(".kanban-mermaid-minimap")) return;
        e.preventDefault();
        e.stopPropagation();
    }, { capture: true });

    const irMinimapa = (clientX, clientY) => {
        const rect = minimap.getBoundingClientRect();
        const mx = clientX - rect.left;
        const my = clientY - rect.top;
        if (mx < 0 || my < 0 || mx > MINI_W || my > MINI_H) return;
        const cx = mx / miniScale;
        const cy = my / miniScale;
        const vpW = viewport.clientWidth;
        const vpH = viewport.clientHeight;
        panX = vpW / 2 - cx * zoom;
        panY = vpH / 2 - cy * zoom;
        aplicarVista();
    };

    minimap.addEventListener("pointerdown", (e) => {
        if (!debeMostrarMinimapa()) return;
        e.preventDefault();
        e.stopPropagation();
        irMinimapa(e.clientX, e.clientY);
        if (e.button === 0 || e.button === 1) iniciarPanDesde(e);
    });

    window.addEventListener("resize", () => {
        medirContenido();
        syncMinimapSvg();
        aplicarVista();
    });

    return {
        getZoom: () => zoom,
        setZoom: (z) => { zoom = z; aplicarVista({ recentrar: true }); },
        resetVista: () => {
            if (baseW && baseH) {
                zoom = Math.min(MAX_Z, Math.max(MIN_Z, +calcularZoomAjuste().toFixed(2)));
            } else {
                zoom = 1;
            }
            aplicarVista({ recentrar: true });
        },
        enlazarCapaPan: (capa) => enlazarPan(capa),
        zoomIn: () => {
            const r = viewport.getBoundingClientRect();
            zoomEnPunto(STEP, r.left + r.width / 2, r.top + r.height / 2);
        },
        zoomOut: () => {
            const r = viewport.getBoundingClientRect();
            zoomEnPunto(-STEP, r.left + r.width / 2, r.top + r.height / 2);
        },
        iniciar: () => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    medirContenido();
                    syncMinimapSvg();
                    zoom = +Math.min(MAX_Z, Math.max(MIN_Z, calcularZoomAjuste())).toFixed(2);
                    aplicarVista({ recentrar: true });
                });
            });
        }
    };
}
