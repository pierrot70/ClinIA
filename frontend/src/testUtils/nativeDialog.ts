// jsdom lacks native dialog top-layer methods. Browser behavior is also
// checked in authenticated staging; unit tests model only open/close state.
export function installNativeDialogTestSupport() {
    const prototype = HTMLDialogElement.prototype;
    const show = Object.getOwnPropertyDescriptor(prototype, "showModal");
    const close = Object.getOwnPropertyDescriptor(prototype, "close");
    Object.defineProperty(prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
    Object.defineProperty(prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute("open"); } });
    return () => {
        if (show) Object.defineProperty(prototype, "showModal", show); else Reflect.deleteProperty(prototype, "showModal");
        if (close) Object.defineProperty(prototype, "close", close); else Reflect.deleteProperty(prototype, "close");
    };
}
