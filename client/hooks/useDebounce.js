'use client';

import { useState, useEffect } from 'react';

/**
 * Hook that debounces a value by the specified delay.
 * @param {*} value - The value to debounce
 * @param {number} delay - Delay in milliseconds (default: 400)
 * @returns {*} The debounced value
 */
export default function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
