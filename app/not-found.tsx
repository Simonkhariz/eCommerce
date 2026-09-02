import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4 py-16">
      <h1 className="font-integral text-5xl sm:text-7xl font-black text-black mb-4">
        404
      </h1>
      <h2 className="text-xl sm:text-2xl font-bold text-black mb-3">
        Page Not Found
      </h2>
      <p className="text-sm sm:text-base text-neutral-500 max-w-md mb-8">
        Sorry, the page you are looking for doesn&apos;t exist or has been moved. Explore our catalog to find what you need.
      </p>
      <Link
        href="/"
        className="bg-black text-white hover:bg-neutral-800 font-semibold px-8 py-3.5 rounded-full text-sm transition-colors shadow-md"
      >
        Back to Homepage
      </Link>
    </div>
  );
}
