import "./globals.css";

export const metadata = {
  title: "지니어스 | JINIUS",
  description: "건물·시설 관리업무 통합 플랫폼",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "지니어스",
  },
  icons: {
    icon: "/icons/icon-512.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#004cd4",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
