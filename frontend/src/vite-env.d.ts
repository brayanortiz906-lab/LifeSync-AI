/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void; auto_select?: boolean; cancel_on_tap_outside?: boolean; use_fedcm_for_prompt?: boolean }) => void;
          renderButton: (element: HTMLElement, options: { type: string; theme: string; size: string; text: string; shape: string; logo_alignment: string; width: string | number; locale: string }) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}
