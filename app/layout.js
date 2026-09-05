import "./globals.css";

export const metadata = {
  title: "지니어스 | JINIUS",
  description: "건물·시설 관리업무 통합 플랫폼",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
