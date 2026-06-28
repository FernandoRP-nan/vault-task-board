import type { ItemView } from "obsidian";

const STYLE_PREFIX = "vault-plugin-view-scroll";

/** Prepara la vista ItemView con un contenedor interno que sí hace scroll. */
export function prepareScrollableView(
    view: ItemView,
    viewType: string,
    rootClass: string
): HTMLElement {
    injectViewScrollStyles(viewType);

    const leaf = view.containerEl.closest(".workspace-leaf-content") as HTMLElement | null;
    if (leaf) {
        leaf.style.setProperty("height", "100%", "important");
        leaf.style.setProperty("overflow", "hidden", "important");
        leaf.style.setProperty("display", "flex", "important");
        leaf.style.setProperty("flex-direction", "column", "important");
    }

    view.containerEl.empty();
    view.containerEl.addClass(`${STYLE_PREFIX}-shell`);
    view.containerEl.style.setProperty("display", "flex", "important");
    view.containerEl.style.setProperty("flex-direction", "column", "important");
    view.containerEl.style.setProperty("height", "100%", "important");
    view.containerEl.style.setProperty("overflow", "hidden", "important");
    view.containerEl.style.setProperty("padding", "0", "important");

    const host = view.containerEl.createDiv({
        cls: `${STYLE_PREFIX}-host ${rootClass}`
    });
    host.style.setProperty("overflow-y", "auto", "important");
    host.style.setProperty("overflow-x", "hidden", "important");
    host.style.setProperty("flex", "1 1 auto", "important");
    host.style.setProperty("min-height", "0", "important");
    host.style.setProperty("height", "100%", "important");
    host.style.setProperty("max-height", "100%", "important");
    host.style.setProperty("padding", "16px 20px 28px", "important");
    host.style.setProperty("box-sizing", "border-box", "important");
    host.style.setProperty("-webkit-overflow-scrolling", "touch");

    return host;
}

export function injectViewScrollStyles(viewType: string): void {
    const id = `${STYLE_PREFIX}-${viewType}`;
    if (document.getElementById(id)) return;

    const el = document.createElement("style");
    el.id = id;
    el.textContent = `
        .mod-root .workspace-tabs .workspace-leaf,
        .mod-root .workspace-tabs .workspace-leaf-content[data-type="${viewType}"] {
            height: 100% !important;
        }
        .workspace-leaf-content[data-type="${viewType}"] {
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
        }
        .${STYLE_PREFIX}-shell {
            flex: 1 1 auto !important;
            min-height: 0 !important;
        }
        .${STYLE_PREFIX}-host {
            overscroll-behavior: contain;
        }
        .${STYLE_PREFIX}-host::-webkit-scrollbar { width: 10px; }
        .${STYLE_PREFIX}-host::-webkit-scrollbar-thumb {
            background: var(--background-modifier-border);
            border-radius: 8px;
        }
        .modal .suggestion-container,
        .modal.mod-suggestion .prompt-results,
        .prompt .suggestion-container {
            max-height: min(70vh, 560px) !important;
            overflow-y: auto !important;
            overscroll-behavior: contain !important;
        }
    `;
    document.head.appendChild(el);
}
