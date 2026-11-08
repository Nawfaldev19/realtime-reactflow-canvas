/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** The collaboration socket; defaults to /cable next to the GraphQL endpoint. */
  readonly VITE_CABLE_URL?: string;
}
