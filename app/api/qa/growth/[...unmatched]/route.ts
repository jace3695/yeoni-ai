// A mistyped fixture asset/path must not render the normal app's not-found
// layout, which includes personal-record synchronization.
export function GET() {
  return new Response('Not found', { status: 404, headers: {
    'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  } });
}
