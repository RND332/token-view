declare module 'bun:sqlite' {
  // Minimal bun:sqlite typing used for readonly queries
  export class Database {
    constructor(path: string, options?: { readonly?: boolean })
    query<T = unknown>(sql: string): { all(): T[] }
    close(): void
  }
}

declare module 'd3-sankey-circular'

declare module 'd3'
declare module 'd3-sankey'
