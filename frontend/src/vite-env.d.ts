/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SOCKET_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Bridge exposed by Electron preload (printing, etc.)
interface Window {
  electronAPI?: {
    print: (payload: { html: string; type: string; deviceName?: string }) => Promise<{ ok: boolean }>;
    listPrinters: () => Promise<{ name: string; isDefault: boolean }[]>;
    getVersion: () => Promise<string>;
  };
}
