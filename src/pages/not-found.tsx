import { Link } from 'react-router';

export function NotFoundPage() {
    return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4">
            <h1 className="text-4xl font-bold">404</h1>
            <p className="text-lg text-gray-500">Page not found</p>
            <Link
                to="/"
                className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
            >
                Go Home
            </Link>
        </div>
    );
}
