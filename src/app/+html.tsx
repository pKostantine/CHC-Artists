import type { ReactNode } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <meta name="theme-color" content="#11161B" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CHC Artists" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <style dangerouslySetInnerHTML={{ __html: 'html,body,#root{height:100%;max-height:100%;background:#11161B}body{margin:0;overflow:hidden;overscroll-behavior:none}' }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
