import { Link } from 'react-router-dom';

const PageNotFound = () => (
  <div className="flex flex-col items-center justify-center min-h-dvh bg-gray-50 p-4 text-center">
    <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
    <p className="text-gray-600 mb-8">Page not found</p>
    <Link to="/" className="inline-flex h-10 items-center rounded-lg bg-indigo-600 px-4 font-medium text-white hover:bg-indigo-700">
      Back to trips
    </Link>
  </div>
);
export default PageNotFound;