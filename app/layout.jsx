import './globals.css';

export const metadata = {
  title: 'ScholarMind',
  description: 'Multi-Agent AI Researcher Debate Simulator',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
