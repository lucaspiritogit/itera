import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { registerCodexStdioIpc } from "./codexStdio";

if (started) {
	app.quit();
}

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
	mainWindow = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
		mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
	} else {
		mainWindow.loadFile(
			path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
		);
	}

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
};

ipcMain.handle("dialog:openProjectFolder", async (event) => {
	const parent = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
	const options: Electron.OpenDialogOptions = {
		properties: ["openDirectory"],
		title: "Open project folder",
	};
	if (parent && !parent.isDestroyed()) {
		parent.show();
		parent.focus();
		const result = await dialog.showOpenDialog(parent, options);
		if (result.canceled || result.filePaths.length === 0) {
			return null;
		}
		return result.filePaths[0];
	}
	const result = await dialog.showOpenDialog(options);
	if (result.canceled || result.filePaths.length === 0) {
		return null;
	}
	return result.filePaths[0];
});

registerCodexStdioIpc();

app.on("ready", createWindow);

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});
