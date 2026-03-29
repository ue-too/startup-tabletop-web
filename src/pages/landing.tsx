import { Link } from 'react-router';

export function LandingPage() {
    return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4">
            <h1 className="text-4xl font-bold">Startup Web Browser</h1>
            <Link
                to="/app"
                className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
            >
                Get Started
            </Link>
        </div>
    );
}
