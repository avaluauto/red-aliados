/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Red Aliados' own Supabase project URL. Unset until task 2.1's Third-Party
   *  Auth config is completed against a real project (see
   *  supabase/THIRD_PARTY_AUTH.md). */
  readonly VITE_SUPABASE_URL?: string;
  /** Red Aliados' own Supabase project anon key. Same caveat as above. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
