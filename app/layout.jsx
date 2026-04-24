import './globals.css';

export const metadata = {
  title: 'JuryMind',
  description: 'Mock Jury Simulator for Trial Attorneys',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
