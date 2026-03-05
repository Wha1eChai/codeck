import { resolve } from "path"
import { defineConfig, externalizeDepsPlugin } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@codeck/config', '@codeck/sessions', '@codeck/provider', '@codeck/agent-core'] })],
    resolve: {
      alias: {
        "@common": resolve("src/common"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@common": resolve("src/common"),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@common": resolve("src/common"),
        "@renderer": resolve("src/renderer"),
      },
    },
    plugins: [tailwindcss(), react()],
  },
})
