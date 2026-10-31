import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Geist, Geist_Mono } from 'next/font/google';
import { cn } from '@/lib/utils';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: { default: 'Slotwise: open-source appointment booking', template: '%s | Slotwise' },
  description:
    'Open-source booking engine for UK appointment businesses. One script tag, no double-bookings, correct across clock changes.',
};

export const viewport: Viewport = { themeColor: '#f6f7f9' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={cn('font-sans antialiased', geist.variable, geistMono.variable)}>
      <body>{children}</body>
    </html>
  );
}
