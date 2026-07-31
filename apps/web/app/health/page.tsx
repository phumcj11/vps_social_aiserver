/**
 * Basic health page for the web app.
 * Static, self-contained: no data fetching, no external API calls, no auth.
 */
export const dynamic = 'force-static';

export default function HealthPage() {
  return (
    <main>
      <h1>Web Health</h1>
      <p>status: ok</p>
      <p>service: kmkt-web</p>
    </main>
  );
}
