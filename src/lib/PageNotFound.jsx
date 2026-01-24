import React from 'react';
import { Link } from 'react-router-dom';

const PageNotFound = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
    <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
    <p className="text-gray-600 mb-8">Page not found</p>
    <Link to="/" className="text-indigo-600 hover:text-indigo-800 font-medium">
      Go back home
    </Link>
  </div>
);
export default PageNotFound;