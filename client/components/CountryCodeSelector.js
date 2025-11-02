'use client'

import { useState } from 'react'

// Common countries with their phone codes and flag emojis
const countries = [
  { code: '+34', name: 'España', flag: '🇪🇸', iso: 'ES' },
  { code: '+1', name: 'Estados Unidos', flag: '🇺🇸', iso: 'US' },
  { code: '+44', name: 'Reino Unido', flag: '🇬🇧', iso: 'GB' },
  { code: '+33', name: 'Francia', flag: '🇫🇷', iso: 'FR' },
  { code: '+49', name: 'Alemania', flag: '🇩🇪', iso: 'DE' },
  { code: '+39', name: 'Italia', flag: '🇮🇹', iso: 'IT' },
  { code: '+351', name: 'Portugal', flag: '🇵🇹', iso: 'PT' },
  { code: '+31', name: 'Países Bajos', flag: '🇳🇱', iso: 'NL' },
  { code: '+32', name: 'Bélgica', flag: '🇧🇪', iso: 'BE' },
  { code: '+41', name: 'Suiza', flag: '🇨🇭', iso: 'CH' },
  { code: '+43', name: 'Austria', flag: '🇦🇹', iso: 'AT' },
  { code: '+45', name: 'Dinamarca', flag: '🇩🇰', iso: 'DK' },
  { code: '+46', name: 'Suecia', flag: '🇸🇪', iso: 'SE' },
  { code: '+47', name: 'Noruega', flag: '🇳🇴', iso: 'NO' },
  { code: '+358', name: 'Finlandia', flag: '🇫🇮', iso: 'FI' },
  { code: '+48', name: 'Polonia', flag: '🇵🇱', iso: 'PL' },
  { code: '+420', name: 'República Checa', flag: '🇨🇿', iso: 'CZ' },
  { code: '+36', name: 'Hungría', flag: '🇭🇺', iso: 'HU' },
  { code: '+30', name: 'Grecia', flag: '🇬🇷', iso: 'GR' },
  { code: '+353', name: 'Irlanda', flag: '🇮🇪', iso: 'IE' },
  { code: '+52', name: 'México', flag: '🇲🇽', iso: 'MX' },
  { code: '+54', name: 'Argentina', flag: '🇦🇷', iso: 'AR' },
  { code: '+55', name: 'Brasil', flag: '🇧🇷', iso: 'BR' },
  { code: '+56', name: 'Chile', flag: '🇨🇱', iso: 'CL' },
  { code: '+57', name: 'Colombia', flag: '🇨🇴', iso: 'CO' },
  { code: '+58', name: 'Venezuela', flag: '🇻🇪', iso: 'VE' },
  { code: '+51', name: 'Perú', flag: '🇵🇪', iso: 'PE' },
  { code: '+593', name: 'Ecuador', flag: '🇪🇨', iso: 'EC' },
  { code: '+81', name: 'Japón', flag: '🇯🇵', iso: 'JP' },
  { code: '+82', name: 'Corea del Sur', flag: '🇰🇷', iso: 'KR' },
  { code: '+86', name: 'China', flag: '🇨🇳', iso: 'CN' },
  { code: '+91', name: 'India', flag: '🇮🇳', iso: 'IN' },
  { code: '+61', name: 'Australia', flag: '🇦🇺', iso: 'AU' },
  { code: '+64', name: 'Nueva Zelanda', flag: '🇳🇿', iso: 'NZ' },
  { code: '+27', name: 'Sudáfrica', flag: '🇿🇦', iso: 'ZA' },
  { code: '+20', name: 'Egipto', flag: '🇪🇬', iso: 'EG' },
  { code: '+234', name: 'Nigeria', flag: '🇳🇬', iso: 'NG' },
  { code: '+212', name: 'Marruecos', flag: '🇲🇦', iso: 'MA' },
]

export default function CountryCodeSelector({ value, onChange, disabled = false }) {
  const selectedCountry = countries.find(c => c.code === value) || countries[0]

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="block w-full rounded-md border border-gray-300 bg-white py-2 pl-3 pr-8 text-sm text-gray-900 focus:border-black focus:ring-2 focus:ring-black disabled:opacity-50 appearance-none"
        style={{ minWidth: '140px' }}
      >
        {countries.map((country) => (
          <option key={country.iso} value={country.code}>
            {country.flag} {country.code} {country.name}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  )
}
