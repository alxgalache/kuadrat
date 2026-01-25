import { NextResponse } from 'next/server'

export function proxy(request) {
  const isPublished = process.env.PUBLISHED_VISIBLE === 'true' || process.env.PUBLISHED_VISIBLE === '1'

  // If the app is not published, redirect all non-root routes to root
  if (!isPublished && request.nextUrl.pathname !== '/') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

// Configure which routes the proxy should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
