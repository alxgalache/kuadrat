'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Hook for debounced postal code validation against the API.
 * Used by both ShoppingCartDrawer and BidModal for delivery address validation.
 *
 * @param {object} options
 * @param {string} options.postalCode - The postal code to validate
 * @param {boolean} options.hasRestrictions - Whether postal code restrictions apply
 * @param {Function} options.validateFn - Async function that validates the postal code, returns { valid: boolean }
 * @param {number} [options.debounceMs=400] - Debounce delay in milliseconds
 * @param {number} [options.minLength=4] - Minimum postal code length to trigger validation
 * @returns {{ isValid: boolean|null, isChecking: boolean }}
 */
export default function usePostalCodeValidation({
  postalCode,
  hasRestrictions,
  validateFn,
  debounceMs = 400,
  minLength = 4,
}) {
  const [isValid, setIsValid] = useState(null); // null = not checked, true/false
  const [isChecking, setIsChecking] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!hasRestrictions) {
      setIsValid(true);
      return;
    }

    const code = postalCode?.trim();
    if (!code || code.length < minLength) {
      setIsValid(null);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      setIsChecking(true);
      try {
        const result = await validateFn(code);
        setIsValid(result.valid);
      } catch {
        setIsValid(null);
      } finally {
        setIsChecking(false);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [postalCode, hasRestrictions, validateFn, debounceMs, minLength]);

  return { isValid, isChecking };
}
