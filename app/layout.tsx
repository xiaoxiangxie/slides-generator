import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slides Generator · AI 幻灯片生成器",
  description: "从任意链接或文本，AI 自动生成 12 种风格的精美幻灯片。支持横屏 16:9 与竖屏 9:16 多比例输出。",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%23d4a574'/><text y='.9em' x='50%' text-anchor='middle' font-size='70' font-family='serif' font-weight='bold' fill='%230d0d0d'>S</text></svg>",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
