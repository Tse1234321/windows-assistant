import React from 'react';

export default function SkeletonState({ rows = 3 }) {
  return (
    <div className="skeleton-state">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="skeleton-row" key={index} />
      ))}
    </div>
  );
}
