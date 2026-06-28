import { Modal, Notice, Setting, SuggestModal } from "obsidian";

export function setupObsidianGlobals(): void {
    const w = window as typeof window & {
        Modal: typeof Modal;
        Setting: typeof Setting;
        SuggestModal: typeof SuggestModal;
        Notice: typeof Notice;
    };
    w.Modal = Modal;
    w.Setting = Setting;
    w.SuggestModal = SuggestModal;
    w.Notice = Notice;
}
