import type { ReactNode } from 'react';

export const metadata = {
  title: 'KMKT Social AI',
  description: 'KMKT Social AI — technical bootstrap scaffold.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          margin: 0,
          padding: '2rem',
        }}
      >
        {children}
      </body>
    </html>
  );
}
