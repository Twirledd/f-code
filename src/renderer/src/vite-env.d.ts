/// <reference types="vite/client" />

declare module '*?worker' {
  const WorkerFactory: new () => Worker
  export default WorkerFactory
}

declare const __APP_VERSION__: string
