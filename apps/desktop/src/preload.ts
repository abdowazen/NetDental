import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("clinicConnection", {
  retry: () => ipcRenderer.invoke("connection:retry"),
  language: (language: "en" | "fr") =>
    ipcRenderer.invoke("connection:language", language),
  state: () => ipcRenderer.invoke("connection:state"),
  onState: (listener: (state: unknown) => void) => {
    const receive = (_event: Electron.IpcRendererEvent, state: unknown) => listener(state);
    ipcRenderer.on("connection:update", receive);
    return () => ipcRenderer.removeListener("connection:update", receive);
  },
});
