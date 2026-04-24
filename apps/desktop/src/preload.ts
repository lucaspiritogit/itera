import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
	openProjectFolder: () =>
		ipcRenderer.invoke("dialog:openProjectFolder") as Promise<string | null>,
	platform: process.platform,
});
