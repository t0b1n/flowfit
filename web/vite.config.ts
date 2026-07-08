import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/solve": "http://localhost:8000",
      "/auth": {
        target: "http://localhost:8000",
        changeOrigin: true,
        cookieDomainRewrite: "",
      },
      "/bikes": {
        target: "http://localhost:8000",
        changeOrigin: true,
        cookieDomainRewrite: "",
      },
    },
  },
});
