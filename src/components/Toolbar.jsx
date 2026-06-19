import React from 'react';

export default function Toolbar({ children, align = 'between' }) {
  return <div className={`toolbar ${align}`}>{children}</div>;
}
