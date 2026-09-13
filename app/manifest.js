export default function manifest() {
  return {
    name: "지니어스 JINIUS",
    short_name: "지니어스",
    description: "건물·시설 관리업무 통합 플랫폼",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f8",
    theme_color: "#004cd4",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
