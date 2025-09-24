/**
 * Minimal Vite environment declarations so TypeScript recognizes import.meta.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
